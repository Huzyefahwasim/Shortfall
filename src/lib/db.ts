import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

let pool: Pool | undefined;
function getPool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured.');
  return (pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 5000,
  }));
}
export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
) {
  return getPool().query<T>(text, values);
}
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
export async function migrate(): Promise<void> {
  const sql = await readFile(path.join(process.cwd(), 'db', 'schema.sql'), 'utf8');
  await transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(805104)');
    await client.query(sql);
  });
}
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
