// Applies db/migrations/*.sql in filename order, each once, inside a transaction.
// With --if-configured (used by the Vercel build), a missing database is a warning, not an error,
// so the first deploy succeeds before a database has been connected.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");

// Prefer a direct (unpooled) connection for schema changes when the host provides one.
const url =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;

if (!url) {
  if (process.argv.includes("--if-configured")) {
    console.warn("No database connected yet (DATABASE_URL is not set); skipping migrations.");
    process.exit(0);
  }
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  // Stops two deploys migrating at the same time.
  await client.query("SELECT pg_advisory_lock(727274)");
  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const { rows } = await client.query("SELECT name FROM schema_migrations");
  const applied = new Set(rows.map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(dir, file), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`applied ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`${file}: ${err.message}`);
    }
  }
  console.log("database is up to date");
} finally {
  await client.end();
}
