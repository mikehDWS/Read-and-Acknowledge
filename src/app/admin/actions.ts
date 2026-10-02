"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAccountLink } from "@/lib/account-links";
import { audit } from "@/lib/audit";
import { isUniqueViolation, query, queryOne, transaction, type Queryable } from "@/lib/db";
import { findOutstation, listOutstations, outstationIdFrom, type Outstation } from "@/lib/outstations";
import { parsePeopleList, type ParsedPerson, type ParseProblem } from "@/lib/people";
import { appBaseUrl } from "@/lib/request";
import { assertAdmin, endAllSessions } from "@/lib/session";
import { newToken } from "@/lib/tokens";
import { isEmail, isUuid, optionalDate, optionalText, optionalWebUrl, text } from "@/lib/validation";

// ---------- Documents ----------

export type DocumentFormState = { error?: string; saved?: boolean };

type DocumentFields = {
  name: string;
  description: string | null;
  version_label: string | null;
  due_date: string | null;
  location_url: string | null;
};

function readDocumentFields(form: FormData): DocumentFields | string {
  const name = text(form, "name", 200);
  if (!name) return "Give the document a name.";
  const due = optionalDate(text(form, "due_date", 10));
  if (due === undefined) return "Enter the due date as a valid date.";
  const url = optionalWebUrl(text(form, "location_url", 2000));
  if (url === undefined) return "The document location must be a web address starting with http:// or https://.";
  return {
    name,
    description: optionalText(form, "description", 4000),
    version_label: optionalText(form, "version_label", 100),
    due_date: due,
    location_url: url,
  };
}

