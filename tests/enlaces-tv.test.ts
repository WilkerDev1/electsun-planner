import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { setup, endPool, cookieFrom, pool, type Ctx } from "./helpers.js";

// Enlaces de TV con modo, título, ajustes propios y pausa reversible (ACC-01, ACC-03, ACC-07, ACC-08, MUR-09).

let ctx: Ctx;
before(async () => {
  ctx = await setup();
});
after(async () => {
  await ctx.close();
  await endPool();
});

const auditRows = async (action: string, entityId: string) =>
  (await pool.query("SELECT diff FROM audit WHERE action=$1 AND entity_id=$2 ORDER BY id", [action, entityId])).rows as { diff: Record<string, [unknown, unknown]> }[];

let tv = { id: "", token: "", cookie: "" };

async function redeem() {
  const r = await ctx.request("/access/session", "POST", { id: tv.id, token: tv.token });
  assert.equal(r.status, 200);
  tv.cookie = cookieFrom(r.headers, `planner_tv_${tv.id}`);
}
const view = () => ctx.request(`/view/mural?link=${tv.id}`, "GET", undefined, tv.cookie);

test("crear una TV con modo y título; sin modo es Principal (ACC-08)", async () => {
  const bad = await ctx.request("/access-links", "POST", { kind: "tv", name: "TV mala", mural: { design: "timeline", colores: "azul" } }, ctx.admin);
  assert.equal(bad.status, 422, "claves desconocidas en mural");
  const long = await ctx.request("/access-links", "POST", { kind: "tv", name: "TV larga", title: "x".repeat(61) }, ctx.admin);
  assert.equal(long.status, 422);

  const plain = await ctx.request("/access-links", "POST", { kind: "tv", name: "TV sin modo" }, ctx.admin);
  assert.equal(plain.status, 201);
  assert.deepEqual({ title: plain.data.link.title, mural: plain.data.link.mural, paused: plain.data.link.paused }, { title: null, mural: { design: "principal" }, paused: false });

  const r = await ctx.request("/access-links", "POST", { kind: "tv", name: "TV oficina", title: "  Sala de obras  ", mural: { design: "timeline", weeks: 4 } }, ctx.admin);
  assert.equal(r.status, 201);
  assert.equal(r.data.link.title, "Sala de obras");
  assert.deepEqual(r.data.link.mural, { design: "timeline", weeks: 4 });
  tv = { id: r.data.link.id, token: r.data.path.split("#")[1], cookie: "" };
  const listed = (await ctx.request("/access-links?kind=tv", "GET", undefined, ctx.admin)).data.find((l: { id: string }) => l.id === tv.id);
  assert.equal(listed.title, "Sala de obras");
  assert.equal((await auditRows("link.create", tv.id)).length, 1);
});

test("la vista de la TV aplica los ajustes propios sobre los generales y trae el título (ACC-08, MUR-09)", async () => {
  await redeem();
  const v = await view();
  assert.equal(v.status, 200);
  assert.equal(v.data.title, "Sala de obras");
  assert.equal(v.data.settings.design, "timeline");
  assert.equal(v.data.settings.weeks, 4);
  assert.equal(v.data.settings.show_clock, true, "lo que falta se hereda del general (show_clock = true)");
  assert.equal(v.data.settings.upcoming_order, "fecha");

  // Cambiar el general no pisa lo propio, pero sí lo heredado.
  await pool.query("UPDATE mural_settings SET design='principal',weeks=3,show_clock=false");
  const w = (await view()).data;
  assert.equal(w.settings.design, "timeline");
  assert.equal(w.settings.weeks, 4);
  assert.equal(w.settings.show_clock, false);
  await pool.query("UPDATE mural_settings SET weeks=2,show_clock=true");

  // El mural general (cuenta) no lleva título; la vista previa con ?link= muestra lo de esa TV.
  assert.equal((await ctx.request("/view/mural", "GET", undefined, ctx.office)).data.title, null);
  const preview = (await ctx.request(`/view/mural?link=${tv.id}`, "GET", undefined, ctx.office)).data;
  assert.equal(preview.title, "Sala de obras");
  assert.equal(preview.settings.design, "timeline");
  assert.equal((await ctx.request(`/view/mural?link=${crypto.randomUUID()}`, "GET", undefined, ctx.office)).status, 404);
});

