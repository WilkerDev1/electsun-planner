// Arranque compartido de las pruebas de integración. Cada archivo *.test.ts llama a setup() en su before().
import assert from "node:assert/strict";
import crypto from "node:crypto";
import type { Server } from "node:http";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://planner:local-test-only@127.0.0.1:5544/planner_test";
process.env.APP_ORIGIN = "http://127.0.0.1:8099";
process.env.PLANNER_TODAY = "2026-10-27";
const testDb = new URL(process.env.DATABASE_URL);
if (!testDb.pathname.endsWith("_test") || !["127.0.0.1", "localhost"].includes(testDb.hostname))
  throw new Error("Las pruebas destructivas requieren una base local terminada en _test.");

const { app } = await import("../server/index.js");
const { pool, migrate } = await import("../server/db.js");
const { passwordHash } = await import("../server/auth.js");
const { seedDemo } = await import("../server/seed.js");
export { pool };

export const PASSWORD = "integration-test-password";
export type Ctx = {
  base: string;
  admin: string;
  office: string;
  adminId: string;
  officeId: string;
  server: Server;
  request: <T = any>(path: string, method?: string, body?: unknown, cookie?: string, extra?: Record<string, string>) => Promise<{ status: number; headers: Headers; data: T }>;
  login: (email: string, password?: string) => Promise<string>;
  close: () => Promise<void>;
};

/** Migra, vacía la base, carga la demo ficticia y crea una cuenta admin y una oficina con sesión. */
export async function setup(): Promise<Ctx> {
  await migrate();
  await pool.query("TRUNCATE users,sessions,invitations,audit CASCADE");
  await seedDemo("2026-10-27", { reset: true });
  await pool.query("UPDATE mural_settings SET design='principal',weeks=2,upcoming_order='fecha',show_waiting=true,show_notes=true,show_priority=true,show_clock=true,show_kwp=false");
  const pass = await passwordHash(PASSWORD);
  const adminId = crypto.randomUUID();
  const officeId = crypto.randomUUID();
  await pool.query("INSERT INTO users(id,name,email,password_hash,role) VALUES($1,'Admin','admin@example.test',$2,'admin'),($3,'Oficina','oficina@example.test',$2,'office')", [adminId, pass, officeId]);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + (server.address() as { port: number }).port;
  const request: Ctx["request"] = async (path, method = "GET", body, cookie = "", extra = {}) => {
    const r = await fetch(base + "/api" + path, {
      method,
      headers: {
        ...(body === undefined || body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        Origin: process.env.APP_ORIGIN!,
        ...(cookie ? { Cookie: cookie } : {}),
        ...extra,
      },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
    const type = r.headers.get("content-type") ?? "";
    return { status: r.status, headers: r.headers, data: type.includes("json") ? await r.json() : await r.arrayBuffer() };
  };
  const login = async (email: string, password = PASSWORD) => {
    const r = await request("/auth/login", "POST", { email, password });
    assert.equal(r.status, 200, `login ${email}: ${JSON.stringify(r.data)}`);
    return r.headers.get("set-cookie")!.split(";")[0];
  };
  const ctx: Ctx = {
    base,
    server,
    adminId,
    officeId,
    request,
    login,
    admin: await login("admin@example.test"),
    office: await login("oficina@example.test"),
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
  return ctx;
}

/** Cookie `nombre=valor` de una respuesta con varias Set-Cookie. */
export function cookieFrom(headers: Headers, name: string) {
  const c = headers.getSetCookie().find((x) => x.startsWith(name + "="));
  return c?.split(";")[0] ?? "";
}

/** Cierra la conexión de la base al terminar el último archivo de pruebas. */
export const endPool = () => pool.end();