export async function createDocument(_prev: DocumentFormState, form: FormData): Promise<DocumentFormState> {
  const admin = await assertAdmin();
  const fields = readDocumentFields(form);
  if (typeof fields === "string") return { error: fields };

  const id = await transaction(async (db) => {
    const [doc] = await query<{ id: string }>(
      `INSERT INTO documents (name, description, version_label, due_date, location_url, link_token, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [fields.name, fields.description, fields.version_label, fields.due_date, fields.location_url, newToken(), admin.id],
      db,
    );
    await audit(db, admin.id, "document.create", "document", doc.id, { name: fields.name });
    await saveDocumentOutstations(db, doc.id, await selectedOutstations(form, db), admin.id);
    return doc.id;
  });
  revalidatePath("/admin");
  redirect(`/admin/documents/${id}`);
}

export async function updateDocument(_prev: DocumentFormState, form: FormData): Promise<DocumentFormState> {
  const admin = await assertAdmin();
  const id = text(form, "id", 36);
  if (!isUuid(id)) return { error: "Document not found." };
  const fields = readDocumentFields(form);
  if (typeof fields === "string") return { error: fields };

  const updated = await transaction(async (db) => {
    const rows = await query(
      `UPDATE documents SET name = $2, description = $3, version_label = $4, due_date = $5,
              location_url = $6, updated_at = now()
        WHERE id = $1 RETURNING id`,
      [id, fields.name, fields.description, fields.version_label, fields.due_date, fields.location_url],
      db,
    );
    if (rows.length) await audit(db, admin.id, "document.update", "document", id, fields);
    return rows.length > 0;
  });
  if (!updated) return { error: "Document not found." };
  revalidatePath(`/admin/documents/${id}`);
  revalidatePath("/admin");
  return { saved: true };
}

export async function setDocumentStatus(form: FormData): Promise<void> {
  const admin = await assertAdmin();
  const id = text(form, "id", 36);
  const status = text(form, "status", 10);
  if (!isUuid(id) || (status !== "open" && status !== "closed")) return;
  await transaction(async (db) => {
    const rows = await query(
      "UPDATE documents SET status = $2, updated_at = now() WHERE id = $1 RETURNING id",
      [id, status],
      db,
    );
    if (rows.length) await audit(db, admin.id, status === "closed" ? "document.close" : "document.reopen", "document", id);
  });
  revalidatePath(`/admin/documents/${id}`);
  revalidatePath("/admin");
}

/** The outstation ids ticked on a form, keeping only real outstations. */
async function selectedOutstations(form: FormData, db: Queryable): Promise<number[]> {
  const valid = new Set((await listOutstations(db)).map((o) => o.id));
  return [...new Set(form.getAll("outstation_ids").map(Number))].filter((id) => valid.has(id));
}

async function saveDocumentOutstations(db: Queryable, documentId: string, ids: number[], actorId: string) {
  const before = await query<{ outstation_id: number }>(
    "SELECT outstation_id FROM document_outstations WHERE document_id = $1",
    [documentId],
    db,
  );
  await query(
    "DELETE FROM document_outstations WHERE document_id = $1 AND NOT (outstation_id = ANY($2::int[]))",
    [documentId, ids],
    db,
  );
  await query(
    `INSERT INTO document_outstations (document_id, outstation_id)
     SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING`,
    [documentId, ids],
    db,
  );
  const old = before.map((r) => r.outstation_id).sort();
  if (old.join() !== [...ids].sort().join()) {
    await audit(db, actorId, "document.outstations", "document", documentId, { outstation_ids: ids });
  }
}

export type OutstationsFormState = { error?: string; saved?: boolean };

export async function setDocumentOutstations(
  _prev: OutstationsFormState,
  form: FormData,
): Promise<OutstationsFormState> {
  const admin = await assertAdmin();
  const documentId = text(form, "document_id", 36);
  if (!isUuid(documentId)) return { error: "Document not found." };
  const found = await transaction(async (db) => {
    const doc = await queryOne("SELECT 1 FROM documents WHERE id = $1 FOR UPDATE", [documentId], db);
    if (!doc) return false;
    await saveDocumentOutstations(db, documentId, await selectedOutstations(form, db), admin.id);
    return true;
  });
  if (!found) return { error: "Document not found." };
  revalidatePath(`/admin/documents/${documentId}`);
  revalidatePath("/admin");
  revalidatePath("/my");
  return { saved: true };
}

// ---------- People ----------

export type AddPeopleState = {
  error?: string;
  summary?: { added: number; alreadyListed: number; newAccounts: number };
  problems?: ParseProblem[];
};

/**
 * Finds or creates reader accounts for each email; returns their ids and how many were new.
 * An outstation named on a person's line wins; otherwise `defaultOutstationId` is used for new
 * people and for existing people who don't have an outstation yet.
 */
async function upsertPeople(
  db: Queryable,
  people: ParsedPerson[],
  actorId: string,
  outstations: Outstation[],
  defaultOutstationId: number | null,
): Promise<{ ids: string[]; created: number }> {
  const ids: string[] = [];
  let created = 0;
  for (const person of people) {
    const named = person.outstation ? findOutstation(person.outstation, outstations)?.id ?? null : null;
    const existing = await queryOne<{ id: string; outstation_id: number | null }>(
      "SELECT id, outstation_id FROM users WHERE lower(email) = $1",
      [person.email],
      db,
    );
    if (existing) {
      const next = named ?? (existing.outstation_id === null ? defaultOutstationId : null);
      if (next !== null && next !== existing.outstation_id) {
        await query("UPDATE users SET outstation_id = $2, updated_at = now() WHERE id = $1", [existing.id, next], db);
        await audit(db, actorId, "user.outstation", "user", existing.id, { outstation_id: next });
      }
      ids.push(existing.id);
      continue;
    }
    const [user] = await query<{ id: string }>(
      "INSERT INTO users (name, email, outstation_id) VALUES ($1, $2, $3) RETURNING id",
      [person.name, person.email, named ?? defaultOutstationId],
      db,
    );
    await audit(db, actorId, "user.create", "user", user.id, { email: person.email });
    ids.push(user.id);
    created += 1;
  }
  return { ids, created };
}

export async function addSigners(_prev: AddPeopleState, form: FormData): Promise<AddPeopleState> {
  const admin = await assertAdmin();
  const documentId = text(form, "document_id", 36);
  if (!isUuid(documentId)) return { error: "Document not found." };
  const outstations = await listOutstations();
  const defaultOutstation = outstationIdFrom(form.get("outstation_id"), outstations);
  if (defaultOutstation === undefined) return { error: "Choose an outstation from the list." };
  const { people, problems } = parsePeopleList(text(form, "people", 500_000), outstations.map((o) => o.name));
  if (people.length === 0) {
    return { error: problems.length ? "No valid lines found." : "Add at least one person.", problems };
  }

  const summary = await transaction(async (db) => {
    const doc = await queryOne("SELECT 1 FROM documents WHERE id = $1 FOR UPDATE", [documentId], db);
    if (!doc) return null;
    const { ids, created } = await upsertPeople(db, people, admin.id, outstations, defaultOutstation);
    // People already expected through one of the document's outstations count as already listed.
    const inserted = await query(
      `INSERT INTO expected_signers (document_id, user_id)
       SELECT $1, u FROM unnest($2::uuid[]) AS u
        WHERE NOT EXISTS (SELECT 1 FROM document_signers ds WHERE ds.document_id = $1 AND ds.user_id = u)
       ON CONFLICT DO NOTHING RETURNING user_id`,
      [documentId, ids],
      db,
    );
    await audit(db, admin.id, "signers.add", "document", documentId, { count: inserted.length });
    return { added: inserted.length, alreadyListed: ids.length - inserted.length, newAccounts: created };
  });
  if (!summary) return { error: "Document not found." };
  revalidatePath(`/admin/documents/${documentId}`);
  revalidatePath("/admin");
  return { summary, problems };
}

export async function removeSigner(form: FormData): Promise<void> {
  const admin = await assertAdmin();
  const documentId = text(form, "document_id", 36);
  const userId = text(form, "user_id", 36);
  if (!isUuid(documentId) || !isUuid(userId)) return;
  await transaction(async (db) => {
    const rows = await query(
      "DELETE FROM expected_signers WHERE document_id = $1 AND user_id = $2 RETURNING user_id",
      [documentId, userId],
      db,
    );
    if (rows.length) await audit(db, admin.id, "signers.remove", "document", documentId, { user_id: userId });
  });
  revalidatePath(`/admin/documents/${documentId}`);
  revalidatePath("/admin");
}

/** Lets an admin put themselves on a document's list so they can acknowledge it too. */
export async function addMeAsSigner(form: FormData): Promise<void> {
  const admin = await assertAdmin();
  const documentId = text(form, "document_id", 36);
  if (!isUuid(documentId)) return;
  const linkToken = await transaction(async (db) => {
    const doc = await queryOne<{ link_token: string }>(
      "SELECT link_token FROM documents WHERE id = $1 FOR UPDATE",
      [documentId],
      db,
    );
    if (!doc) return null;
    const added = await query(
      `INSERT INTO expected_signers (document_id, user_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING RETURNING user_id`,
      [documentId, admin.id],
      db,
    );
    if (added.length) await audit(db, admin.id, "signers.add_self", "document", documentId);
    return doc.link_token;
  });
  if (!linkToken) return;
  revalidatePath(`/admin/documents/${documentId}`);
  revalidatePath("/admin");
  revalidatePath("/my");
  if (text(form, "then", 10) === "sign") redirect(`/sign/${linkToken}`);
}

export async function addPeople(_prev: AddPeopleState, form: FormData): Promise<AddPeopleState> {
  const admin = await assertAdmin();
  const outstations = await listOutstations();
  const defaultOutstation = outstationIdFrom(form.get("outstation_id"), outstations);
  if (defaultOutstation === undefined) return { error: "Choose an outstation from the list." };
  const { people, problems } = parsePeopleList(text(form, "people", 500_000), outstations.map((o) => o.name));
  if (people.length === 0) {
    return { error: problems.length ? "No valid lines found." : "Add at least one person.", problems };
  }
  const { ids, created } = await transaction((db) =>
    upsertPeople(db, people, admin.id, outstations, defaultOutstation),
  );
  revalidatePath("/admin/people");
  return { summary: { added: created, alreadyListed: ids.length - created, newAccounts: created }, problems };
}

export type PersonFormState = { error?: string; saved?: boolean };

export async function updatePerson(_prev: PersonFormState, form: FormData): Promise<PersonFormState> {
  const admin = await assertAdmin();
  const id = text(form, "id", 36);
  const name = text(form, "name", 200);
  const email = text(form, "email", 254).toLowerCase();
  const employeeId = optionalText(form, "employee_id", 100);
  const outstationId = outstationIdFrom(form.get("outstation_id"), await listOutstations());
  if (!isUuid(id)) return { error: "Person not found." };
  if (outstationId === undefined) return { error: "Choose an outstation from the list." };
  if (!name) return { error: "Enter a name." };
  if (!isEmail(email)) return { error: "Enter a valid email address." };
  try {
    await transaction(async (db) => {
      await query(
        `UPDATE users SET name = $2, email = $3, employee_id = $4, outstation_id = $5, updated_at = now()
          WHERE id = $1`,
        [id, name, email, employeeId, outstationId],
        db,
      );
      await audit(db, admin.id, "user.update", "user", id, {
        name,
        email,
        employee_id: employeeId,
        outstation_id: outstationId,
      });
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "Someone else already uses that email address." };
    throw err;
  }
  revalidatePath("/admin/people");
  revalidatePath("/admin");
  return { saved: true };
}

export async function setRole(form: FormData): Promise<void> {
  const admin = await assertAdmin();
  const id = text(form, "id", 36);
  const role = text(form, "role", 10);
  if (!isUuid(id) || (role !== "admin" && role !== "reader")) return;
  if (id === admin.id && role !== "admin") return; // admins can't remove their own access

  await transaction(async (db) => {
    // Serialise role changes so two admins can't demote each other at once.
    await db.query("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE");
    if (role === "reader") {
      const admins = await queryOne<{ n: number }>(
        "SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND id <> $1",
        [id],
        db,
      );
      if (!admins || admins.n === 0) return;
    }
    const rows = await query("UPDATE users SET role = $2, updated_at = now() WHERE id = $1 AND role <> $2 RETURNING id", [id, role], db);
    if (rows.length) {
      await endAllSessions(id, db);
      await audit(db, admin.id, "user.role", "user", id, { role });
    }
  });
  revalidatePath("/admin/people");
}

export type AccountLinkState = { error?: string; url?: string; purpose?: "setup" | "reset" };

export async function createPersonLink(_prev: AccountLinkState, form: FormData): Promise<AccountLinkState> {
  const admin = await assertAdmin();
  const id = text(form, "id", 36);
  if (!isUuid(id)) return { error: "Person not found." };
  const result = await transaction(async (db) => {
    const user = await queryOne<{ has_password: boolean }>(
      "SELECT password_hash IS NOT NULL AS has_password FROM users WHERE id = $1 FOR UPDATE",
      [id],
      db,
    );
    if (!user) return null;
    const purpose = user.has_password ? "reset" : "setup";
    const token = await createAccountLink(db, id, purpose, admin.id);
    await audit(db, admin.id, `account_link.${purpose}`, "user", id);
    return { token, purpose } as const;
  });
  if (!result) return { error: "Person not found." };
  return { url: `${appBaseUrl(await headers())}/account/${result.token}`, purpose: result.purpose };
}

// ---------- Acknowledgements ----------

export type VoidState = { error?: string };

export async function voidAcknowledgement(_prev: VoidState, form: FormData): Promise<VoidState> {
  const admin = await assertAdmin();
  const id = text(form, "id", 36);
  const reason = text(form, "reason", 1000);
  if (!isUuid(id)) return { error: "Acknowledgement not found." };
  if (!reason) return { error: "Give a reason for voiding." };

  const documentId = await transaction(async (db) => {
    const rows = await query<{ document_id: string }>(
      `UPDATE acknowledgements SET voided_at = now(), voided_by = $2, void_reason = $3
        WHERE id = $1 AND voided_at IS NULL RETURNING document_id`,
      [id, admin.id, reason],
      db,
    );
    if (rows.length) await audit(db, admin.id, "acknowledgement.void", "acknowledgement", id, { reason });
    return rows[0]?.document_id ?? null;
  });
  if (!documentId) return { error: "This acknowledgement was already voided." };
  revalidatePath(`/admin/documents/${documentId}`);
  revalidatePath("/admin");
  return {};
}
