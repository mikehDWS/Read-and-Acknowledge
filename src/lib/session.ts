import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { query, queryOne, type Queryable } from "./db";
import { hashToken, newToken } from "./tokens";

export type Role = "reader" | "admin";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

const SESSION_HOURS = 12;
const secureCookies = process.env.NODE_ENV === "production";
// The __Host- prefix makes browsers refuse the cookie unless it is Secure, host-only and path=/.
const COOKIE_NAME = secureCookies ? "__Host-ra_session" : "ra_session";

export async function startSession(userId: string, db?: Queryable): Promise<void> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3_600_000);
  await query(
    "INSERT INTO sessions (id_hash, user_id, expires_at) VALUES ($1, $2, $3)",
    [hashToken(token), userId, expiresAt],
    db,
  );
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) await query("DELETE FROM sessions WHERE id_hash = $1", [hashToken(token)]);
  store.delete(COOKIE_NAME);
}

/** Signs a user out everywhere, e.g. after a password reset or a role change. */
export async function endAllSessions(userId: string, db?: Queryable): Promise<void> {
  await query("DELETE FROM sessions WHERE user_id = $1", [userId], db);
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return queryOne<CurrentUser>(
    `SELECT u.id, u.name, u.email, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id_hash = $1 AND s.expires_at > now() AND u.password_hash IS NOT NULL`,
    [hashToken(token)],
  );
});

/** For pages: sends signed-out visitors to the sign-in page, then back here. */
export async function requireUser(returnTo: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return user;
}

export async function requireAdmin(returnTo = "/admin"): Promise<CurrentUser> {
  const user = await requireUser(returnTo);
  if (user.role !== "admin") redirect("/my");
  return user;
}

/** For server actions: throws rather than redirecting, so a forged request does nothing. */
export async function assertAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") throw new Error("Not authorised");
  return user;
}
