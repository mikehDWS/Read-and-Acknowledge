"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { isUniqueViolation, query, queryOne, transaction } from "@/lib/db";
import { briefingDepartments } from "@/lib/departments";
import { clientIp, userAgent } from "@/lib/request";
import { getCurrentUser } from "@/lib/session";
import { readSignature } from "@/lib/signature";
import { ACKNOWLEDGEMENT_STATEMENT } from "@/lib/statement";
import { isUuid, optionalText, text } from "@/lib/validation";

export type BriefingState = { error?: string; signed?: { name: string; at: string }; round?: number };

/** Records one person's signature, given on the briefer's device during a briefing. */
export async function recordBriefing(prev: BriefingState, form: FormData): Promise<BriefingState> {
  const briefer = await getCurrentUser();
  if (!briefer) return { error: "Your session has ended. Sign in again." };
  const departments = await briefingDepartments(briefer.id);
  if (departments.length === 0) return { error: "Only managers and supervisors can run briefings." };
  const allowed = new Set(departments.map((d) => d.id));

  const documentId = text(form, "document_id", 36);
  const personId = text(form, "person_id", 36);
  if (!isUuid(documentId)) return { error: "Document not found." };

  const signature = readSignature(
    String(form.get("signature") ?? ""),
    String(form.get("signature_method") ?? ""),
    String(form.get("typed_name") ?? ""),
  );
  if (typeof signature === "string") return { error: signature };

  // Either someone already in People, or someone new who doesn't have an account.
  let newPerson: { name: string; departmentId: number; employeeId: string | null } | null = null;
  if (personId === "new") {
    const name = text(form, "new_name", 200);
    const departmentId = Number(text(form, "new_department_id", 10));
    if (!name) return { error: "Enter the person's full name." };
    if (!allowed.has(departmentId)) return { error: "Choose one of your departments." };
    newPerson = { name, departmentId, employeeId: optionalText(form, "new_employee_id", 100) };
  } else if (!isUuid(personId)) {
    return { error: "Choose who is signing." };
  }

  const h = await headers();
  try {
    const result = await transaction(async (db) => {
      const doc = await queryOne<{ id: string; name: string; version_label: string | null; status: string; category: string | null }>(
        `SELECT d.id, d.name, d.version_label, d.status, c.name AS category
           FROM documents d LEFT JOIN document_categories c ON c.id = d.category_id
          WHERE d.id = $1 FOR SHARE OF d`,
        [documentId],
        db,
      );
      if (!doc) return { error: "Document not found." };
      if (doc.status !== "open") return { error: "This document is no longer accepting acknowledgements." };

      let person: { id: string; name: string; email: string | null; department_id: number | null; department: string | null };
      if (newPerson) {
        const [created] = await query<{ id: string }>(
          "INSERT INTO users (name, department_id, employee_id) VALUES ($1, $2, $3) RETURNING id",
          [newPerson.name, newPerson.departmentId, newPerson.employeeId],
          db,
        );
        await audit(db, briefer.id, "user.create_at_briefing", "user", created.id, { name: newPerson.name });
        person = {
          id: created.id,
          name: newPerson.name,
          email: null,
          department_id: newPerson.departmentId,
          department: departments.find((d) => d.id === newPerson!.departmentId)!.name,
        };
      } else {
        const found = await queryOne<typeof person>(
          `SELECT u.id, u.name, u.email, u.department_id, d.name AS department
             FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = $1`,
          [personId],
          db,
        );
        if (!found || found.department_id === null || !allowed.has(found.department_id)) {
          return { error: "You can only brief people in your departments." };
        }
        person = found;
      }

      // Make sure they're on the document's list, by name if their department isn't ticked.
      await query(
        `INSERT INTO expected_signers (document_id, user_id)
         SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM document_signers WHERE document_id = $1 AND user_id = $2)
         ON CONFLICT DO NOTHING`,
        [doc.id, person.id],
        db,
      );
      const [ack] = await query<{ acknowledged_at: Date }>(
        `INSERT INTO acknowledgements
           (document_id, user_id, signer_name, signer_email, signer_department, document_name, document_category,
            version_label, statement_text, ip_address, user_agent, signature_png, signature_method,
            signature_typed_name, briefed_by, briefed_by_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         RETURNING acknowledged_at`,
        [
          doc.id,
          person.id,
          person.name,
          person.email,
          person.department,
          doc.name,
          doc.category,
          doc.version_label,
          ACKNOWLEDGEMENT_STATEMENT,
          clientIp(h),
          userAgent(h),
          signature.png,
          signature.method,
          signature.typedName,
          briefer.id,
          briefer.name,
        ],
        db,
      );
      return { signed: { name: person.name, at: ack.acknowledged_at.toISOString() } };
    });
    if ("error" in result) return { ...result, round: prev.round };
    revalidatePath(`/brief/${documentId}`);
    revalidatePath("/team");
    revalidatePath(`/admin/documents/${documentId}`);
    return { signed: result.signed, round: (prev.round ?? 0) + 1 };
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "This person has already signed this document.", round: prev.round };
    throw err;
  }
}
