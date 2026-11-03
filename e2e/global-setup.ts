import crypto from "node:crypto";
import pg from "pg";
import { E2E_DB } from "../playwright.config";

export const ADMIN = { email: "admin@example.test", password: "e2e-admin-password-123" };
export const OFFICE = { email: "oficina@example.test", password: "e2e-office-password-123" };

/** Base limpia con la demo ficticia y dos cuentas de prueba. */
export default async function globalSetup() {
  const url = new URL(E2E_DB);
  if (!url.pathname.endsWith("_test") || !["127.0.0.1", "localhost"].includes(url.hostname))
    throw new Error("E2E requiere una base local terminada en _test.");
  const admin = new pg.Client({ connectionString: E2E_DB.replace(/\/[^/]+$/, "/postgres") });
  await admin.connect();
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [url.pathname.slice(1)]);
  if (!exists.rowCount) await admin.query(`CREATE DATABASE ${url.pathname.slice(1)}`);
  await admin.end();
  process.env.DATABASE_URL = E2E_DB;
  const { pool, migrate } = await import("../server/db.js");
  const { passwordHash } = await import("../server/auth.js");
  const { seedDemo } = await import("../server/seed.js");
  await migrate();
  await pool.query("TRUNCATE users,sessions,invitations,audit CASCADE");
  await pool.query("UPDATE mural_settings SET design='principal',weeks=2,upcoming_order='fecha'");
  await seedDemo("2026-10-27", { reset: true });
  for (const [u, role, name] of [[ADMIN, "admin", "Admin E2E"], [OFFICE, "office", "Oficina E2E"]] as const)
    await pool.query("INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5)", [
      crypto.randomUUID(), name, u.email, await passwordHash(u.password), role,
    ]);
  await pool.end();
}
