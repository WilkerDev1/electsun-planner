import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { setup, endPool, cookieFrom, pool, type Ctx } from "./helpers.js";
import { listCompanies, listProjects, listStatuses, listTeams } from "../server/queries.js";
import { muralModel, shortName, type MuralInput, type MuralModel } from "../shared/mural-model.js";
import type { MuralSettings, MuralView, Notice } from "../shared/contracts/mural.js";
import type { LinkSecret, RedeemResult } from "../shared/contracts/access.js";

// F2·D — Mural de TV (MUR-01..13, AVI-01..03, CAL-08, EST-04, API-01/02). Hoy = martes 27 oct 2026.

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
  input = await loadInput();
});
after(async () => {
  await ctx.close();
  await endPool();
});

async function loadInput(): Promise<MuralInput> {
  const [projects, statuses, companies, teams, notices] = await Promise.all([
    listProjects(pool),
    listStatuses(pool),
    listCompanies(pool),
    listTeams(pool),
    pool.query("SELECT id,text,starts_on,expires_on,sort FROM notices ORDER BY sort").then((r) => r.rows as Notice[]),
  ]);
  return { projects, statuses, companies, teams, notices };
}

const model = (over: Partial<MuralSettings> = {}, data: MuralInput = input): MuralModel =>
  muralModel(data, { ...DEFAULTS, ...over }, TODAY);
const rowOf = (m: MuralModel, name: string) => m.active.rows.find((r) => r.name === name)!;
const barsOf = (m: MuralModel, code: string) => m.calendar.teams.find((t) => t.code === code)!.bars;

// ---------- Modelo (CAL-08), unitarias con la demo ----------

test("indicadores de la cabecera (MUR-02)", () => {
  const m = model();
  assert.deepEqual(
    m.kpis.map((k) => [k.key, k.n]),
    [["obra", 3], ["proximos", 6], ["porProgramar", 6], ["terminados", 1]],
  );
  assert.equal(m.kpis[0].sub, "182.7 kWp"); // 97.28 + 73.08 + 12.29
  assert.equal(m.kpis[2].sub, "incluye 1 en pausa");
  assert.equal(m.kpis[3].sub, "en octubre"); // Dulcería Mirabal terminó el 6 oct; las de septiembre no cuentan
  assert.equal(m.subtitle, "Instalaciones · Octubre 2026");
  assert.equal(m.active.nObra, 3);
  assert.equal(m.active.nProg, 6);
});

test("próximos: solo los programados que empiezan en los próximos 14 días", () => {
  const far = structuredClone(input);
  far.projects.find((p) => p.name === "Sr. Herrera")!.start_date = "2026-12-01";
  const m = model({}, far);
  assert.equal(m.kpis[1].n, 5);
  assert.equal(m.active.nProg, 6); // la lista sí lo muestra
});

test("Colegio Arcoíris: Día 8 de 11, con prioridad (MUR-03)", () => {
  const r = rowOf(model(), "Colegio Arcoíris");
  assert.equal(r.kind, "en_obra");
  assert.equal(r.progress!.text, "Día 8 de 11");
  assert.equal(r.progress!.late, 0);
  assert.equal(Math.round(r.progress!.ratio * 100), 73);
  assert.equal(r.progress!.endText, "hasta vie 30");
  assert.equal(r.priority, true);
  assert.deepEqual(r.team, { code: "E1", name: "Equipo 1" });
  assert.equal(r.dates, "19 – 30 oct");
  assert.equal(r.company.code, "EC");
  assert.equal(r.status.name, "En obra");
  assert.equal(r.kwp, null); // kWp apagado por defecto
});

test("Granja Los Pinos: atrasada +1 y con tramo de atraso (MUR-03, MUR-04, CAL-06)", () => {
  const m = model();
  const r = rowOf(m, "Granja Los Pinos");
  assert.equal(r.progress!.text, "Atrasada · +1 día");
  assert.equal(r.progress!.late, 1);
  assert.equal(r.progress!.ratio, 1);
  assert.equal(r.progress!.endText, "venció lun 26");
  const bar = barsOf(m, "E3").find((b) => b.name === "Granja Los Pinos")!;
  assert.equal(bar.kind, "obra");
  assert.deepEqual([bar.col, bar.span, bar.clipStart], [0, 1, true]);
  assert.deepEqual(bar.over, { col: 1, span: 1 }); // el martes 27, hoy
  assert.equal(bar.labelSide, "right");
  const tl = m.timeline.groups[0].rows.find((x) => x.name === "Granja Los Pinos")!;
  assert.equal(tl.when, "Atrasada · +1 día");
  assert.deepEqual(tl.over, { col: 1, span: 1 });
});

