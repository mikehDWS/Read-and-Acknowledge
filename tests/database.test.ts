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

  it("only accepts web links for document locations", async () => {
    await expectError("UPDATE documents SET location_url = 'javascript:alert(1)' WHERE id = $1", [docId], /check/);
  });
});
