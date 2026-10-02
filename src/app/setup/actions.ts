"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { query, transaction } from "@/lib/db";
import { hashPassword, passwordProblem } from "@/lib/passwords";
import { loginLimiter } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { endAllSessions, startSession } from "@/lib/session";
import { setupComplete, setupCodeMatches } from "@/lib/setup";
import { isEmail, text } from "@/lib/validation";

export type SetupState = { error?: string; name?: string; email?: string };

export async function createFirstAdmin(_prev: SetupState, form: FormData): Promise<SetupState> {
  const name = text(form, "name", 200);
  const email = text(form, "email", 254).toLowerCase();
  const code = String(form.get("code") ?? "");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const keep = { name, email };

  const ip = clientIp(await headers()) ?? "unknown";
  if (!loginLimiter.hit(`setup:${ip}`)) return { ...keep, error: "Too many attempts. Wait 15 minutes and try again." };
  if (!setupCodeMatches(code)) return { ...keep, error: "That setup code isn't right." };
  if (!name) return { ...keep, error: "Enter your name." };
  if (!isEmail(email)) return { ...keep, error: "Enter a valid email address." };
  const problem = passwordProblem(password, confirm);
  if (problem) return { ...keep, error: problem };

  const passwordHash = await hashPassword(password);
  const done = await transaction(async (db) => {
    // Only one person can complete setup, even if two submit at once.
    await db.query("SELECT pg_advisory_xact_lock(727275)");
    if (await setupComplete(db)) return false;
    const [user] = await query<{ id: string }>(
      `INSERT INTO users (name, email, role, password_hash) VALUES ($1, $2, 'admin', $3)
       ON CONFLICT (lower(email)) DO UPDATE
         SET name = EXCLUDED.name, role = 'admin', password_hash = EXCLUDED.password_hash,
             failed_login_count = 0, locked_until = NULL, updated_at = now()
       RETURNING id`,
      [name, email, passwordHash],
      db,
    );
    await endAllSessions(user.id, db);
    await audit(db, user.id, "setup.first_admin", "user", user.id, { email });
    await startSession(user.id, db);
    return true;
  });

  if (!done) return { error: "Setup has already been completed. Sign in instead." };
  redirect("/admin");
}