test("los activos van en obra primero y luego programados, con 'Inicia …' (MUR-03)", () => {
  const m = model();
  assert.deepEqual(
    m.active.rows.map((r) => r.name),
    [
      "Colegio Arcoíris", "Taller Motormax", "Granja Los Pinos",
      "Carla Méndez", "Tomás Rivera", "Lucía Esther Gómez Paredes", "Rafael Castillo Medina", "Andrés Polanco Ruiz", "Sr. Herrera",
    ],
  );
  assert.equal(rowOf(m, "Carla Méndez").countdown, "Inicia en 2 días");
  assert.equal(rowOf(m, "Carla Méndez").dates, "Jue 29 oct");
  assert.equal(rowOf(m, "Carla Méndez").note, "Parte 1");
  assert.equal(rowOf(m, "Taller Motormax").note, "Ver aviso");
  assert.equal(rowOf(m, "Taller Motormax").progress!.endText, "hasta vie 6 nov");
  assert.equal(rowOf(m, "Rafael Castillo Medina").dates, "3 – 4 nov");
});

test("calendario: barras de E1 a E3 con la colocación de CAL-03 (MUR-04)", () => {
  const m = model();
  assert.equal(m.calendar.cols, 12);
  assert.equal(m.calendar.rangeLabel, "26 oct – 7 nov · lunes a sábado");
  assert.equal(m.calendar.todayCol, 1);
  assert.deepEqual(m.calendar.days.slice(0, 3).map((d) => [d.label, d.n, d.today]), [["LUN", 26, false], ["MAR", 27, true], ["MIÉ", 28, false]]);
  assert.equal(m.calendar.days[6].weekStart, true);
  assert.deepEqual(m.calendar.teams.map((t) => t.code), ["E1", "E2", "E3"]);

  const summary = (code: string) => barsOf(m, code).map((b) => [b.name, b.kind, b.col, b.span, b.clipStart, b.clipEnd]);
  assert.deepEqual(summary("E1"), [
    ["Colegio Arcoíris", "obra", 0, 5, true, false],
    ["Lucía Gómez", "prog", 6, 1, false, false],
    ["Andrés Polanco", "prog", 8, 3, false, false],
  ]);
  assert.deepEqual(summary("E2"), [["Taller Motormax", "obra", 0, 11, true, false]]);
  assert.deepEqual(summary("E3"), [
    ["Granja Los Pinos", "obra", 0, 1, true, false],
    ["Carla Méndez", "prog", 3, 1, false, false],
    ["Tomás Rivera", "prog", 4, 1, false, false],
    ["Rafael Castillo", "prog", 7, 2, false, false],
    ["Sr. Herrera", "prog", 9, 2, false, false],
  ]);
  // Avance: Colegio lleva 2 columnas (lun y mar) dentro de lo visible; las programadas ninguna.
  assert.equal(barsOf(m, "E1")[0].done, 2);
  assert.equal(barsOf(m, "E1")[1].done, 0);
  // Etiquetas: dentro si caben, fuera si no.
  assert.equal(barsOf(m, "E2")[0].inside, true);
  assert.equal(barsOf(m, "E3")[1].inside, false);
});

test("'Por programar' con el motivo de espera y los pausados (MUR-05, CAL-07)", () => {
  const w = model().waiting;
  assert.deepEqual(
    w.items.map((i) => [i.name, i.sub, i.tone, i.priority]),
    [
      ["Paola Núñez", "Espera material y EDE", "wait", true],
      ["Kevin Almánzar", "Espera planos y material", "wait", false],
      ["Héctor Liriano Sosa", "Esperando documentos del cliente", "pause", false],
      ["Oficina Evolta", "Espera EDE", "wait", false],
      ["Proyecto Elena Cabrera", "Espera material", "wait", false],
      ["Villa Serena (Mario Abreu)", "Lista para programar", "ready", false],
    ],
  );
  assert.equal(w.text, "5 en espera · 1 en pausa");
  assert.equal(w.more, 0);
  assert.equal(w.items[0].days, 18); // vendido el 9 oct
  assert.ok(w.items.every((i) => i.sub !== "Espera "));
});

