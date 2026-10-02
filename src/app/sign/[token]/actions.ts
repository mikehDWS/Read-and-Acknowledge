"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isUniqueViolation, queryOne, transaction } from "@/lib/db";
import { clientIp, userAgent } from "@/lib/request";
import { getCurrentUser } from "@/lib/session";
import { readSignature } from "@/lib/signature";
import { ACKNOWLEDGEMENT_STATEMENT } from "@/lib/statement";
import { isWellFormedToken } from "@/lib/tokens";

export type AcknowledgeState = { error?: string };

export async function acknowledge(_prev: AcknowledgeState, form: FormData): Promise<AcknowledgeState> {
  const token = String(form.get("token") ?? "");
  if (!isWellFormedToken(token)) return { error: "This link isn't valid." };

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/sign/${token}`)}`);

  const signature = readSignature(
    String(form.get("signature") ?? ""),
    String(form.get("signature_method") ?? ""),
    String(form.get("typed_name") ?? ""),
  );
  if (typeof signature === "string") return { error: signature };

  const h = await headers();
  try {
    const outcome = await transaction(async (db) => {
      const doc = await queryOne<{ id: string; name: string; version_label: string | null; status: string }>(
        "SELECT id, name, version_label, status FROM documents WHERE link_token = $1 FOR SHARE",
        [token],
        db,
      );
      if (!doc) return "missing";
      if (doc.status !== "open") return "closed";
      const expected = await queryOne(
        "SELECT 1 FROM document_signers WHERE document_id = $1 AND user_id = $2",
        [doc.id, user.id],
        db,
      );
      if (!expected) return "not-listed";
      await db.query(
        `INSERT INTO acknowledgements
           (document_id, user_id, signer_name, signer_email, signer_department,
            document_name, document_category, version_label, statement_text, ip_address, user_agent,
            signature_png, signature_method, signature_typed_name)
         VALUES ($1, $2, $3, $4,
                 (SELECT o.name FROM users u JOIN departments o ON o.id = u.department_id WHERE u.id = $2),
                 $5,
                 (SELECT c.name FROM documents d JOIN document_categories c ON c.id = d.category_id WHERE d.id = $1),
                 $6, $7, $8, $9, $10, $11, $12)`,
        [
          doc.id,
          user.id,
          user.name,
          user.email,
          doc.name,
          doc.version_label,
          ACKNOWLEDGEMENT_STATEMENT,
          clientIp(h),
          userAgent(h),
          signature.png,
          signature.method,
          signature.typedName,
        ],
      );
      return "signed";
    });

    if (outcome === "missing") return { error: "This document can't be found." };
    if (outcome === "closed") return { error: "This document is no longer accepting acknowledgements." };
    if (outcome === "not-listed") {
      return { error: "You're not on the list for this document. Contact your admin if you think that's wrong." };
    }
  } catch (err) {
    // Already signed (e.g. a double click or a second tab): fall through to the confirmation.
    if (!isUniqueViolation(err)) throw err;
  }
  redirect(`/sign/${token}?confirmed=1`);
}
