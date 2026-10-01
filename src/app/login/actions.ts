"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { query, queryOne } from "@/lib/db";
import { afterFailedLogin, isLocked } from "@/lib/lockout";
import { verifyAgainstDummy, verifyPassword } from "@/lib/passwords";
import { loginLimiter } from "@/lib/rate-limit";
import { clientIp, safeNextPath } from "@/lib/request";
import { endSession, startSession } from "@/lib/session";
import { text } from "@/lib/validation";

export type SignInState = { error?: string; email?: string };

const GENERIC_ERROR = "That email and password don't match an account.";
const SLOW_DOWN = "Too many sign-in attempts. Wait 15 minutes and try again, or ask an admin for a reset link.";

export async function signIn(_prev: SignInState, form: FormData): Promise<SignInState> {
  const email = text(form, "email", 254).toLowerCase();
  const password = typeof form.get("password") === "string" ? (form.get("password") as string) : "";
  const next = safeNextPath(text(form, "next", 2000), "");

  if (!email || !password) return { error: "Enter your email and password.", email };

  const ip = clientIp(await headers()) ?? "unknown";
  if (!loginLimiter.hit(`ip:${ip}`) || !loginLimiter.hit(`email:${email}`)) {
    return { error: SLOW_DOWN, email };
  }

  const user = await queryOne<{
    id: string;
    role: string;
    password_hash: string | null;
    failed_login_count: number;
    locked_until: Date | null;
  }>(
    `SELECT id, role, password_hash, failed_login_count, locked_until
       FROM users WHERE lower(email) = $1`,
    [email],
  );

  if (!user || !user.password_hash) {
    await verifyAgainstDummy(password);
    return { error: GENERIC_ERROR, email };
  }
  if (isLocked(user.locked_until)) return { error: SLOW_DOWN, email };

  if (!(await verifyPassword(password, user.password_hash))) {
    const state = afterFailedLogin(user.failed_login_count);
    await query("UPDATE users SET failed_login_count = $2, locked_until = $3 WHERE id = $1", [
      user.id,
      state.failedCount,
      state.lockedUntil,
    ]);
    return { error: state.lockedUntil ? SLOW_DOWN : GENERIC_ERROR, email };
  }

  await query("UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = $1", [user.id]);
  await startSession(user.id);
  redirect(next || (user.role === "admin" ? "/admin" : "/my"));
}

export async function signOut(): Promise<void> {
  await endSession();
  redirect("/login");
}