test("Dulcería Mirabal en 'Esperando medidor' (MUR-06)", () => {
  const m = model();
  assert.equal(m.meter.items.length, 1);
  assert.equal(m.meter.items[0].text, "Dulcería Mirabal · Bonao · terminada el 6 oct");
  // Los terminados no aparecen en ninguna lista.
  assert.ok(!m.active.rows.some((r) => r.name === "Dulcería Mirabal" || r.name === "Panadería La Espiga"));
});

test("avisos: generales primero, caducados fuera, como mucho 3 (AVI-01..03)", () => {
  const m = model();
  assert.deepEqual(
    m.notices.map((n) => [n.general, n.project, n.text]),
    [
      [true, null, "Reunión de seguridad el sábado a las 8:00 en la oficina"],
      [true, null, "Usar arnés en todos los techos de más de 2 m"],
      [false, "Taller Motormax", "Faltan grapas; llegan mié 28 en la mañana"],
    ],
  );

  const data = structuredClone(input);
  const n = (text: string, starts_on: string, expires_on: string, sort: number): Notice => ({ id: text, text, starts_on, expires_on, sort });
  data.notices = [
    n("Vencido ayer", "2026-10-01", "2026-10-26", 0),
    n("Empieza mañana", "2026-10-28", "2026-11-05", 0),
    n("Hasta hoy", "2026-10-20", TODAY, 1),
    ...data.notices,
  ];
  const texts = model({}, data).notices.map((x) => x.text);
  assert.equal(texts.length, 3);
  assert.ok(!texts.includes("Vencido ayer"));
  assert.ok(!texts.includes("Empieza mañana"));
  assert.equal(texts[0], "Reunión de seguridad el sábado a las 8:00 en la oficina"); // sort 0 antes que sort 1
  assert.ok(texts.includes("Hasta hoy"));

  // Una observación caducada (mural_until pasó) tampoco sale.
  const old = structuredClone(input);
  old.projects.find((p) => p.name === "Taller Motormax")!.mural_until = "2026-10-26";
  old.notices = [];
  assert.deepEqual(model({}, old).notices.map((x) => x.project), ["Carla Méndez", "Tomás Rivera"]);
  // Con el interruptor de observaciones apagado, solo los avisos generales.
  assert.ok(model({ show_notes: false }).notices.every((x) => x.general));
});

test("weeks=3 produce 18 columnas (MUR-04, MUR-08)", () => {
  const m = model({ weeks: 3 });
  assert.equal(m.calendar.cols, 18);
  assert.equal(m.calendar.days.length, 18);
  assert.equal(m.calendar.rangeLabel, "26 oct – 14 nov · lunes a sábado");
  assert.equal(m.timeline.cols, 18);
  assert.equal(m.timeline.days.length, 18);
  assert.deepEqual(m.timeline.weekLabels, ["Esta semana", "Próxima semana", "En 2 semanas"]);
  assert.equal(model({ weeks: 4 }).calendar.days.length, 24);
  assert.equal(model({ weeks: 2 }).timeline.weekLabels.length, 2);
  // Con más semanas cabe un proyecto que con 2 quedaba fuera.
  const far = structuredClone(input);
  Object.assign(far.projects.find((p) => p.name === "Sr. Herrera")!, { start_date: "2026-11-12", end_date: "2026-11-13" });
  assert.equal(barsOf(model({}, far), "E3").some((b) => b.name === "Sr. Herrera"), false);
  assert.equal(barsOf(model({ weeks: 3 }, far), "E3").some((b) => b.name === "Sr. Herrera"), true);
});

test("orden con prioridad primero (MUR-03)", () => {
  const data = structuredClone(input);
  data.projects.find((p) => p.name === "Sr. Herrera")!.priority = true;
  const byDate = model({}, data).active.rows.filter((r) => r.kind === "programado").map((r) => r.name);
  const byPriority = model({ upcoming_order: "prioridad" }, data).active.rows.filter((r) => r.kind === "programado").map((r) => r.name);
  assert.equal(byDate[0], "Carla Méndez");
  assert.equal(byPriority[0], "Sr. Herrera");
  assert.deepEqual(byPriority.slice(1), byDate.slice(0, -1)); // el resto conserva el orden por fecha
  // En obra: Colegio (prioridad) ya iba primero; con la prioridad en Granja pasa delante de Motormax.
  data.projects.find((p) => p.name === "Granja Los Pinos")!.priority = true;
  const obra = model({ upcoming_order: "prioridad" }, data).active.rows.filter((r) => r.kind === "en_obra").map((r) => r.name);
  assert.deepEqual(obra, ["Colegio Arcoíris", "Granja Los Pinos", "Taller Motormax"]);
});

