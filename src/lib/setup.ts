import { createHash, timingSafeEqual } from "node:crypto";
import { queryOne, type Queryable } from "./db";

export const MIN_SETUP_CODE_LENGTH = 12;

/** True once an admin who can sign in exists; the setup page then stops working. */
export async function setupComplete(db?: Queryable): Promise<boolean> {
  const row = await queryOne(
    "SELECT 1 FROM users WHERE role = 'admin' AND password_hash IS NOT NULL LIMIT 1",
    [],
    db,
  );
  return row !== null;
}

export function setupCodeConfigured(): boolean {
  return (process.env.SETUP_CODE?.trim().length ?? 0) >= MIN_SETUP_CODE_LENGTH;
}

/** Compares in constant time so the code can't be guessed a character at a time. */
export function setupCodeMatches(attempt: string): boolean {
  const expected = process.env.SETUP_CODE?.trim() ?? "";
  if (expected.length < MIN_SETUP_CODE_LENGTH) return false;
  const a = createHash("sha256").update(attempt.trim()).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
