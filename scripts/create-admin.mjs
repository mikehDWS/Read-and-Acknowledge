// Creates the first admin (or promotes an existing user) and prints a one-time
// set-password link. Usage: npm run create-admin -- --name "Jo Bloggs" --email jo@example.com
import { createHash, randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import pg from "pg";

const { values } = parseArgs({
  options: { name: { type: "string" }, email: { type: "string" } },
});
const name = values.name?.trim();
const email = values.email?.trim().toLowerCase();
if (!name || !email || !email.includes("@")) {
  console.error('Usage: npm run create-admin -- --name "Full Name" --email you@example.com');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const { rows } = await client.query(
    `INSERT INTO users (name, email, role) VALUES ($1, $2, 'admin')
     ON CONFLICT (lower(email)) DO UPDATE SET role = 'admin', updated_at = now()
     RETURNING id`,
    [name, email],
  );
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  await client.query(
    `INSERT INTO account_tokens (token_hash, user_id, purpose, expires_at)
     VALUES ($1, $2, 'setup', now() + interval '7 days')`,
    [hash, rows[0].id],
  );
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  console.log(`Admin ready: ${email}`);
  console.log(`Set a password within 7 days at:\n${base}/account/${token}`);
} finally {
  await client.end();
}