test("los interruptores de la configuración cambian lo que se muestra (MUR-09)", () => {
  const on = model({ show_kwp: true });
  assert.equal(rowOf(on, "Colegio Arcoíris").kwp, "97.28");
  assert.match(on.timeline.groups[0].rows[0].place, /97\.28 kWp$/);
  assert.equal(rowOf(model({ show_priority: false }), "Colegio Arcoíris").priority, false);
  assert.equal(model({ show_priority: false }).waiting.items[0].priority, false);
  const noWait = model({ show_waiting: false });
  assert.equal(noWait.waiting.show, false);
  assert.equal(noWait.waiting.items.length, 0);
  assert.equal(noWait.kpis[2].n, 6); // el indicador no depende del interruptor
  assert.equal(noWait.meter.items.length, 1); // "Esperando medidor" no tiene interruptor
  const noNotes = model({ show_notes: false });
  assert.equal(rowOf(noNotes, "Carla Méndez").note, null);
  assert.doesNotMatch(noNotes.timeline.groups[1].rows[0].place, /parte/);
});

test("timeline: filas por proyecto activo con su barra (MUR-08)", () => {
  const m = model();
  const [obra, prog] = m.timeline.groups;
  assert.deepEqual([obra.label, prog.label], ["EN OBRA", "PRÓXIMOS"]);
  assert.equal(obra.rows.length, 3);
  assert.equal(prog.rows.length, 6);
  assert.deepEqual(m.timeline.counts, { obra: 3, prog: 6, waiting: 6 });
  const colegio = obra.rows[0];
  assert.deepEqual([colegio.team, colegio.when, colegio.whenSub, colegio.bar.text], ["E1", "Día 8 de 11", "termina vie 30", "desde 19 oct"]);
  assert.equal(colegio.priority, true);
  const carla = prog.rows[0];
  assert.deepEqual([carla.when, carla.whenSub, carla.place], ["Jue 29 oct", "1 día", "Santo Domingo · parte 1"]);
  assert.deepEqual([carla.bar.col, carla.bar.span, carla.bar.text], [3, 1, ""]);
  assert.equal(prog.rows[3].whenSub, "2 días"); // Rafael Castillo, 3 y 4 nov
  assert.equal(obra.solid, "#0B7A68");
  assert.equal(prog.solid, "#6172F3");
});

test("los proyectos archivados no se muestran y 'hoy' mueve la cuadrícula", () => {
  const data = structuredClone(input);
  data.projects.find((p) => p.name === "Taller Motormax")!.archived = true;
  assert.equal(model({}, data).active.nObra, 2);
  // Un domingo la cuadrícula sigue empezando el lunes y la línea de hoy cae al final del sábado.
  const sunday = muralModel(input, DEFAULTS, "2026-11-01");
  assert.equal(sunday.calendar.from, "2026-10-26");
  assert.equal(sunday.calendar.todayCol, 5);
  assert.equal(sunday.calendar.todayAtEnd, true);
  // La semana siguiente: hoy pasa a la segunda semana.
  const next = muralModel(input, DEFAULTS, "2026-11-03");
  assert.equal(next.calendar.from, "2026-11-02");
  assert.equal(next.calendar.todayCol, 1);
});

test("nombre corto para el calendario", () => {
  assert.equal(shortName("Lucía Esther Gómez Paredes"), "Lucía Gómez");
  assert.equal(shortName("Rafael Castillo Medina"), "Rafael Castillo");
  assert.equal(shortName("Andrés Polanco Ruiz"), "Andrés Polanco");
  assert.equal(shortName("Granja Los Pinos"), "Granja Los Pinos");
  assert.equal(shortName("Sr. Herrera"), "Sr. Herrera");
  assert.equal(shortName("Villa Serena (Mario Abreu)"), "Villa Serena");
});

// ---------- Ajustes: GET/PUT /api/mural/settings (MUR-09, ROL-02) ----------

