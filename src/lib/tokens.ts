import { createHash, randomBytes } from "node:crypto";

/** 256-bit random token, URL-safe. Used for sign links, sessions and account links. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Tokens are stored hashed so a database leak doesn't expose live sessions or links. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isWellFormedToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}
