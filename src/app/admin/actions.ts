"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAccountLink } from "@/lib/account-links";
import { audit } from "@/lib/audit";
import { isUniqueViolation, query, queryOne, transaction, type Queryable } from "@/lib/db";
import {
  findDepartment,
  idsFrom,
  listCategories,
  listDepartments,
  departmentIdFrom,
  type Department,
} from "@/lib/departments";
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
  category_id: number;
};

async function readDocumentFields(form: FormData): Promise<DocumentFields | string> {
  const name = text(form, "name", 200);
  if (!name) return "Give the document a name.";
  const categoryId = Number(text(form, "category_id", 10));
  if (!(await listCategories()).some((c) => c.id === categoryId)) return "Choose a category.";
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
    category_id: categoryId,
  };
}

export async function createDocument(_prev: DocumentFormState, form: FormData): Promise<DocumentFormState> {
  const admin = await assertAdmin();
  const fields = await readDocumentFields(form);
  if (typeof fields === "string") return { error: fields };

  const id = await transaction(async (db) => {
    const [doc] = await query<{ id: string }>(
      `INSERT INTO documents (name, description, version_label, due_date, location_url, category_id, link_token, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        fields.name,
        fields.description,
        fields.version_label,
        fields.due_date,
        fields.location_url,
        fields.category_id,
        newToken(),
        admin.id,
      ],
      db,
    );
    await audit(db, admin.id, "document.create", "document", doc.id, { name: fields.name });
    await saveDocumentGroups(db, doc.id, form, admin.id);
    return doc.id;
  });
  revalidatePath("/admin");
  redirect(`/admin/documents/${id}`);
}

export async function updateDocument(_prev: DocumentFormState, form: FormData): Promise<DocumentFormState> {
  const admin = await assertAdmin();
  const id = text(form, "id", 36);
  if (!isUuid(id)) return { error: "Document not found." };
  const fields = await readDocumentFields(form);
  if (typeof fields === "string") return { error: fields };

  const updated = await transaction(async (db) => {
    const rows = await query(
      `UPDATE documents SET name = $2, description = $3, version_label = $4, due_date = $5,
              location_url = $6, category_id = $7, updated_at = now()
        WHERE id = $1 RETURNING id`,
      [id, fields.name, fields.description, fields.version_label, fields.due_date, fields.location_url, fields.category_id],
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

/** Replaces a document's departments with the ones ticked on the form. */
async function saveDocumentGroups(db: Queryable, documentId: string, form: FormData, actorId: string) {
  const departmentIds = idsFrom(form, "department_ids", await listDepartments(db));
  if (await replaceSet(db, "document_departments", "department_id", documentId, departmentIds)) {
    await audit(db, actorId, "document.groups", "document", documentId, { department_ids: departmentIds });
  }
}

/** Makes a document's rows in a link table match `ids`; returns 1 if anything changed. */
async function replaceSet(
  db: Queryable,
  table: "document_departments",
  column: "department_id",
  documentId: string,
  ids: number[],
): Promise<number> {
  const removed = await query(
    `DELETE FROM ${table} WHERE document_id = $1 AND NOT (${column} = ANY($2::int[])) RETURNING ${column}`,
    [documentId, ids],
    db,
  );
  const added = await query(
    `INSERT INTO ${table} (document_id, ${column}) SELECT $1, unnest($2::int[])
     ON CONFLICT DO NOTHING RETURNING ${column}`,
    [documentId, ids],
    db,
  );
  return removed.length + added.length > 0 ? 1 : 0;
}

export type DepartmentsFormState = { error?: string; saved?: boolean };

export async function setDocumentDepartments(
  _prev: DepartmentsFormState,
  form: FormData,
): Promise<DepartmentsFormState> {
  const admin = await assertAdmin();
  const documentId = text(form, "document_id", 36);
  if (!isUuid(documentId)) return { error: "Document not found." };
  const found = await transaction(async (db) => {
    const doc = await queryOne("SELECT 1 FROM documents WHERE id = $1 FOR UPDATE", [documentId], db);
    if (!doc) return false;
    await saveDocumentGroups(db, documentId, form, admin.id);
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
 * A department named on a person's line wins; otherwise `defaultDepartmentId` is used for new
 * people and for existing people who don't have a department yet.
 */
async function upsertPeople(
  db: Queryable,
  people: ParsedPerson[],
  actorId: string,
  departments: Department[],
  defaultDepartmentId: number | null,
): Promise<{ ids: string[]; created: number }> {
  const ids: string[] = [];
  let created = 0;
  for (const person of people) {
    const named = person.department ? findDepartment(person.department, departments)?.id ?? null : null;
    const existing = await queryOne<{ id: string; department_id: number | null }>(
      "SELECT id, department_id FROM users WHERE lower(email) = $1",
      [person.email],
      db,
    );
    if (existing) {
      const next = named ?? (existing.department_id === null ? defaultDepartmentId : null);
      if (next !== null && next !== existing.department_id) {
        await query("UPDATE users SET department_id = $2, updated_at = now() WHERE id = $1", [existing.id, next], db);
        await audit(db, actorId, "user.department", "user", existing.id, { department_id: next });
      }
      ids.push(existing.id);
      continue;
    }
    const [user] = await query<{ id: string }>(
      "INSERT INTO users (name, email, department_id) VALUES ($1, $2, $3) RETURNING id",
      [person.name, person.email, named ?? defaultDepartmentId],
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
  const departments = await listDepartments();
  const defaultDepartment = departmentIdFrom(form.get("department_id"), departments);
  if (defaultDepartment === undefined) return { error: "Choose a department from the list." };
  const { people, problems } = parsePeopleList(text(form, "people", 500_000), departments.map((o) => o.name));
  if (people.length === 0) {
    return { error: problems.length ? "No valid lines found." : "Add at least one person.", problems };
  }

  const summary = await transaction(async (db) => {
    const doc = await queryOne("SELECT 1 FROM documents WHERE id = $1 FOR UPDATE", [documentId], db);
    if (!doc) return null;
    const { ids, created } = await upsertPeople(db, people, admin.id, departments, defaultDepartment);
    // People already expected through one of the document's departments count as already listed.
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
  const departments = await listDepartments();
  const defaultDepartment = departmentIdFrom(form.get("department_id"), departments);
  if (defaultDepartment === undefined) return { error: "Choose a department from the list." };
  const { people, problems } = parsePeopleList(text(form, "people", 500_000), departments.map((o) => o.name));
  if (people.length === 0) {
    return { error: problems.length ? "No valid lines found." : "Add at least one person.", problems };
  }
  const { ids, created } = await transaction((db) =>
    upsertPeople(db, people, admin.id, departments, defaultDepartment),
  );
  revalidatePath("/admin/people");
  return { summary: { added: created, alreadyListed: ids.length - created, newAccounts: created }, problems };
}

export type PersonFormState = { error?: string; saved?: boolean };

export async function updatePerson(_prev: PersonFormState, form: FormData): Promise<PersonFormState> {
  const admin = await assertAdmin();
  const id = text(form, "id", 36);
  const name = text(form, "name", 200);
  const email = text(form, "email", 254).toLowerCase() || null;
  const employeeId = optionalText(form, "employee_id", 100);
  const isSupervisor = form.get("is_supervisor") === "yes";
  const departments = await listDepartments();
  const departmentId = departmentIdFrom(form.get("department_id"), departments);
  const managesIds = idsFrom(form, "manages_ids", departments);
  if (!isUuid(id)) return { error: "Person not found." };
  if (departmentId === undefined) return { error: "Choose a department from the list." };
  if (!name) return { error: "Enter a name." };
  if (email !== null && !isEmail(email)) return { error: "Enter a valid email address, or leave it blank." };
  try {
    await transaction(async (db) => {
      const current = await queryOne<{ password_hash: string | null }>(
        "SELECT password_hash FROM users WHERE id = $1",
        [id],
        db,
      );
      if (current?.password_hash && email === null) throw new Error("NEEDS_EMAIL");
      await query(
        `UPDATE users SET name = $2, email = $3, employee_id = $4, department_id = $5, is_supervisor = $6,
                updated_at = now()
          WHERE id = $1`,
        [id, name, email, employeeId, departmentId, isSupervisor],
        db,
      );
      await query(
        "DELETE FROM department_managers WHERE user_id = $1 AND NOT (department_id = ANY($2::int[]))",
        [id, managesIds],
        db,
      );
      await query(
        `INSERT INTO department_managers (department_id, user_id)
         SELECT unnest($2::int[]), $1 ON CONFLICT DO NOTHING`,
        [id, managesIds],
        db,
      );
      await audit(db, admin.id, "user.update", "user", id, {
        name,
        email,
        employee_id: employeeId,
        department_id: departmentId,
        manages_department_ids: managesIds,
        is_supervisor: isSupervisor,
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "NEEDS_EMAIL") {
      return { error: "This person signs in with their email, so it can't be removed." };
    }
    if (isUniqueViolation(err)) return { error: "Someone else already uses that email address." };
    throw err;
  }
  revalidatePath("/admin/people");
  revalidatePath("/admin");
  revalidatePath("/team");
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
    const user = await queryOne<{ has_password: boolean; has_email: boolean }>(
      "SELECT password_hash IS NOT NULL AS has_password, email IS NOT NULL AS has_email FROM users WHERE id = $1 FOR UPDATE",
      [id],
      db,
    );
    if (!user) return null;
    if (!user.has_email) return "no-email" as const;
    const purpose = user.has_password ? "reset" : "setup";
    const token = await createAccountLink(db, id, purpose, admin.id);
    await audit(db, admin.id, `account_link.${purpose}`, "user", id);
    return { token, purpose } as const;
  });
  if (!result) return { error: "Person not found." };
  if (result === "no-email") return { error: "Add an email address first; they sign in with it." };
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