test("PATCH: solo admin, solo TV, valida y audita (ACC-08, HIS-01)", async () => {
  const ok = await ctx.request(`/access-links/${tv.id}`, "PATCH", { name: "TV sala", title: null, mural: { weeks: 3, show_kwp: true } }, ctx.admin);
  assert.equal(ok.status, 200);
  assert.deepEqual({ name: ok.data.name, title: ok.data.title, mural: ok.data.mural }, { name: "TV sala", title: null, mural: { weeks: 3, show_kwp: true } });
  const log = await auditRows("link.update", tv.id);
  assert.equal(log.length, 1);
  assert.deepEqual(Object.keys(log[0].diff).sort(), ["mural", "name", "title"]);
  assert.deepEqual(log[0].diff.name, ["TV oficina", "TV sala"]);

  const v = (await view()).data;
  assert.equal(v.title, null, "title null quita el título");
  assert.equal(v.settings.design, "principal", "mural se reemplaza por completo: design vuelve al general");
  assert.equal(v.settings.weeks, 3);
  assert.equal(v.settings.show_kwp, true);

  // Sin cambios reales no se registra auditoría.
  assert.equal((await ctx.request(`/access-links/${tv.id}`, "PATCH", { name: "TV sala" }, ctx.admin)).status, 200);
  assert.equal((await auditRows("link.update", tv.id)).length, 1);

  assert.equal((await ctx.request(`/access-links/${tv.id}`, "PATCH", { title: "Hola" }, ctx.office)).status, 403);
  assert.equal((await ctx.request(`/access-links/${tv.id}`, "PATCH", { title: "Hola" })).status, 401);
  assert.equal((await ctx.request(`/access-links/${tv.id}`, "PATCH", { mural: { colores: 1 } }, ctx.admin)).status, 422);
  assert.equal((await ctx.request(`/access-links/${tv.id}`, "PATCH", { mural: { weeks: 9 } }, ctx.admin)).status, 422);
  assert.equal((await ctx.request(`/access-links/${tv.id}`, "PATCH", { token_hash: "x" }, ctx.admin)).status, 422);
  assert.equal((await ctx.request(`/access-links/${tv.id}`, "PATCH", {}, ctx.admin)).status, 422);
  assert.equal((await ctx.request(`/access-links/${tv.id}`, "PATCH", { title: "x".repeat(61) }, ctx.admin)).status, 422);
  assert.equal((await ctx.request(`/access-links/${crypto.randomUUID()}`, "PATCH", { title: "Hola" }, ctx.admin)).status, 404);

  // Un enlace móvil no se configura como TV.
  const emp = (await pool.query("SELECT e.id FROM employees e WHERE e.state='Activo' AND e.name='Starlin Reyes'")).rows[0].id as string;
  const mobile = await ctx.request("/access-links", "POST", { kind: "mobile", employee_id: emp }, ctx.admin);
  assert.equal(mobile.status, 201);
  assert.equal(mobile.data.link.title, null);
  assert.equal((await ctx.request(`/access-links/${mobile.data.link.id}`, "PATCH", { title: "Hola" }, ctx.admin)).status, 422);
  assert.equal((await ctx.request(`/access-links/${mobile.data.link.id}`, "PATCH", { paused: true }, ctx.admin)).status, 422);
  const bd = await pool.query("UPDATE access_links SET title='x' WHERE id=$1", [mobile.data.link.id]).catch((e) => e);
  assert.equal((bd as { code?: string }).code, "23514", "la base también impide título en un enlace móvil");
});

test("pausar conserva la sesión y reanudar vuelve a 200 con la misma cookie (ACC-08)", async () => {
  const sessions = async () => Number((await pool.query("SELECT count(*) FROM device_sessions WHERE link_id=$1", [tv.id])).rows[0].count);
  const before = await sessions();
  assert.equal(before, 1);

  const paused = await ctx.request(`/access-links/${tv.id}`, "PATCH", { paused: true }, ctx.admin);
  assert.equal(paused.status, 200);
  assert.equal(paused.data.paused, true);
  assert.equal(paused.data.active, true);

  const denied = await view();
  assert.equal(denied.status, 403);
  assert.equal(denied.data.reason, "paused");
  assert.match(denied.data.message, /en pausa/);
  assert.equal(JSON.stringify(denied.data).includes("model"), false, "no se filtran datos");
  assert.equal(await sessions(), before, "la sesión se conserva");

  // Un enlace revocado se distingue: 403 sin `reason`.
  const stranger = await ctx.request(`/view/mural?link=${tv.id}`, "GET", undefined, "planner_tv_x=nada");
  assert.equal(stranger.status, 403);
  assert.equal(stranger.data.reason, undefined);

  const back = await ctx.request(`/access-links/${tv.id}`, "PATCH", { paused: false }, ctx.admin);
  assert.equal(back.data.paused, false);
  const again = await view();
  assert.equal(again.status, 200, "misma cookie, sin canjear de nuevo");
  assert.equal(await sessions(), before);
  assert.equal((await auditRows("link.update", tv.id)).length, 3);
});

test("rotar conserva título y ajustes; revocar sigue cortando todo (ACC-02, ACC-03)", async () => {
  const rot = await ctx.request(`/access-links/${tv.id}/rotate`, "POST", {}, ctx.admin);
  assert.equal(rot.status, 200);
  assert.deepEqual(rot.data.link.mural, { weeks: 3, show_kwp: true });
  assert.equal(rot.data.link.name, "TV sala");
  tv.token = rot.data.path.split("#")[1];
  assert.equal((await view()).status, 403, "la cookie vieja ya no sirve");
  await redeem();
  assert.equal((await view()).status, 200);

  const revoked = await ctx.request(`/access-links/${tv.id}/revoke`, "POST", {}, ctx.admin);
  assert.equal(revoked.data.active, false);
  const gone = await view();
  assert.equal(gone.status, 403);
  assert.equal(gone.data.reason, undefined);
  assert.match(gone.data.message, /desactivado/);
});
