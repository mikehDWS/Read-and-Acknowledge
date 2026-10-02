import { Pool, types, type PoolClient, type QueryResultRow } from "pg";

// Keep DATE columns (e.g. due dates) as plain YYYY-MM-DD strings instead of local-midnight Dates.
types.setTypeParser(types.builtins.DATE, (value: string) => value);

const globalForPg = globalThis as unknown as { pgPool?: Pool };

/** DATABASE_URL, or POSTGRES_URL as set by some hosting database integrations. */
export function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}

function getPool(): Pool {
  if (!globalForPg.pgPool) {
    const connectionString = databaseUrl();
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    // Serverless hosts run many small instances, so keep each instance's pool small.
    const max = Number(process.env.PG_POOL_MAX) || (process.env.VERCEL ? 3 : 10);
    globalForPg.pgPool = new Pool({ connectionString, max });
  }
  return globalForPg.pgPool;
}

export type Queryable = Pick<PoolClient, "query">;

export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
  db: Queryable = getPool(),
): Promise<T[]> {
  const result = await db.query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
  db: Queryable = getPool(),
): Promise<T | null> {
  const rows = await query<T>(text, params, db);
  return rows[0] ?? null;
}

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Postgres unique_violation, e.g. a second live acknowledgement for the same person. */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}
