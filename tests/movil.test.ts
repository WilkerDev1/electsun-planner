// F2·E — Mural móvil: mobileModel (CAL-09, MOV-02..05, MOV-08) y GET /api/view/movil (ROL-02, ACC-04, ACC-06, MOV-09).
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { setup, endPool, cookieFrom, type Ctx } from "./helpers.js";
import { mobileModel, type MobileInput } from "../shared/movil-model.js";
import { demoCompanies, demoEmployees, demoNotices, demoProjects, demoTeams } from "../shared/seed-demo.js";
import { isWorkday } from "../shared/domain.js";
import type { StatusKind } from "../shared/domain.js";
import type { MovilView } from "../shared/contracts/movil.js";

const TODAY = "2026-10-27";

let ctx: Ctx;
before(async () => {
  ctx = await setup();
});
after(async () => {
  await ctx.close();
  await endPool();
});

// ---------- Datos de la demo en memoria (sin base de datos) ----------

const STATUS_KIND: Record<string, StatusKind> = {
  "Por programar": "por_programar",
  Programado: "programado",
  "En obra": "en_obra",
  "En pausa": "en_pausa",
  Terminado: "terminado",
  "Esperando medidor": "post_obra",
};

function demoInput(): MobileInput {
  const uuid = () => crypto.randomUUID();
  const statuses = Object.entries(STATUS_KIND).map(([name, kind]) => ({ id: uuid(), name, kind }));
  const companies = demoCompanies.map((c) => ({ id: uuid(), ...c }));
  const teams = demoTeams.map((t) => ({ id: uuid(), code: t.code, name: t.name, lead_employee_id: null as string | null, active: true }));
  const employees = demoEmployees.map((e) => ({
    id: uuid(),
    name: e.name,
    job: e.job,
    level: e.level,
    team_id: teams.find((t) => t.code === e.team)?.id ?? null,
    state: e.state ?? ("Activo" as const),
    phone: e.phone,
  }));
  for (const t of demoTeams) teams.find((x) => x.code === t.code)!.lead_employee_id = employees.find((e) => e.name === t.lead)!.id;
  const projects = demoProjects.map((p) => {
    const status = statuses.find((s) => s.name === p.status)!;
    return {
      id: uuid(),
      company_id: companies.find((c) => c.name === p.company)!.id,
      name: p.name,
      kwp: p.kwp,
      place: p.place,
      lead_employee_id: null,
      team_id: teams.find((t) => t.code === p.team)?.id ?? null,
      start_date: p.start || null,
      end_date: p.end || null,
      status_id: status.id,
      status_kind: status.kind,
      notes: p.notes ?? "",
      show_on_mural: !!p.mural,
      mural_until: p.mural ? "2026-10-30" : null,
      priority: !!p.priority,
      part: p.part ?? "",
      system_type: p.type,
      prep_plans: p.prep[0],
      prep_materials: p.prep[1],
      prep_ede: p.prep[2],
      archived: false,
    };
  });
  const notices = demoNotices.map((n, i) => ({ id: uuid(), text: n.text, starts_on: TODAY, expires_on: "2026-11-30", sort: i }));
  return { employees, teams, companies, statuses, projects, notices };
}

const input = demoInput();
const viewFor = (name: string) => mobileModel(input, input.employees.find((e) => e.name === name)!.id, TODAY);
const phoneOf = (name: string) => demoEmployees.find((e) => e.name === name)!.phone;

// ---------- Unitarias de mobileModel (CAL-09) ----------

