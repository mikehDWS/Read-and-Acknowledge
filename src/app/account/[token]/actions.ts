"use server";

import { redirect } from "next/navigation";
import { findLiveAccountLink } from "@/lib/account-links";
import { audit } from "@/lib/audit";
import { query, transaction } from "@/lib/db";
import { hashPassword, passwordProblem } from "@/lib/passwords";
import { endAllSessions, startSession } from "@/lib/session";
import { isWellFormedToken } from "@/lib/tokens";

export type SetPasswordState = { error?: string };

export async function setPassword(_prev: SetPasswordState, form: FormData): Promise<SetPasswordState> {
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");

  const problem = passwordProblem(password, confirm);
  if (problem) return { error: problem };
  if (!isWellFormedToken(token)) return { error: "This link isn't valid. Ask your admin for a new one." };

  const passwordHash = await hashPassword(password);
  const result = await transaction(async (db) => {
    const link = await findLiveAccountLink(token, db, true);
    if (!link) return null;
    await query("UPDATE account_tokens SET used_at = now() WHERE token_hash = $1", [link.token_hash], db);
    const [user] = await query<{ role: string }>(
      `UPDATE users SET password_hash = $2, failed_login_count = 0, locked_until = NULL, updated_at = now()
        WHERE id = $1 RETURNING role`,
      [link.user_id, passwordHash],
      db,
    );
    await endAllSessions(link.user_id, db);
    await audit(db, link.user_id, link.purpose === "setup" ? "password.set" : "password.reset", "user", link.user_id);
    await startSession(link.user_id, db);
    return user.role;
  });

  if (!result) return { error: "This link has expired or has already been used. Ask your admin for a new one." };
  redirect(result === "admin" ? "/admin" : "/my");
}
