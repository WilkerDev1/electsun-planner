import pg from "pg";
import fs from "node:fs/promises";
import crypto from "node:crypto";

// Las fechas de obra (date) viajan como texto "aaaa-mm-dd"; numeric (kWp) como texto.
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 12 });

export type Db = pg.Pool | pg.PoolClient;

/** Aplica migrations/NNN_*.sql en orden, con bloqueo y suma de verificación (portado de Monitor). */
export async function migrate(database: pg.Pool = pool) {
  const c = await database.connect();
  try {
    await c.query("SELECT pg_advisory_lock(67321002)");
    await c.query("BEGIN");
    await c.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const directory = new URL("../migrations/", import.meta.url);
    for (const name of (await fs.readdir(directory)).filter((n) => /^\d+_.+\.sql$/.test(n)).sort()) {
      const sql = await fs.readFile(new URL(name, directory), "utf8");
      const checksum = crypto.createHash("sha256").update(sql).digest("hex");
      const applied = (await c.query("SELECT checksum FROM schema_migrations WHERE name=$1", [name])).rows[0];
      if (applied) {
        if (applied.checksum !== checksum) throw new Error(`Migración modificada después de aplicarse: ${name}`);
        continue;
      }
      await c.query(sql);
      await c.query("INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)", [name, checksum]);
    }
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    await c.query("SELECT pg_advisory_unlock(67321002)");
    c.release();
  }
}

export async function transaction<T>(fn: (c: pg.PoolClient) => Promise<T>) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

/** Error con código HTTP que el manejador de errores devuelve como `{ message }` (más `reason`, un código estable para el cliente, si lo hay). */
export const httpError = (status: number, message: string, reason?: string) => Object.assign(new Error(message), { status, reason });