/** Lee un flujo SSE hasta que aparezca `needle`. */
async function openStream(path: string, cookie: string) {
  const ac = new AbortController();
  const r = await fetch(ctx.base + "/api" + path, { headers: cookie ? { Cookie: cookie } : {}, signal: ac.signal });
  const reader = r.body?.getReader();
  const decoder = new TextDecoder();
  let seen = "";
  return {
    status: r.status,
    async until(needle: string, ms = 3000) {
      const deadline = Date.now() + ms;
      while (!seen.includes(needle) && Date.now() < deadline && reader) {
        const chunk = await Promise.race([reader.read(), new Promise<null>((resolve) => setTimeout(() => resolve(null), 200))]);
        if (chunk && !chunk.done) seen += decoder.decode(chunk.value);
      }
      return seen;
    },
    close: () => ac.abort(),
  };
}

const auditCount = async (action: string) => Number((await pool.query("SELECT count(*) FROM audit WHERE action=$1", [action])).rows[0].count);

test("ajustes: cualquier cuenta lee, solo el administrador escribe (ROL-02)", async () => {
  assert.equal((await ctx.request("/mural/settings")).status, 401);
  const office = await ctx.request<MuralSettings>("/mural/settings", "GET", undefined, ctx.office);
  assert.equal(office.status, 200);
  assert.deepEqual(office.data, DEFAULTS);

  const denied = await ctx.request("/mural/settings", "PUT", { ...DEFAULTS, weeks: 4 }, ctx.office);
  assert.equal(denied.status, 403);
  assert.equal((await ctx.request("/mural/settings", "PUT", { ...DEFAULTS, weeks: 4 })).status, 401);
  assert.equal((await ctx.request<MuralSettings>("/mural/settings", "GET", undefined, ctx.admin)).data.weeks, 2);
});

test("ajustes: el administrador guarda, queda auditado y valida (MUR-09, HIS-01)", async () => {
  const before = await auditCount("mural.settings");
  const next: MuralSettings = { ...DEFAULTS, design: "timeline", weeks: 3, upcoming_order: "prioridad", show_kwp: true, show_clock: false };
  const r = await ctx.request<MuralSettings>("/mural/settings", "PUT", next, ctx.admin);
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, next);
  assert.deepEqual((await ctx.request("/mural/settings", "GET", undefined, ctx.office)).data, next);
  assert.equal(await auditCount("mural.settings"), before + 1);
  const entry = (await pool.query("SELECT diff,actor_id FROM audit WHERE action='mural.settings' ORDER BY id DESC LIMIT 1")).rows[0];
  assert.equal(entry.actor_id, ctx.adminId);
  assert.deepEqual(entry.diff.weeks, [2, 3]);
  assert.deepEqual(entry.diff.design, ["principal", "timeline"]);

  // Sin cambios no se audita ni se publica.
  await ctx.request("/mural/settings", "PUT", next, ctx.admin);
  assert.equal(await auditCount("mural.settings"), before + 1);

  for (const bad of [{ ...next, weeks: 5 }, { ...next, design: "otro" }, { ...next, show_kwp: "sí" }, { design: "principal" }]) {
    assert.equal((await ctx.request("/mural/settings", "PUT", bad, ctx.admin)).status, 422, JSON.stringify(bad));
  }
  assert.deepEqual((await ctx.request("/mural/settings", "GET", undefined, ctx.admin)).data, next);
  await ctx.request("/mural/settings", "PUT", DEFAULTS, ctx.admin);
});

test("PUT /settings emite 'change' por SSE (API-01, MUR-10)", async () => {
  const stream = await openStream("/events", ctx.office);
  assert.equal(stream.status, 200);
  assert.match(await stream.until("event: ready"), /event: ready/);
  const r = await ctx.request("/mural/settings", "PUT", { ...DEFAULTS, show_clock: false }, ctx.admin);
  assert.equal(r.status, 200);
  assert.match(await stream.until("event: change"), /event: change\ndata: \{"version":\d+,"reason":"mural\.settings"\}/);
  stream.close();
  await ctx.request("/mural/settings", "PUT", DEFAULTS, ctx.admin);
});

// ---------- Avisos: /api/notices (AVI-02) ----------