test("técnico de E1: hoy le toca Colegio Arcoíris, día 8 de 11 (MOV-02)", () => {
  const v = viewFor("Luis Peña");
  assert.equal(v.me.first_name, "Luis");
  assert.equal(v.me.team_code, "E1");
  assert.equal(v.date_text, "Martes 27 de octubre");
  const cur = v.hoy.current!;
  assert.equal(cur.name, "Colegio Arcoíris");
  assert.equal(cur.when_text, "Día 8 de 11");
  assert.equal(cur.day, 8);
  assert.equal(cur.days_total, 11);
  assert.equal(cur.late_days, 0);
  assert.equal(cur.place, "La Romana");
  assert.equal(cur.priority, true);
  assert.equal(cur.status_label, "Instalando");
  assert.equal(cur.end_text, "hasta el vie 30");
  assert.equal(cur.dates_text, "19 – 30 oct");
  assert.equal(cur.segments.length, 11);
  assert.deepEqual(cur.segments.slice(0, 9).map((s) => s), ["done", "done", "done", "done", "done", "done", "done", "today", "todo"]);
  // Encargado con teléfono y enlace a Maps.
  assert.deepEqual(cur.lead, { name: "Ramón Tejada", phone: phoneOf("Ramón Tejada") });
  assert.equal(cur.supervisor?.name, "Miguel Fermín");
  assert.equal(
    cur.map_url,
    "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("La Romana, República Dominicana"),
  );
  assert.equal(decodeURIComponent(cur.map_url!.split("query=")[1]), "La Romana, República Dominicana");
  // La tira de la semana: lun a sáb, hoy marcado; la obra llega al vie 30 y el sáb 31 el equipo queda libre.
  assert.deepEqual(v.hoy.week.map((d) => d.dow), ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"]);
  assert.deepEqual(v.hoy.week.map((d) => d.is_today), [false, true, false, false, false, false]);
  assert.deepEqual(v.hoy.week.map((d) => d.state), ["obra", "obra", "obra", "obra", "obra", "libre"]);
});

test("técnico de E1: lo próximo del equipo y los avisos (MOV-02)", () => {
  const v = viewFor("Luis Peña");
  assert.deepEqual(v.hoy.next.map((j) => j.name), ["Lucía Esther Gómez Paredes", "Andrés Polanco Ruiz"]);
  assert.equal(v.hoy.next[0].when_text, "Inicia en 6 días");
  assert.equal(v.hoy.next[0].duration_text, "1 día");
  assert.equal(v.hoy.next[1].duration_text, "3 días");
  assert.deepEqual(
    v.hoy.notices.map((n) => n.text),
    demoNotices.map((n) => n.text),
  );
  // Los avisos del mural de otro equipo (Taller Motormax, E2) no aparecen entre los de E1.
  assert.ok(!v.hoy.notices.some((n) => n.title === "Taller Motormax"));
  assert.deepEqual(
    v.team!.members.map((m) => [m.name, m.is_lead, m.is_me]),
    [
      ["Ramón Tejada", true, false],
      ["Kelvin Rosario", false, false],
      ["Luis Peña", false, true],
    ],
  );
});

test("técnico de E1: ningún teléfono de técnicos de E2 ni E3, ni de oficina (MOV-08)", () => {
  const v = viewFor("Luis Peña");
  const json = JSON.stringify(v);
  for (const hidden of ["Wander Ortiz", "Félix Santana", "Starlin Reyes", "Manuel Vargas", "Yokasta Rodríguez", "Carlos Batista", "Ana Guzmán"])
    assert.ok(!json.includes(phoneOf(hidden)), `no debe incluir el teléfono de ${hidden}`);
  // Su propio número y el de quien está de vacaciones tampoco viajan; el encargado y el supervisor sí.
  assert.ok(!json.includes(phoneOf("Luis Peña")));
  assert.ok(!json.includes(phoneOf("Kelvin Rosario")));
  for (const shown of ["Ramón Tejada", "Miguel Fermín", "Juan Carlos Méndez", "Pedro Almonte"])
    assert.ok(json.includes(phoneOf(shown)), `debe incluir el teléfono de ${shown}`);
  // Los integrantes de otro equipo se ven por nombre, sin teléfono salvo el encargado.
  const motormax = Object.values(v.detail).find((d) => d.name === "Taller Motormax")!;
  const phones = Object.fromEntries(motormax.team!.members.map((m) => [m.name, m.phone]));
  assert.equal(phones["Juan Carlos Méndez"], phoneOf("Juan Carlos Méndez"));
  assert.equal(phones["Wander Ortiz"], null);
  assert.equal(phones["Félix Santana"], null);
  // Nunca correos ni datos de cuentas.
  assert.ok(!/@|email|password|users/i.test(json));
});

test("técnico de E1: la agenda de 3 semanas no incluye domingos (MOV-04)", () => {
  const v = viewFor("Luis Peña");
  const days = v.calendario.agenda;
  assert.equal(days.length, 18);
  assert.equal(days[0].date, "2026-10-26");
  assert.equal(days[17].date, "2026-11-14");
  assert.ok(days.every((d) => isWorkday(d.date)));
  assert.ok(!days.some((d) => d.dow === "DOM"));
  assert.equal(days.filter((d) => d.is_today).length, 1);
  assert.equal(days.find((d) => d.is_today)!.date, TODAY);
  // Las obras de mi equipo van primero dentro del día.
  const tue = days.find((d) => d.date === TODAY)!;
  assert.equal(tue.items[0].name, "Colegio Arcoíris");
  assert.equal(tue.items[0].tag, "Día 8/11");
  assert.equal(tue.items[0].mine, true);
});

test("técnico de E3: Granja Los Pinos aparece atrasada (CAL-06)", () => {
  const v = viewFor("Starlin Reyes");
  const cur = v.hoy.current!;
  assert.equal(cur.name, "Granja Los Pinos");
  assert.equal(cur.late_days, 1);
  assert.equal(cur.when_text, "Atrasada · +1 día");
  assert.equal(cur.end_text, "debía terminar el lun 26");
  assert.equal(cur.progress, 1);
  assert.ok(cur.segments.every((s) => s === "done"));
  // Agenda: atrasada hoy, ya no al día siguiente.
  const items = (date: string) => v.calendario.agenda.find((d) => d.date === date)!.items.filter((i) => i.name === "Granja Los Pinos");
  assert.equal(items("2026-10-27")[0].tag, "Atrasada");
  assert.equal(items("2026-10-27")[0].tone, "atrasada");
  assert.equal(items("2026-10-26")[0].tag, "Día 4/4");
  assert.equal(items("2026-10-28").length, 0);
  // Línea de tiempo: la barra llega hasta el lunes 26 y el tramo de atraso es hoy.
  const tl = v.calendario.timeline;
  assert.equal(tl.from, "2026-10-19");
  assert.equal(tl.days.length, 18);
  assert.equal(tl.today_col, 7);
  assert.equal(tl.days[tl.today_col].date, TODAY);
  const lane = tl.lanes.find((l) => l.team_code === "E3")!;
  assert.equal(lane.mine, true);
  const bar = lane.bars.find((b) => b.name === "Granja Los Pinos")!;
  assert.deepEqual([bar.col, bar.span, bar.clip_start, bar.clip_end], [3, 4, false, false]);
  assert.deepEqual(bar.overrun, { col: 7, span: 1 });
  assert.equal(bar.done_cols, 4);
  // Las barras del equipo se ordenan por fecha y las programadas no tienen avance.
  assert.deepEqual(lane.bars.map((b) => b.name), ["Granja Los Pinos", "Carla Méndez", "Tomás Rivera", "Rafael Castillo Medina", "Sr. Herrera"]);
  assert.equal(lane.bars.find((b) => b.name === "Carla Méndez")!.done_cols, 0);
});

test("obras: activas y próximas de todos los equipos, con las mías marcadas (MOV-03)", () => {
  const v = viewFor("Luis Peña");
  assert.deepEqual(v.obras.en_obra.map((j) => j.name), ["Colegio Arcoíris", "Taller Motormax", "Granja Los Pinos"]);
  assert.deepEqual(v.obras.en_obra.map((j) => j.mine), [true, false, false]);
  assert.equal(v.obras.proximas.length, 6);
  assert.deepEqual(v.obras.proximas.filter((j) => j.mine).map((j) => j.name), ["Lucía Esther Gómez Paredes", "Andrés Polanco Ruiz"]);
  assert.equal(v.obras.proximas[0].mine, true);
  assert.equal(v.obras.por_programar, 5);
  assert.equal(v.obras.en_pausa, 1);
  // No aparecen terminadas ni "esperando medidor".
  const names = [...v.obras.en_obra, ...v.obras.proximas].map((j) => j.name);
  assert.ok(!names.includes("Lácteos del Valle") && !names.includes("Dulcería Mirabal"));
});

test("detalle de obra: empresa, fechas, preparación, equipo y observación (MOV-05)", () => {
  const v = viewFor("Luis Peña");
  const d = Object.values(v.detail).find((x) => x.name === "Taller Motormax")!;
  assert.equal(d.company.name, "Electsun");
  assert.equal(d.kwp, "73.08");
  assert.equal(d.notes, "Faltan grapas; llegan mié 28 en la mañana");
  assert.equal(d.when_text, "Día 8 de 17");
  assert.equal(d.start_text, "Lun 19 oct");
  assert.equal(d.end_text_long, "Vie 6 nov");
  assert.equal(d.prep_ready, true);
  assert.equal(d.team!.code, "E2");
  const lucia = Object.values(v.detail).find((x) => x.name === "Lucía Esther Gómez Paredes")!;
  assert.equal(lucia.prep_ready, false);
  assert.equal(lucia.prep_text, "Espera material");
  assert.equal(lucia.when_text, "Inicia en 6 días");
  assert.deepEqual(new Set(Object.keys(v.detail)), new Set([...v.obras.en_obra, ...v.obras.proximas].map((j) => j.id)));
});

test("empleado sin equipo: ve las obras de todos pero ninguna es suya", () => {
  const v = viewFor("Miguel Fermín");
  assert.equal(v.team, null);
  assert.equal(v.hoy.current, null);
  assert.deepEqual(v.hoy.next, []);
  assert.ok(v.hoy.week.every((d) => d.state === "libre"));
  assert.ok(v.obras.en_obra.every((j) => !j.mine));
  assert.ok(!v.calendario.timeline.lanes.some((l) => l.mine));
});

test("el modelo ignora proyectos archivados y fuera de su estado", () => {
  const archived = { ...input, projects: input.projects.map((p) => (p.name === "Colegio Arcoíris" ? { ...p, archived: true } : p)) };
  const v = mobileModel(archived, input.employees.find((e) => e.name === "Luis Peña")!.id, TODAY);
  assert.equal(v.hoy.current, null);
  assert.ok(!v.obras.en_obra.some((j) => j.name === "Colegio Arcoíris"));
  assert.throws(() => mobileModel(input, crypto.randomUUID(), TODAY), /no existe/);
});

// ---------- Integración: GET /api/view/movil (ROL-02, ACC-04, ACC-06) ----------

const employeeId = async (name: string) =>
  (await ctx.request<{ id: string; name: string }[]>("/employees", "GET", undefined, ctx.office)).data.find((e) => e.name === name)!.id;

/** Crea el enlace móvil como admin y lo canjea como lo haría el teléfono. Devuelve la cookie del dispositivo. */
async function activate(name: string) {
  const id = await employeeId(name);
  const link = await ctx.request<{ link: { id: string }; path: string }>("/access-links", "POST", { kind: "mobile", employee_id: id }, ctx.admin);
  assert.ok(link.status === 201 || link.status === 200, JSON.stringify(link.data));
  assert.match(link.data.path, /^\/m\/activar#[0-9a-f-]{36}\./);
  const redeem = await ctx.request<{ kind: string; redirect: string }>("/access/session", "POST", { token: link.data.path.split("#")[1] });
  assert.equal(redeem.status, 200);
  assert.equal(redeem.data.redirect, "/m");
  const cookie = cookieFrom(redeem.headers, "planner_m");
  assert.ok(cookie);
  return { id, linkId: link.data.link.id, cookie };
}

test("sin cookie la vista responde 403; las cuentas tampoco entran (ROL-02)", async () => {
  const none = await ctx.request<{ message: string }>("/view/movil");
  assert.equal(none.status, 403);
  assert.match(none.data.message, /desactivado/);
  assert.equal((await ctx.request("/view/movil", "GET", undefined, ctx.admin)).status, 403);
  assert.equal((await ctx.request("/view/movil", "GET", undefined, ctx.office)).status, 403);
  assert.equal((await ctx.request("/view/movil", "GET", undefined, "planner_m=no-es-una-sesion")).status, 403);
  // La TV usa otra cookie: una sesión de TV no abre la vista móvil.
  const tv = await ctx.request<{ link: { id: string }; path: string }>("/access-links", "POST", { kind: "tv", name: "TV oficina" }, ctx.admin);
  const redeem = await ctx.request("/access/session", "POST", { token: tv.data.path.split("#")[1], id: tv.data.link.id });
  assert.equal(redeem.status, 200);
  assert.equal((await ctx.request("/view/movil", "GET", undefined, cookieFrom(redeem.headers, `planner_tv_${tv.data.link.id}`))).status, 403);
});

test("con el enlace canjeado la vista responde 200 con los datos del empleado (MOV-02)", async () => {
  const { cookie } = await activate("Luis Peña");
  const r = await ctx.request<MovilView>("/view/movil", "GET", undefined, cookie);
  assert.equal(r.status, 200);
  assert.equal(r.data.today, TODAY);
  assert.equal(r.data.me.name, "Luis Peña");
  assert.equal(r.data.me.team_code, "E1");
  assert.equal(r.data.hoy.current?.name, "Colegio Arcoíris");
  assert.equal(r.data.hoy.current?.when_text, "Día 8 de 11");
  assert.equal(r.data.team?.lead?.name, "Ramón Tejada");
  assert.deepEqual(r.data.hoy.next.map((j) => j.name), ["Lucía Esther Gómez Paredes", "Andrés Polanco Ruiz"]);
  assert.equal(r.data.calendario.agenda.length, 18);
  assert.equal(r.headers.get("cache-control"), "no-store");
  // MOV-08 contra la base real: sin teléfonos de otros equipos ni datos de cuentas.
  const json = JSON.stringify(r.data);
  for (const hidden of ["809-555-0107", "809-555-0108", "809-555-0109", "809-555-0110", "809-555-0111"])
    assert.ok(!json.includes(hidden), `no debe incluir ${hidden}`);
  assert.ok(!json.includes("example.test"));
  assert.ok(json.includes("809-555-0102"));
  // La vista refleja los cambios de la oficina.
  const colegio = (await ctx.request<{ id: string; name: string; version: number }[]>("/projects", "GET", undefined, ctx.office)).data.find((p) => p.name === "Colegio Arcoíris")!;
  const patch = await ctx.request("/projects/" + colegio.id, "PATCH", { version: colegio.version, notes: "Llevar escalera larga" }, ctx.office);
  assert.equal(patch.status, 200);
  const again = await ctx.request<MovilView>("/view/movil", "GET", undefined, cookie);
  assert.equal(again.data.hoy.current?.notes, "Llevar escalera larga");
});

test("en Vacaciones la vista sigue disponible; De baja revoca el enlace (ACC-06)", async () => {
  const { id, cookie } = await activate("Starlin Reyes");
  const first = await ctx.request<MovilView>("/view/movil", "GET", undefined, cookie);
  assert.equal(first.status, 200);
  assert.equal(first.data.hoy.current?.late_days, 1);
  const version = async () => (await ctx.request<{ id: string; version: number }[]>("/employees", "GET", undefined, ctx.office)).data.find((e) => e.id === id)!.version;
  assert.equal((await ctx.request("/employees/" + id, "PATCH", { version: await version(), state: "Vacaciones" }, ctx.office)).status, 200);
  assert.equal((await ctx.request("/view/movil", "GET", undefined, cookie)).status, 200);
  assert.equal((await ctx.request("/employees/" + id, "PATCH", { version: await version(), state: "Activo" }, ctx.office)).status, 200);
  assert.equal((await ctx.request("/view/movil", "GET", undefined, cookie)).status, 200);
  assert.equal((await ctx.request("/employees/" + id, "PATCH", { version: await version(), state: "De baja" }, ctx.office)).status, 200);
  assert.equal((await ctx.request("/view/movil", "GET", undefined, cookie)).status, 403);
});

test("pasar al empleado a De baja con PATCH hace que la vista responda 403", async () => {
  const { id, cookie } = await activate("Wander Ortiz");
  assert.equal((await ctx.request("/view/movil", "GET", undefined, cookie)).status, 200);
  const emp = (await ctx.request<{ id: string; version: number }[]>("/employees", "GET", undefined, ctx.office)).data.find((e) => e.id === id)!;
  const patch = await ctx.request("/employees/" + id, "PATCH", { version: emp.version, state: "De baja" }, ctx.office);
  assert.equal(patch.status, 200);
  const r = await ctx.request<{ message: string }>("/view/movil", "GET", undefined, cookie);
  assert.equal(r.status, 403);
  assert.match(r.data.message, /Pide uno nuevo en la oficina/);
});

test("rotar o revocar el enlace corta la vista del teléfono anterior (ACC-02, ACC-03)", async () => {
  const { id, linkId, cookie } = await activate("Félix Santana");
  assert.equal((await ctx.request("/view/movil", "GET", undefined, cookie)).status, 200);
  const rotated = await ctx.request<{ path: string }>(`/access-links/${linkId}/rotate`, "POST", {}, ctx.admin);
  assert.equal(rotated.status, 200);
  assert.equal((await ctx.request("/view/movil", "GET", undefined, cookie)).status, 403);
  const redeem = await ctx.request("/access/session", "POST", { token: rotated.data.path.split("#")[1] });
  const fresh = cookieFrom(redeem.headers, "planner_m");
  assert.equal((await ctx.request<MovilView>("/view/movil", "GET", undefined, fresh)).data.me.id, id);
  assert.equal((await ctx.request(`/access-links/${linkId}/revoke`, "POST", {}, ctx.admin)).status, 200);
  assert.equal((await ctx.request("/view/movil", "GET", undefined, fresh)).status, 403);
});

test("la cookie móvil abre el flujo de eventos y se actualiza en vivo (MOV-09)", async () => {
  const { cookie } = await activate("Pedro Almonte");
  const denied = await fetch(ctx.base + "/api/events", { headers: { Cookie: "planner_m=no-vale" } });
  assert.equal(denied.status, 401);
  const abort = new AbortController();
  const stream = await fetch(ctx.base + "/api/events", { headers: { Cookie: cookie }, signal: abort.signal });
  assert.equal(stream.status, 200);
  assert.match(stream.headers.get("content-type") ?? "", /text\/event-stream/);
  const reader = stream.body!.getReader();
  const decoder = new TextDecoder();
  let seen = "";
  const until = async (what: string) => {
    while (!seen.includes(what)) {
      const chunk = await reader.read();
      assert.ok(!chunk.done, "el flujo se cerró antes de " + what);
      seen += decoder.decode(chunk.value);
    }
  };
  await until("event: ready");
  const taller = (await ctx.request<{ id: string; name: string; version: number }[]>("/projects", "GET", undefined, ctx.office)).data.find((p) => p.name === "Taller Motormax")!;
  assert.equal((await ctx.request("/projects/" + taller.id, "PATCH", { version: taller.version, notes: "Grapas listas" }, ctx.office)).status, 200);
  await until("event: change");
  abort.abort();
});
