import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { setup, endPool, cookieFrom, pool, type Ctx } from "./helpers.js";
import { muralModel, shortName, type MuralInput } from "../shared/mural-model.js";
import type { MuralSettings } from "../shared/contracts/mural.js";
import { listCompanies, listProjects, listStatuses, listTeams } from "../server/queries.js";

// F2·D — Mural de TV (CAL-08, MUR-02..09, AVI-01..03, API-01/02, ROL-02).

const TODAY = "2026-10-27";
const DEFAULTS: MuralSettings = {
  design: "principal",
  weeks: 2,
  upcoming_order: "fecha",
  show_waiting: true,
  show_notes: true,
  show_priority: true,
  show_clock: true,
  show_kwp: false,
};

let ctx: Ctx;
let input: MuralInput;
before(async () => {
  ctx = await setup();
  const [projects, statuses, companies, teams, notices] = await Promise.all([
    listProjects(pool),
    listStatuses(pool),
    listCompanies(pool),
    listTeams(pool),
    pool.query("SELECT id,text,starts_on,expires_on,sort FROM notices").then((r) => r.rows),
  ]);
  input = { projects, statuses, companies, teams, notices };
});
after(async () => {
  await ctx.close();
  await endPool();
});

const model = (s: Partial<MuralSettings> = {}, inp: MuralInput = input) => muralModel(inp, { ...DEFAULTS, ...s }, TODAY);

// ---------- Unitarias de muralModel con la demo ----------

test("indicadores (MUR-02)", () => {
  const k = Object.fromEntries(model().kpis.map((x) => [x.key, x]));
  assert.equal(k.obra.n, 3);
  assert.equal(k.obra.sub, "182.7 kWp");
  assert.equal(k.proximos.n, 6);
  assert.equal(k.porProgramar.n, 6); // 5 por programar + 1 en pausa
  assert.equal(k.porProgramar.sub, "incluye 1 en pausa");
  assert.equal(k.terminados.n, 1); // Dulcería Mirabal, terminada el 6 oct
  assert.equal(k.terminados.sub, "en octubre");
});

test("activos: en obra primero, Día 8 de 11 y atraso (MUR-03, CAL-02, CAL-06)", () => {
  const rows = model().active.rows;
  assert.deepEqual(rows.slice(0, 3).map((r) => r.kind), ["en_obra", "en_obra", "en_obra"]);
  assert.equal(rows.length, 9);
  const colegio = rows.find((r) => r.name === "Colegio Arcoíris")!;
  assert.equal(colegio.progress!.text, "Día 8 de 11");
  assert.equal(colegio.progress!.endText, "hasta vie 30");
  assert.equal(colegio.priority, true);
  assert.equal(colegio.kwp, null); // kWp apagado por defecto
  const granja = rows.find((r) => r.name === "Granja Los Pinos")!;
  assert.equal(granja.progress!.late, 1);
  assert.equal(granja.progress!.text, "Atrasada · +1 día");
  assert.equal(granja.progress!.endText, "debía terminar lun 26");
  const carla = rows.find((r) => r.name === "Carla Méndez")!;
  assert.equal(carla.countdown, "Inicia en 2 días");
  assert.equal(carla.dates, "Jue 29 oct");
  assert.equal(model({ show_kwp: true }).active.rows.find((r) => r.name === "Colegio Arcoíris")!.kwp, "97.28");
  assert.equal(model({ show_priority: false }).active.rows.find((r) => r.name === "Colegio Arcoíris")!.priority, false);
});

test("calendario por equipo: barras de E1 a E3 y tramo de atraso (MUR-04, CAL-03)", () => {
  const cal = model().calendar;
  assert.equal(cal.cols, 12);
  assert.equal(cal.days.length, 12);
  assert.equal(cal.todayCol, 1);
  assert.equal(cal.rangeLabel, "26 oct – 7 nov · lunes a sábado");
  const names = Object.fromEntries(cal.teams.map((t) => [t.code, t.bars.map((b) => b.name)]));
  assert.deepEqual(names.E1, ["Colegio Arcoíris", "Lucía Gómez", "Andrés Polanco"]);
  assert.deepEqual(names.E2, ["Taller Motormax"]);
  assert.deepEqual(names.E3, ["Granja Los Pinos", "Carla Méndez", "Tomás Rivera", "Rafael Castillo", "Sr. Herrera"]);
  const colegio = cal.teams[0].bars[0];
  assert.deepEqual({ col: colegio.col, span: colegio.span, clipStart: colegio.clipStart, inside: colegio.inside, done: colegio.done }, { col: 0, span: 5, clipStart: true, inside: true, done: 2 });
  const motormax = cal.teams[1].bars[0];
  assert.equal(motormax.span, 11);
  assert.equal(motormax.inside, true);
  const granja = cal.teams[2].bars[0];
  assert.deepEqual(granja.over, { col: 1, span: 1 });
  assert.equal(granja.inside, false);
  assert.equal(granja.labelSide, "right");
  assert.equal(cal.teams[2].bars[1].over, null);
});