test("avisos generales: CRUD, validación, auditoría y publicación (AVI-02, ROL-02)", async () => {
  assert.equal((await ctx.request("/notices")).status, 401);
  const list = await ctx.request<Notice[]>("/notices", "GET", undefined, ctx.office);
  assert.equal(list.status, 200);
  assert.equal(list.data.length, 2);
  assert.deepEqual(Object.keys(list.data[0]).sort(), ["expires_on", "id", "sort", "starts_on", "text"]);

  assert.equal((await ctx.request("/notices", "POST", { text: "Sin sesión", starts_on: TODAY, expires_on: TODAY })).status, 401);
  const base = { text: "Cierre de oficina el viernes", starts_on: TODAY, expires_on: "2026-10-30" };
  for (const bad of [
    { ...base, text: "" },
    { ...base, text: "x".repeat(141) },
    { ...base, starts_on: "27/10/2026" },
    { ...base, expires_on: "2026-10-26" },
    { text: "Falta la fecha" },
  ])
    assert.equal((await ctx.request("/notices", "POST", bad, ctx.office)).status, 422, JSON.stringify(bad));

  const stream = await openStream("/events", ctx.admin);
  await stream.until("event: ready");
  const created = await ctx.request<Notice>("/notices", "POST", base, ctx.office);
  assert.equal(created.status, 201);
  assert.deepEqual({ ...created.data, id: "" }, { id: "", sort: 0, ...base });
  assert.match(await stream.until("event: change"), /"reason":"notice"/);
  assert.equal(await auditCount("notice.create"), 1);

  // Aparece en el mural.
  const view = await ctx.request<MuralView>("/view/mural", "GET", undefined, ctx.office);
  assert.ok(view.data.model.notices.some((n) => n.text === base.text));

  const id = created.data.id;
  const patched = await ctx.request<Notice>(`/notices/${id}`, "PATCH", { text: "Cierre de oficina el sábado", expires_on: "2026-10-31" }, ctx.office);
  assert.equal(patched.status, 200);
  assert.equal(patched.data.text, "Cierre de oficina el sábado");
  assert.equal(patched.data.starts_on, TODAY);
  assert.equal(await auditCount("notice.update"), 1);
  // La caducidad no puede quedar antes del inicio, aunque solo se envíe un campo.
  assert.equal((await ctx.request(`/notices/${id}`, "PATCH", { expires_on: "2026-10-01" }, ctx.office)).status, 422);
  assert.equal((await ctx.request(`/notices/${id}`, "PATCH", { text: "" }, ctx.office)).status, 422);
  assert.equal((await ctx.request("/notices/no-es-un-id", "PATCH", { text: "x" }, ctx.office)).status, 404);
  assert.equal((await ctx.request("/notices/00000000-0000-4000-8000-000000000000", "PATCH", { text: "x" }, ctx.office)).status, 404);

  // Caducar un aviso lo quita del mural pero no de la lista de Configuración.
  await ctx.request(`/notices/${id}`, "PATCH", { starts_on: "2026-10-01", expires_on: "2026-10-26" }, ctx.admin);
  assert.ok(!(await ctx.request<MuralView>("/view/mural", "GET", undefined, ctx.office)).data.model.notices.some((n) => n.text === patched.data.text));
  assert.ok((await ctx.request<Notice[]>("/notices", "GET", undefined, ctx.office)).data.some((n) => n.id === id));

  const del = await ctx.request(`/notices/${id}`, "DELETE", undefined, ctx.office);
  assert.equal(del.status, 204);
  assert.equal((await ctx.request(`/notices/${id}`, "DELETE", undefined, ctx.office)).status, 404);
  assert.equal(await auditCount("notice.delete"), 1);
  assert.equal((await ctx.request<Notice[]>("/notices", "GET", undefined, ctx.office)).data.length, 2);
  stream.close();
});

// ---------- Vista: GET /api/view/mural (MUR, CAL-08, ROL-02) ----------

