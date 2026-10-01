import { query, queryOne, type Queryable } from "./db";
import { hashToken, newToken } from "./tokens";

export type AccountLinkPurpose = "setup" | "reset";
export const ACCOUNT_LINK_DAYS = 7;

/**
 * Creates a one-time link for a person to set (or reset) their password. v1 sends no
 * email, so the admin copies the link and shares it. Older unused links are retired.
 */
export async function createAccountLink(
  db: Queryable,
  userId: string,
  purpose: AccountLinkPurpose,
  createdBy: string | null,
): Promise<string> {
  await query(
    "UPDATE account_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL",
    [userId],
    db,
  );
  const token = newToken();
  await query(
    `INSERT INTO account_tokens (token_hash, user_id, purpose, created_by, expires_at)
     VALUES ($1, $2, $3, $4, now() + make_interval(days => $5))`,
    [hashToken(token), userId, purpose, createdBy, ACCOUNT_LINK_DAYS],
    db,
  );
  return token;
}

export type AccountLink = {
  token_hash: string;
  user_id: string;
  purpose: AccountLinkPurpose;
  name: string;
  email: string;
};

export async function findLiveAccountLink(
  token: string,
  db?: Queryable,
  forUpdate = false,
): Promise<AccountLink | null> {
  return queryOne<AccountLink>(
    `SELECT t.token_hash, t.user_id, t.purpose, u.name, u.email
       FROM account_tokens t JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > now()
      ${forUpdate ? "FOR UPDATE OF t" : ""}`,
    [hashToken(token)],
    db,
  );
}
