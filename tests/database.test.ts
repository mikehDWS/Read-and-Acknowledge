// Checks the database rules that protect the audit trail. Needs a migrated database:
//   TEST_DATABASE_URL=postgres://... npm test
// Each test runs in a transaction that is rolled back.
import pg from "pg";
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("acknowledgements table", () => {
  let client: pg.Client;
  let docId: string;
  let userId: string;
  let adminId: string;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: url });
    await client.connect();
  });
  afterAll(async () => {
    await client?.end();
  });

  beforeEach(async () => {
    await client.query("BEGIN");
    const users = await client.query(
      `INSERT INTO users (name, email, role) VALUES ('Reader', 'r@example.com', 'reader'), ('Admin', 'a@example.com', 'admin')
       RETURNING id`,
    );
    [userId, adminId] = users.rows.map((r) => r.id);
    const doc = await client.query(
      "INSERT INTO documents (name, link_token) VALUES ('Policy', 'tok_' || gen_random_uuid()) RETURNING id",
    );
    docId = doc.rows[0].id;
  });
  afterEach(async () => {
    await client.query("ROLLBACK");
  });

  async function sign(): Promise<string> {
    const { rows } = await client.query(
      `INSERT INTO acknowledgements (document_id, user_id, signer_name, signer_email, document_name, statement_text)
       VALUES ($1, $2, 'Reader', 'r@example.com', 'Policy', 'I have read and understood this document.') RETURNING id`,
      [docId, userId],
    );
    return rows[0].id;
  }

  async function expectError(sql: string, params: unknown[], match: RegExp) {
    await client.query("SAVEPOINT s");
    await expect(client.query(sql, params)).rejects.toThrow(match);
    await client.query("ROLLBACK TO SAVEPOINT s");
  }

  it("rejects deletes and truncates", async () => {
    const id = await sign();
    await expectError("DELETE FROM acknowledgements WHERE id = $1", [id], /append-only/);
    await expectError("TRUNCATE acknowledgements CASCADE", [], /append-only/);
  });

  it("rejects edits to the record", async () => {
    const id = await sign();
    await expectError("UPDATE acknowledgements SET signer_name = 'Someone else' WHERE id = $1", [id], /voided/);
    await expectError("UPDATE acknowledgements SET acknowledged_at = now() - interval '1 day' WHERE id = $1", [id], /voided/);
  });

  it("allows one void with a reason, then freezes the row", async () => {
    const id = await sign();
    await expectError(
      "UPDATE acknowledgements SET voided_at = now(), voided_by = $2, void_reason = '  ' WHERE id = $1",
      [id, adminId],
      /reason/,
    );
    await client.query(
      "UPDATE acknowledgements SET voided_at = now(), voided_by = $2, void_reason = 'Signed by mistake' WHERE id = $1",
      [id, adminId],
    );
    await expectError("UPDATE acknowledgements SET void_reason = 'changed' WHERE id = $1", [id], /cannot be changed/);
  });

  it("allows one live acknowledgement per person, and a new one after a void", async () => {
    const id = await sign();
    await client.query("SAVEPOINT s");
    await expect(sign()).rejects.toThrow(/acknowledgements_live_key/);
    await client.query("ROLLBACK TO SAVEPOINT s");
    await client.query(
      "UPDATE acknowledgements SET voided_at = now(), voided_by = $2, void_reason = 'Wrong person' WHERE id = $1",
      [id, adminId],
    );
    await expect(sign()).resolves.toBeTypeOf("string");
  });

  it("keeps records when someone tries to delete the person or document", async () => {
    await sign();
    await expectError("DELETE FROM users WHERE id = $1", [userId], /foreign key/);
    await expectError("DELETE FROM documents WHERE id = $1", [docId], /foreign key/);
  });

  it("protects the signer's department on a record", async () => {
    const id = await sign();
    await expectError("UPDATE acknowledgements SET signer_department = 'Humber' WHERE id = $1", [id], /voided/);
  });

  it("expects everyone at a document's departments, including people who join later", async () => {
    const { rows } = await client.query("SELECT id, name FROM departments ORDER BY sort_order");
    expect(rows.map((r) => r.name)).toEqual([
      "Head Office", "Ferrybridge", "Tuebrook", "Stirling", "Bardon",
      "Isle of Grain", "Humber", "Port Talbot", "Llanwern", "Milford Haven",
      "Engineering", "Health and Safety", "Purchasing", "Operations Management", "Fleet Control",
    ]);
    const ferrybridge = rows[1].id;
    const humber = rows[6].id;
    const expected = async () =>
      (await client.query("SELECT user_id, individual FROM document_signers WHERE document_id = $1 ORDER BY user_id", [docId])).rows;

    await client.query("INSERT INTO document_departments (document_id, department_id) VALUES ($1, $2)", [docId, ferrybridge]);
    expect(await expected()).toEqual([]);

    await client.query("UPDATE users SET department_id = $2 WHERE id = $1", [userId, ferrybridge]);
    expect(await expected()).toEqual([{ user_id: userId, individual: false }]);

    // Added by name as well: listed once, marked individual.
    await client.query("INSERT INTO expected_signers (document_id, user_id) VALUES ($1, $2)", [docId, userId]);
    expect(await expected()).toEqual([{ user_id: userId, individual: true }]);
    await client.query("DELETE FROM expected_signers WHERE document_id = $1", [docId]);

    // Moving to a department that isn't selected takes them off the list.
    await client.query("UPDATE users SET department_id = $2 WHERE id = $1", [userId, humber]);
    expect(await expected()).toEqual([]);
  });

  it("has the three document categories and protects a record's category", async () => {
    const { rows } = await client.query("SELECT name FROM document_categories ORDER BY sort_order");
    expect(rows.map((r) => r.name)).toEqual(["Customer", "Internal Engineering", "Internal Health and Safety"]);
    const id = await sign();
    await expectError("UPDATE acknowledgements SET document_category = 'Customer' WHERE id = $1", [id], /voided/);
  });

  it("protects a record's signature", async () => {
    const id = await sign();
    await expectError(
      "UPDATE acknowledgements SET signature_png = '\\x89504e47'::bytea, signature_method = 'drawn' WHERE id = $1",
      [id],
      /voided/,
    );
  });

  it("records who gave a briefing, for people without an email, and protects it", async () => {
    const person = await client.query("INSERT INTO users (name) VALUES ('No Login') RETURNING id");
    const { rows } = await client.query(
      `INSERT INTO acknowledgements (document_id, user_id, signer_name, signer_email, document_name, statement_text,
                                     briefed_by, briefed_by_name)
       VALUES ($1, $2, 'No Login', NULL, 'Policy', 'Statement', $3, 'Admin') RETURNING id`,
      [docId, person.rows[0].id, adminId],
    );
    await expectError("UPDATE acknowledgements SET briefed_by_name = 'Someone else' WHERE id = $1", [rows[0].id], /voided/);
    await expectError(
      `INSERT INTO acknowledgements (document_id, user_id, signer_name, document_name, statement_text, briefed_by)
       VALUES ($1, $2, 'Reader', 'Policy', 'Statement', $3)`,
      [docId, userId, adminId],
      /briefer_named/,
    );
  });

  it("only accepts web links for document locations", async () => {
    await expectError("UPDATE documents SET location_url = 'javascript:alert(1)' WHERE id = $1", [docId], /check/);
  });
});