test("weeks=3 produce 18 columnas", () => {
  const m = model({ weeks: 3 });
  assert.equal(m.calendar.cols, 18);
  assert.equal(m.calendar.days.length, 18);
  assert.equal(m.timeline.days.length, 18);
  assert.deepEqual(m.timeline.weekLabels, ["Esta semana", "Próxima semana", "En 2 semanas"]);
});

test("por programar con los motivos y en pausa con su motivo (MUR-05, CAL-07)", () => {
  const w = model().waiting;
  assert.equal(w.items.length, 6);
  assert.equal(w.text, "5 en espera · 1 en pausa");
  const sub = Object.fromEntries(w.items.map((i) => [i.name, i.sub]));
  assert.equal(sub["Paola Núñez"], "Espera material y EDE");
  assert.equal(sub["Kevin Almánzar"], "Espera planos y material");
  assert.equal(sub["Oficina Evolta"], "Espera EDE");
  assert.equal(sub["Villa Serena (Mario Abreu)"], "Lista para programar");
  assert.equal(sub["Héctor Liriano Sosa"], "Esperando documentos del cliente");
  assert.equal(w.items[0].name, "Paola Núñez"); // prioridad primero
  assert.equal(w.items.find((i) => i.name === "Héctor Liriano Sosa")!.tone, "pause");
  assert.equal(model({ show_waiting: false }).waiting.items.length, 0);
});

test("Dulcería Mirabal en Esperando medidor (MUR-06)", () => {
  const m = model().meter.items;
  assert.equal(m.length, 1);
  assert.equal(m[0].text, "Dulcería Mirabal · Bonao · terminada el 6 oct");
});

test("avisos: generales primero, máximo 3, caducados fuera (AVI-01..03)", () => {
  const n = model().notices;
  assert.equal(n.length, 3);
  assert.deepEqual(n.slice(0, 2).map((x) => x.general), [true, true]);
  assert.equal(n[2].project, "Taller Motormax");
  const expired: MuralInput = {
    ...input,
    notices: input.notices.map((x, i) => (i === 0 ? { ...x, starts_on: "2026-10-01", expires_on: "2026-10-26" } : x)),
    projects: input.projects.map((p) => (p.name === "Taller Motormax" ? { ...p, mural_until: "2026-10-26" } : p)),
  };
  const e = model({}, expired).notices;
  assert.equal(e.filter((x) => x.general).length, 1);
  assert.equal(e.some((x) => x.project === "Taller Motormax"), false);
  assert.equal(model({ show_notes: false }).notices.every((x) => x.general), true);
});

test("orden con prioridad primero (MUR-03)", () => {
  const prio: MuralInput = { ...input, projects: input.projects.map((p) => (p.name === "Sr. Herrera" ? { ...p, priority: true } : p)) };
  const byDate = model({}, prio).active.rows.filter((r) => r.kind === "programado").map((r) => r.name);
  assert.equal(byDate[0], "Carla Méndez");
  assert.equal(byDate.at(-1), "Sr. Herrera");
  const byPrio = model({ upcoming_order: "prioridad" }, prio).active.rows.filter((r) => r.kind === "programado").map((r) => r.name);
  assert.equal(byPrio[0], "Sr. Herrera");
});

test("timeline: una fila por proyecto activo (MUR-08)", () => {
  const t = model({ design: "timeline", weeks: 3 }).timeline;
  assert.deepEqual(t.groups.map((g) => g.rows.length), [3, 6]);
  const colegio = t.groups[0].rows[0];
  assert.equal(colegio.when, "Día 8 de 11");
  assert.equal(colegio.bar.text, "desde 19 oct");
  assert.equal(t.groups[1].rows[0].whenSub, "1 día");
  assert.deepEqual(t.counts, { obra: 3, prog: 6, waiting: 6 });
  assert.equal(shortName("Lucía Esther Gómez Paredes"), "Lucía Gómez");
  assert.equal(shortName("Granja Los Pinos"), "Granja Los Pinos");
});

// ---------- Integración ----------

test("ajustes: lectura para cuentas, escritura solo admin con auditoría (MUR-09, ROL-02)", async () => {
  assert.equal((await ctx.request("/mural/settings")).status, 401);
  const got = await ctx.request("/mural/settings", "GET", undefined, ctx.office);
  assert.equal(got.status, 200);
  assert.deepEqual(got.data, DEFAULTS);
  assert.equal((await ctx.request("/mural/settings", "PUT", { ...DEFAULTS, weeks: 3 }, ctx.office)).status, 403);
  assert.equal((await ctx.request("/mural/settings", "PUT", { ...DEFAULTS, weeks: 5 }, ctx.admin)).status, 422);
  const put = await ctx.request("/mural/settings", "PUT", { ...DEFAULTS, weeks: 3 }, ctx.admin);
  assert.equal(put.status, 200);
  assert.equal(put.data.weeks, 3);
  const a = await pool.query("SELECT diff FROM audit WHERE action='mural.settings' ORDER BY id DESC LIMIT 1");
  assert.deepEqual(a.rows[0].diff, { weeks: [2, 3] });
  await ctx.request("/mural/settings", "PUT", DEFAULTS, ctx.admin);
});