test("/view/mural con una cuenta devuelve el modelo, las empresas y los equipos (MUR-01, CAL-08)", async () => {
  assert.equal((await ctx.request("/view/mural")).status, 401);
  for (const cookie of [ctx.admin, ctx.office]) {
    const r = await ctx.request<MuralView>("/view/mural", "GET", undefined, cookie);
    assert.equal(r.status, 200);
    assert.equal(r.data.today, TODAY);
    assert.deepEqual(r.data.settings, DEFAULTS);
    assert.ok(!Number.isNaN(Date.parse(r.data.generatedAt)));
    assert.deepEqual(r.data.model, JSON.parse(JSON.stringify(model())));
    assert.deepEqual(r.data.companies.map((c) => c.code).sort(), ["CO", "EC", "EL", "EN", "EV"]);
    assert.deepEqual(r.data.teams.map((t) => t.code), ["E1", "E2", "E3"]);
  }
  // No filtra teléfonos ni datos de cuentas.
  const raw = JSON.stringify((await ctx.request("/view/mural", "GET", undefined, ctx.admin)).data);
  assert.ok(!raw.includes("809-555") && !raw.includes("example.test"));
});

test("/view/mural: una cuenta puede probar ajustes sin guardarlos (vista previa)", async () => {
  const r = await ctx.request<MuralView>("/view/mural?weeks=3&show_kwp=1&design=timeline&show_waiting=false", "GET", undefined, ctx.office);
  assert.equal(r.status, 200);
  assert.equal(r.data.settings.weeks, 3);
  assert.equal(r.data.settings.design, "timeline");
  assert.equal(r.data.model.calendar.cols, 18);
  assert.equal(r.data.model.waiting.show, false);
  assert.equal(r.data.model.active.rows[0].kwp, "97.28");
  assert.equal((await ctx.request("/view/mural?weeks=9", "GET", undefined, ctx.office)).status, 422);
  assert.deepEqual((await ctx.request("/mural/settings", "GET", undefined, ctx.office)).data, DEFAULTS);
});

test("/view/mural con el enlace de TV: 200 con la cookie y 403 tras revocarlo (ACC-03, ACC-04, ACC-05, ROL-02)", async () => {
  // Una TV sin cookie, o con un id que no es de ella, no entra.
  assert.equal((await ctx.request("/view/mural?link=00000000-0000-4000-8000-000000000000")).status, 403);
  assert.equal((await ctx.request("/view/mural?link=no-es-un-id")).status, 403);

  const created = await ctx.request<LinkSecret>("/access-links", "POST", { kind: "tv", name: "TV sala de juntas" }, ctx.admin);
  assert.equal(created.status, 201);
  const [, secret] = created.data.path.split("#");
  const linkId = created.data.link.id;
  assert.equal(created.data.path, `/tv/${linkId}#${secret}`);
  assert.equal(created.data.link.last_seen_at, null);

  assert.equal((await ctx.request(`/view/mural?link=${linkId}`)).status, 403); // aún sin canjear

  const redeem = await ctx.request<RedeemResult>("/access/session", "POST", { token: secret, id: linkId });
  assert.equal(redeem.status, 200);
  assert.equal(redeem.data.redirect, `/tv/${linkId}`);
  const tv = cookieFrom(redeem.headers, `planner_tv_${linkId}`);
  assert.ok(tv);

  const ok = await ctx.request<MuralView>(`/view/mural?link=${linkId}`, "GET", undefined, tv);
  assert.equal(ok.status, 200);
  assert.equal(ok.data.model.active.nObra, 3);
  assert.equal(ok.data.today, TODAY);
  // La TV no puede cambiar los ajustes con parámetros ni escribir nada.
  const forced = await ctx.request<MuralView>(`/view/mural?link=${linkId}&weeks=4`, "GET", undefined, tv);
  assert.equal(forced.data.settings.weeks, 2);
  assert.equal((await ctx.request("/mural/settings", "GET", undefined, tv)).status, 401);
  assert.equal((await ctx.request("/mural/settings", "PUT", DEFAULTS, tv)).status, 401);
  assert.equal((await ctx.request("/projects", "GET", undefined, tv)).status, 401);
  assert.equal((await ctx.request("/view/mural", "GET", undefined, tv)).status, 401); // sin ?link no hay dispositivo
  // La cookie de una TV no abre otra.
  const other = await ctx.request<LinkSecret>("/access-links", "POST", { kind: "tv", name: "TV oficina" }, ctx.admin);
  assert.equal((await ctx.request(`/view/mural?link=${other.data.link.id}`, "GET", undefined, tv)).status, 403);

  // Última conexión (ACC-05).
  const listed = await ctx.request<{ id: string; last_seen_at: string | null }[]>("/access-links?kind=tv", "GET", undefined, ctx.admin);
  assert.ok(listed.data.find((l) => l.id === linkId)!.last_seen_at);

  // La TV recibe 'change' por SSE con su enlace (API-02).
  const stream = await openStream(`/events?link=${linkId}`, tv);
  assert.equal(stream.status, 200);
  assert.match(await stream.until("event: ready"), /event: ready/);
  stream.close();

  // Revocado: 403 en la siguiente petición.
  assert.equal((await ctx.request(`/access-links/${linkId}/revoke`, "POST", undefined, ctx.admin)).status, 200);
  const denied = await ctx.request(`/view/mural?link=${linkId}`, "GET", undefined, tv);
  assert.equal(denied.status, 403);
  assert.match(denied.data.message, /desactivado/);
  assert.equal((await openStream(`/events?link=${linkId}`, tv)).status, 401);

  // Rotado: el enlace nuevo funciona y la cookie vieja no.
  const rotated = await ctx.request<LinkSecret>(`/access-links/${other.data.link.id}/rotate`, "POST", undefined, ctx.admin);
  const again = await ctx.request("/access/session", "POST", { token: rotated.data.path.split("#")[1], id: other.data.link.id });
  const tv2 = cookieFrom(again.headers, `planner_tv_${other.data.link.id}`);
  assert.equal((await ctx.request(`/view/mural?link=${other.data.link.id}`, "GET", undefined, tv2)).status, 200);
});

