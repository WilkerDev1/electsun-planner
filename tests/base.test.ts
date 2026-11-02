import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { setup, endPool, type Ctx } from "./helpers.js";

let ctx: Ctx;
before(async () => {
  ctx = await setup();
});
after(async () => {
  await ctx.close();
  await endPool();
});

test("salud y sesión (F0)", async () => {
  assert.equal((await fetch(ctx.base + "/readyz")).status, 200);
  const anon = await ctx.request("/auth/me");
  assert.deepEqual(anon.data, { user: null, today: "2026-10-27" });
  const me = await ctx.request("/auth/me", "GET", undefined, ctx.admin);
  assert.equal(me.data.user.role, "admin");
  const bad = await ctx.request("/auth/login", "POST", { email: "admin@example.test", password: "incorrecta-123" });
  assert.equal(bad.status, 401);
});

test("escrituras exigen el origen de la app (NF-01)", async () => {
  const r = await ctx.request("/auth/logout", "POST", {}, ctx.admin, { Origin: "https://evil.example" });
  assert.equal(r.status, 403);
});

test("catálogos y demo ficticia", async () => {
  const statuses = await ctx.request("/statuses", "GET", undefined, ctx.office);
  assert.deepEqual(statuses.data.map((s: { name: string }) => s.name), ["En obra", "Programado", "Por programar", "En pausa", "Terminado", "Esperando medidor"]);
  const teams = await ctx.request("/teams", "GET", undefined, ctx.office);
  assert.deepEqual(teams.data.map((t: { code: string }) => t.code), ["E1", "E2", "E3"]);
  const employees = await ctx.request("/employees", "GET", undefined, ctx.office);
  assert.equal(employees.data.length, 13);
  assert.equal(employees.data[0].level, "Supervisor");
  assert.equal((await ctx.request("/companies")).status, 401);
});

test("SSE exige sesión", async () => {
  const r = await fetch(ctx.base + "/api/events");
  assert.equal(r.status, 401);
});