test("CRUD de avisos con validación y auditoría (AVI-02)", async () => {
  assert.equal((await ctx.request("/notices")).status, 401);
  const body = { text: "Prueba de aviso", starts_on: TODAY, expires_on: "2026-11-01" };
  assert.equal((await ctx.request("/notices", "POST", { ...body, text: "x".repeat(141) }, ctx.office)).status, 422);
  assert.equal((await ctx.request("/notices", "POST", { ...body, expires_on: "2026-10-01" }, ctx.office)).status, 422);
  const created = await ctx.request("/notices", "POST", body, ctx.office);
  assert.equal(created.status, 201);
  const id = created.data.id;
  const list = await ctx.request("/notices", "GET", undefined, ctx.office);
  assert.ok(list.data.some((n: { id: string }) => n.id === id));
  const patched = await ctx.request(`/notices/${id}`, "PATCH", { text: "Aviso cambiado" }, ctx.admin);
  assert.equal(patched.status, 200);
  assert.equal(patched.data.text, "Aviso cambiado");
  assert.equal((await ctx.request(`/notices/${id}`, "PATCH", { expires_on: "2026-10-01" }, ctx.admin)).status, 422);
  assert.equal((await ctx.request(`/notices/${id}`, "DELETE", undefined, ctx.office)).status, 204);
  assert.equal((await ctx.request(`/notices/${id}`, "DELETE", undefined, ctx.office)).status, 404);
  const actions = (await pool.query("SELECT action FROM audit WHERE entity_id=$1 ORDER BY id", [id])).rows.map((r) => r.action);
  assert.deepEqual(actions, ["notice.create", "notice.update", "notice.delete"]);
});

test("/view/mural: cuenta, cookie de TV y 403 tras revocar (MUR-01, ACC-03/04)", async () => {
  assert.equal((await ctx.request("/view/mural")).status, 401);
  const t0 = Date.now();
  const acc = await ctx.request("/view/mural", "GET", undefined, ctx.office);
  assert.equal(acc.status, 200);
  assert.ok(Date.now() - t0 < 300, "responde en menos de 300 ms");
  assert.equal(acc.data.today, TODAY);
  assert.equal(acc.data.model.kpis[0].n, 3);
  assert.equal(acc.data.companies.length, 5);
  const preview = await ctx.request("/view/mural?weeks=4&design=timeline", "GET", undefined, ctx.office);
  assert.equal(preview.data.settings.weeks, 4);
  assert.equal(preview.data.model.calendar.cols, 24);

  const link = await ctx.request("/access-links", "POST", { kind: "tv", name: "TV del taller" }, ctx.admin);
  assert.equal(link.status, 201);
  const [path, token] = link.data.path.split("#");
  const id = path.split("/").pop();
  const redeem = await ctx.request("/access/session", "POST", { token, id });
  assert.equal(redeem.status, 200);
  assert.equal(redeem.data.redirect, `/tv/${id}`);
  const tv = cookieFrom(redeem.headers, `planner_tv_${id}`);
  assert.ok(tv);
  assert.equal((await ctx.request(`/view/mural?link=${id}`, "GET", undefined, tv)).status, 200);
  // La TV no puede cambiar los ajustes con parámetros.
  const tvTry = await ctx.request(`/view/mural?link=${id}&weeks=4`, "GET", undefined, tv);
  assert.equal(tvTry.data.settings.weeks, 2);
  assert.equal((await ctx.request(`/view/mural?link=${id}`)).status, 403);
  assert.equal((await ctx.request(`/access-links/${id}/revoke`, "POST", undefined, ctx.admin)).status, 200);
  assert.equal((await ctx.request(`/view/mural?link=${id}`, "GET", undefined, tv)).status, 403);
});

test("PUT /settings emite event: change por SSE (API-01)", async () => {
  const ac = new AbortController();
  const r = await fetch(ctx.base + "/api/events", { headers: { Cookie: ctx.office }, signal: ac.signal });
  assert.equal(r.status, 200);
  const reader = r.body!.getReader();
  const decoder = new TextDecoder();
  let seen = "";
  const until = async (needle: string) => {
    const deadline = Date.now() + 3000;
    while (!seen.includes(needle) && Date.now() < deadline) {
      const chunk = await Promise.race([reader.read(), new Promise<null>((res) => setTimeout(() => res(null), 200))]);
      if (chunk && !chunk.done) seen += decoder.decode(chunk.value);
    }
    return seen;
  };
  await until("event: ready");
  assert.equal((await ctx.request("/mural/settings", "PUT", { ...DEFAULTS, show_kwp: true }, ctx.admin)).status, 200);
  assert.match(await until("event: change"), /event: change/);
  ac.abort();
  await ctx.request("/mural/settings", "PUT", DEFAULTS, ctx.admin);
});