test("/view/mural responde en menos de 300 ms con 500 proyectos (NF-05)", async () => {
  await pool.query(
    `INSERT INTO projects(id,company_id,name,kwp,place,team_id,start_date,end_date,estimated_days,status_id,system_type,prep_plans,prep_materials,prep_ede)
     SELECT gen_random_uuid(),(SELECT id FROM companies ORDER BY name LIMIT 1),'Carga ' || g,5.5,'Santiago',
       (SELECT id FROM teams WHERE code='E'||(1+g%3)), DATE '2026-10-26' + (g%10), DATE '2026-10-26' + (g%10) + 2, 3,
       (SELECT id FROM statuses WHERE kind = CASE WHEN g%5=0 THEN 'en_obra' WHEN g%5=1 THEN 'programado' ELSE 'por_programar' END),
       'neta', true, false, false
     FROM generate_series(1,500) g`,
  );
  try {
    await ctx.request("/view/mural", "GET", undefined, ctx.admin); // calienta el pool
    const times: number[] = [];
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      const r = await ctx.request<MuralView>("/view/mural", "GET", undefined, ctx.admin);
      times.push(performance.now() - t0);
      assert.equal(r.status, 200);
      assert.ok(r.data.model.active.rows.length > 100);
    }
    assert.ok(Math.min(...times) < 300, `tardó ${Math.round(Math.min(...times))} ms`);
  } finally {
    await pool.query("DELETE FROM projects WHERE name LIKE 'Carga %'");
  }
});

test("los estados editados (EST-04) cambian los colores del mural", async () => {
  const statuses = (await ctx.request<{ id: string; kind: string; version: number }[]>("/statuses", "GET", undefined, ctx.admin)).data;
  const obra = statuses.find((s) => s.kind === "en_obra")!;
  const stream = await openStream("/events", ctx.office);
  await stream.until("event: ready");
  const patch = await ctx.request(`/statuses/${obra.id}`, "PATCH", { version: obra.version, name: "Instalando", fg: "#157F3D", bg: "#E7F7EE", dot: "#16A34A" }, ctx.admin);
  assert.equal(patch.status, 200);
  assert.match(await stream.until("event: change"), /event: change/);
  stream.close();
  const view = (await ctx.request<MuralView>("/view/mural", "GET", undefined, ctx.office)).data;
  const row = view.model.active.rows.find((r) => r.name === "Colegio Arcoíris")!;
  assert.deepEqual(row.status, { name: "Instalando", fg: "#157F3D", bg: "#E7F7EE", dot: "#16A34A" });
  assert.equal(view.model.timeline.groups[0].solid, "#16A34A");
  // Oficina no puede editar estados (ROL-02).
  assert.equal((await ctx.request(`/statuses/${obra.id}`, "PATCH", { version: obra.version + 1, name: "Otro" }, ctx.office)).status, 403);
  await pool.query("UPDATE statuses SET name='En obra',fg='#095C4F',bg='#E0F4EF',dot='#0B7A68' WHERE id=$1", [obra.id]);
});
