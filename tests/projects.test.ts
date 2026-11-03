import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { setup, endPool, pool, type Ctx } from "./helpers.js";
import { currentVersion } from "../server/events.js";
import type { Project, HistoryEntry, ImportReport } from "../shared/contracts/projects.js";
import type { Status } from "../shared/contracts/statuses.js";

let ctx: Ctx;
let teams: Record<string, string>;
let companies: Record<string, string>;
let statuses: Record<string, Status>;

before(async () => {
  ctx = await setup();
  teams = Object.fromEntries((await ctx.request("/teams", "GET", undefined, ctx.office)).data.map((t: { code: string; id: string }) => [t.code, t.id]));
  companies = Object.fromEntries((await ctx.request("/companies", "GET", undefined, ctx.office)).data.map((c: { name: string; id: string }) => [c.name, c.id]));
  statuses = Object.fromEntries((await ctx.request("/statuses", "GET", undefined, ctx.office)).data.map((s: Status) => [s.name, s]));
});
after(async () => {
  await ctx.close();
  await endPool();
});

const list = async (archived = false) =>
  (await ctx.request<Project[]>("/projects" + (archived ? "?archived=1" : ""), "GET", undefined, ctx.office)).data;
const byName = async (name: string) => {
  const p = (await list(true)).find((x) => x.name === name);
  assert.ok(p, `proyecto de la demo: ${name}`);
  return p;
};
/** PATCH con la versión actual del proyecto. */
async function patch(name: string, body: Record<string, unknown>, cookie = ctx.office) {
  const p = await byName(name);
  return ctx.request<Project & { warnings: string[]; message: string }>(`/projects/${p.id}`, "PATCH", { version: p.version, ...body }, cookie);
}
const auditCount = async (id?: string) =>
  Number((await pool.query("SELECT count(*) FROM audit WHERE entity='project'" + (id ? " AND entity_id=$1" : ""), id ? [id] : [])).rows[0].count);

test("listado (PRY-01, PRY-04)", async () => {
  assert.equal((await ctx.request("/projects")).status, 401);
  const r = await ctx.request<Project[]>("/projects", "GET", undefined, ctx.office);
  assert.equal(r.status, 200);
  assert.equal(r.data.length, 18);
  const colegio = r.data.find((p) => p.name === "Colegio Arcoíris")!;
  assert.equal(colegio.status_kind, "en_obra");
  assert.equal(colegio.kwp, "97.28");
  assert.equal(colegio.system_type, "hibrido");
  assert.equal(colegio.priority, true);
  assert.equal(colegio.start_date, "2026-10-19");
  assert.equal(colegio.estimated_days, 11);
  const one = await ctx.request<Project>(`/projects/${colegio.id}`, "GET", undefined, ctx.admin);
  assert.equal(one.data.id, colegio.id);
  assert.equal((await ctx.request("/projects/00000000-0000-4000-8000-000000000000", "GET", undefined, ctx.admin)).status, 404);
  assert.equal((await ctx.request("/projects/no-es-un-id", "GET", undefined, ctx.admin)).status, 404);
  assert.equal((await ctx.request<Project[]>("/projects?archived=1", "GET", undefined, ctx.admin)).data.length, 18);
});

test("PATCH feliz: guarda, audita, sube la versión y avisa al mural (PRY-03, HIS-01, API-01)", async () => {
  const before = await byName("Carla Méndez");
  const events = currentVersion();
  const audits = await auditCount(before.id);
  const r = await patch("Carla Méndez", { notes: "Se instala la parte 1 y 2", show_on_mural: false });
  assert.equal(r.status, 200);
  assert.equal(r.data.notes, "Se instala la parte 1 y 2");
  assert.equal(r.data.show_on_mural, false);
  assert.equal(r.data.version, before.version + 1);
  assert.ok(Array.isArray(r.data.warnings));
  assert.ok(currentVersion() > events, "publishChange tras confirmar");
  assert.equal(await auditCount(before.id), audits + 1);
  const row = (await pool.query("SELECT actor_id,action,diff FROM audit WHERE entity_id=$1 ORDER BY id DESC LIMIT 1", [before.id])).rows[0];
  assert.equal(row.actor_id, ctx.officeId);
  assert.equal(row.action, "project.update");
  assert.deepEqual(row.diff.notes, ["Se instala primero la parte 1 (8 paneles)", "Se instala la parte 1 y 2"]);
  assert.deepEqual(Object.keys(row.diff).sort(), ["notes", "show_on_mural"]);
  // Sin cambios reales: ni versión, ni auditoría, ni aviso.
  const noop = await patch("Carla Méndez", { notes: "Se instala la parte 1 y 2" });
  assert.equal(noop.status, 200);
  assert.equal(noop.data.version, before.version + 1);
  assert.equal(await auditCount(before.id), audits + 1);
});

test("409 si la versión no coincide (PRY-11)", async () => {
  const p = await byName("Tomás Rivera");
  const events = currentVersion();
  const r = await ctx.request(`/projects/${p.id}`, "PATCH", { version: p.version + 5, notes: "x" }, ctx.office);
  assert.equal(r.status, 409);
  assert.match(r.data.message, /Otra persona cambió este proyecto/);
  assert.equal((await byName("Tomás Rivera")).notes, p.notes);
  assert.equal(currentVersion(), events);
  const noVersion = await ctx.request(`/projects/${p.id}`, "PATCH", { notes: "x" }, ctx.office);
  assert.equal(noVersion.status, 422);
  const missing = await ctx.request("/projects/00000000-0000-4000-8000-000000000000", "PATCH", { version: 1, notes: "x" }, ctx.office);
  assert.equal(missing.status, 404);
  assert.equal((await ctx.request(`/projects/${p.id}`, "PATCH", { version: p.version }, "")).status, 401);
});

test("la prioridad es solo del administrador y office no aplica nada (ROL-03)", async () => {
  const p = await byName("Paola Núñez");
  const events = currentVersion();
  const r = await patch("Paola Núñez", { priority: false, notes: "No debería guardarse" });
  assert.equal(r.status, 403);
  const same = await byName("Paola Núñez");
  assert.equal(same.notes, "");
  assert.equal(same.priority, true);
  assert.equal(same.version, p.version);
  assert.equal(currentVersion(), events);
  const admin = await patch("Paola Núñez", { priority: false }, ctx.admin);
  assert.equal(admin.status, 200);
  assert.equal(admin.data.priority, false);
  // Office puede editar todo lo demás.
  assert.equal((await patch("Paola Núñez", { notes: "Esperando permiso" })).status, 200);
});

test("errores 422: Programado sin equipo, pausa sin motivo, fin anterior al inicio (VAL-01..03)", async () => {
  const events = currentVersion();
  const p = await byName("Paola Núñez");
  const prog = await patch("Paola Núñez", { status_id: statuses["Programado"].id });
  assert.equal(prog.status, 422);
  assert.match(prog.data.message, /necesita fecha de inicio y equipo/);
  const noTeam = await patch("Paola Núñez", { status_id: statuses["En obra"].id, start_date: "2026-10-30" });
  assert.equal(noTeam.status, 422);

  const pause = await patch("Kevin Almánzar", { status_id: statuses["En pausa"].id });
  assert.equal(pause.status, 422);
  assert.match(pause.data.message, /motivo de la pausa/);

  const range = await patch("Carla Méndez", { end_date: "2026-10-20" });
  assert.equal(range.status, 422);
  assert.match(range.data.message, /anterior al inicio/);

  assert.equal((await patch("Carla Méndez", { start_date: "2026-13-40" })).status, 422);
  assert.equal((await patch("Carla Méndez", { estimated_days: 500 })).status, 422);
  // Nada se escribió ni se publicó.
  assert.equal((await byName("Paola Núñez")).version, p.version);
  assert.equal((await byName("Paola Núñez")).status_id, p.status_id);
  assert.equal(currentVersion(), events);

  const ok = await patch("Kevin Almánzar", { status_id: statuses["En pausa"].id, pause_reason: "Esperando permiso del cliente" });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.status_kind, "en_pausa");
  assert.equal(ok.data.pause_reason, "Esperando permiso del cliente");
});

test("avisos: choque de equipo, preparación pendiente y atraso (VAL-06..08, VAL-10)", async () => {
  // Lucía Esther está en E1 con material pendiente; el 28 oct E1 está en Colegio Arcoíris.
  const clash = await patch("Lucía Esther Gómez Paredes", { start_date: "2026-10-28" });
  assert.equal(clash.status, 200, JSON.stringify(clash.data));
  assert.equal(clash.data.start_date, "2026-10-28");
  assert.equal(clash.data.end_date, "2026-10-28");
  assert.ok(clash.data.warnings.some((w) => /E1 ya está en Colegio Arcoíris/.test(w)), clash.data.warnings.join(" | "));
  assert.ok(clash.data.warnings.some((w) => /Programado con preparación pendiente: falta material/.test(w)));

  const late = await patch("Granja Los Pinos", { notes: "Falta cerrar el tablero" });
  assert.equal(late.status, 200);
  assert.ok(late.data.warnings.some((w) => /Atrasada · \+1 día: debía terminar el lun 26 oct/.test(w)), late.data.warnings.join(" | "));

  const sale = await patch("Andrés Polanco Ruiz", { start_date: "2026-10-01" });
  assert.equal(sale.status, 200);
  assert.ok(sale.data.warnings.some((w) => /anterior a la fecha de venta/.test(w)));
});

test("fin y días se mantienen coherentes (CAL-05)", async () => {
  const p = await byName("Rafael Castillo Medina");
  assert.equal(p.estimated_days, 2);
  assert.equal(p.end_date, "2026-11-04");
  const days = await patch("Rafael Castillo Medina", { estimated_days: 3 });
  assert.equal(days.data.end_date, "2026-11-05");
  const end = await patch("Rafael Castillo Medina", { end_date: "2026-11-09" });
  assert.equal(end.data.estimated_days, 6); // 3, 4, 5, 6, 7 y 9 nov (salta el domingo)
  const start = await patch("Rafael Castillo Medina", { start_date: "2026-11-10" });
  assert.equal(start.data.end_date, "2026-11-16");
  assert.equal(start.data.estimated_days, 6);
  const kevin = await patch("Kevin Almánzar", { start_date: "2026-11-10", estimated_days: 2 });
  assert.equal(kevin.data.end_date, "2026-11-11");
  const cleared = await patch("Kevin Almánzar", { start_date: "N/A" }); // VAL-05
  assert.equal(cleared.data.start_date, null);
  assert.equal(cleared.data.end_date, null);
});

test("normalización: N/A en fechas, kWp con coma, híbrido sin EDE y hasta del mural (VAL-05, VAL-09, PRY-01)", async () => {
  const na = await patch("Sr. Herrera", { sale_date: "N/A", mural_until: "-" });
  assert.equal(na.status, 200);
  assert.equal(na.data.sale_date, null);
  assert.equal(na.data.mural_until, null);
  const kwp = await patch("Sr. Herrera", { kwp: "17,5" });
  assert.equal(kwp.data.kwp, "17.50");

  const carla = await byName("Carla Méndez");
  assert.equal(carla.prep_ede, true);
  const hib = await patch("Carla Méndez", { system_type: "hibrido", prep_ede: true });
  assert.equal(hib.data.system_type, "hibrido");
  assert.equal(hib.data.prep_ede, false);

  const mural = await patch("Paola Núñez", { show_on_mural: true });
  assert.equal(mural.data.mural_until, "2026-11-03"); // hoy + 7 días naturales
});

test("fin real al terminar y al reabrir (PRY-01, EST-02)", async () => {
  const done = await patch("Andrés Polanco Ruiz", { status_id: statuses["Terminado"].id });
  assert.equal(done.status, 200);
  assert.equal(done.data.actual_end, "2026-10-27");
  const meter = await patch("Andrés Polanco Ruiz", { status_id: statuses["Esperando medidor"].id });
  assert.equal(meter.data.actual_end, "2026-10-27");
  const back = await patch("Andrés Polanco Ruiz", { status_id: statuses["Programado"].id });
  assert.equal(back.data.actual_end, null);
  // Si ya tenía fin real, se conserva.
  const kept = await patch("Dulcería Mirabal", { status_id: statuses["Terminado"].id });
  assert.equal(kept.data.actual_end, "2026-10-06");
});

test("historial con el nombre de quien cambió (HIS-02, HIS-03)", async () => {
  const p = await byName("Carla Méndez");
  assert.equal((await ctx.request(`/projects/${p.id}/history`)).status, 401);
  const r = await ctx.request<HistoryEntry[]>(`/projects/${p.id}/history`, "GET", undefined, ctx.admin);
  assert.equal(r.status, 200);
  assert.ok(r.data.length >= 2);
  assert.equal(r.data[0].actor_name, "Oficina");
  assert.equal(r.data[0].action, "project.update");
  assert.deepEqual(Object.keys(r.data[0].diff).sort(), ["prep_ede", "system_type"]);
  assert.deepEqual(r.data[0].diff.system_type, ["neta", "hibrido"]);
  assert.ok(new Date(r.data[0].created_at).getTime() > 0);
  // El historial no se edita desde la app.
  assert.equal((await ctx.request(`/projects/${p.id}/history`, "DELETE", undefined, ctx.admin)).status, 404);
  assert.equal((await ctx.request("/projects/00000000-0000-4000-8000-000000000000/history", "GET", undefined, ctx.admin)).data.length, 0);
});

test("crear proyecto nuevo con estado por programar (PRY-05)", async () => {
  assert.equal((await ctx.request("/projects", "POST", { company_id: companies["Electsun"], name: "X" })).status, 401);
  assert.equal((await ctx.request("/projects", "POST", { company_id: companies["Electsun"] }, ctx.office)).status, 422);
  assert.equal((await ctx.request("/projects", "POST", { company_id: "00000000-0000-4000-8000-000000000000", name: "X" }, ctx.office)).status, 422);
  // ROL-03 al crear: office no puede fijar la prioridad; admin sí.
  assert.equal((await ctx.request("/projects", "POST", { company_id: companies["Electsun"], name: "Prio", priority: true }, ctx.office)).status, 403);
  const prio = await ctx.request<Project>("/projects", "POST", { company_id: companies["Electsun"], name: "Prio admin", priority: true }, ctx.admin);
  assert.equal(prio.status, 201);
  assert.equal(prio.data.priority, true);
  await ctx.request(`/projects/${prio.data.id}/archive`, "POST", { version: prio.data.version }, ctx.admin);
  const events = currentVersion();
  const r = await ctx.request<Project & { warnings: string[] }>(
    "/projects",
    "POST",
    { company_id: companies["Electsun"], name: "  Nuevo proyecto  ", place: "Haina", kwp: "9,5" },
    ctx.office,
  );
  assert.equal(r.status, 201);
  assert.equal(r.data.name, "Nuevo proyecto");
  assert.equal(r.data.status_kind, "por_programar");
  assert.equal(r.data.status_id, statuses["Por programar"].id);
  assert.equal(r.data.kwp, "9.50");
  assert.equal(r.data.version, 1);
  assert.deepEqual(r.data.warnings, []);
  assert.ok(currentVersion() > events);
  assert.equal((await pool.query("SELECT action FROM audit WHERE entity_id=$1", [r.data.id])).rows[0].action, "project.create");
  const bad = await ctx.request("/projects", "POST", { company_id: companies["Electsun"], name: "Sin equipo", status_id: statuses["Programado"].id }, ctx.office);
  assert.equal(bad.status, 422);
  assert.equal((await list()).length, 19);
});

test("archivar y desarchivar (PRY-10)", async () => {
  const p = await byName("Nuevo proyecto");
  assert.equal((await ctx.request(`/projects/${p.id}/archive`, "POST", {})).status, 401);
  const events = currentVersion();
  const a = await ctx.request<Project>(`/projects/${p.id}/archive`, "POST", { version: p.version }, ctx.office);
  assert.equal(a.status, 200);
  assert.equal(a.data.archived, true);
  assert.ok(currentVersion() > events);
  assert.equal((await list()).some((x) => x.id === p.id), false);
  assert.equal((await list(true)).some((x) => x.id === p.id), true);
  const stale = await ctx.request(`/projects/${p.id}/unarchive`, "POST", { version: p.version }, ctx.office);
  assert.equal(stale.status, 409);
  const u = await ctx.request<Project>(`/projects/${p.id}/unarchive`, "POST", undefined, ctx.office);
  assert.equal(u.data.archived, false);
  assert.deepEqual(
    (await pool.query("SELECT action FROM audit WHERE entity_id=$1 ORDER BY id", [p.id])).rows.map((x) => x.action),
    ["project.create", "project.archive", "project.unarchive"],
  );
  assert.equal((await ctx.request("/projects/00000000-0000-4000-8000-000000000000/archive", "POST", {}, ctx.office)).status, 404);
});

// ---------- Excel ----------

async function workbook(rows: unknown[][], header = ["Contratista", "Proyecto", "kWp", "Fecha de venta", "Lugar", "Encargado", "Cuadrilla/Equipo", "Inicio", "Fin", "Estado", "Observación"]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Hoja1");
  ws.addRow(header);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
async function upload(buf: Buffer | string, dry: "0" | "1", cookie = ctx.office, name = "proyectos.xlsx") {
  const form = new FormData();
  form.append("file", new Blob([buf as BlobPart]), name);
  return ctx.request<ImportReport & { message?: string }>(`/projects/import?dry=${dry}`, "POST", form, cookie);
}

const importRows = [
  ["EcoSur", "Hotel Brisa Marina", "24,5", new Date("2026-10-20T00:00:00Z"), "Bávaro", "Ramón Tejada", "E2", "9/11/2026", "13/11/2026", "Programado", "Montaje en techo"],
  ["Electsun", "Taller Motormax", null, null, null, null, null, null, null, null, "Faltan grapas; llegan jue 29"],
  ["Compusol", "Cliente Sin Fecha", 8, "N/A", "Santiago", "", "N/A", "N/A", "n/a", "Por programar", ""],
  ["Solaris", "Proyecto Fantasma", 5, null, "Haina", null, null, null, null, "Por programar", null],
  ["EcoSur", "Estado Raro", 5, null, "Haina", null, null, null, null, "Desaparecido", null],
  [null, null, null, null, null, null, null, null, null, null, null],
];

test("importar: la vista previa no escribe nada (XLS-01, XLS-02, XLS-04, XLS-06)", async () => {
  const buf = await workbook(importRows);
  const projectsBefore = (await list(true)).length;
  const audits = await auditCount();
  const events = currentVersion();

  assert.equal((await upload(buf, "1", "")).status, 401);
  const r = await upload(buf, "1");
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.dry, true);
  assert.equal(r.data.created, 2);
  assert.equal(r.data.updated, 1);
  assert.equal(r.data.errors, 2);
  const byRow = Object.fromEntries(r.data.rows.map((x) => [x.name, x]));
  assert.equal(byRow["Hotel Brisa Marina"].action, "create");
  assert.match(byRow["Hotel Brisa Marina"].messages.join(" "), /Programado con preparación pendiente: falta planos, material y EDE/);
  assert.equal(byRow["Taller Motormax"].action, "update");
  assert.equal(byRow["Cliente Sin Fecha"].action, "create");
  assert.equal(byRow["Proyecto Fantasma"].action, "error");
  assert.equal(byRow["Proyecto Fantasma"].row, 5);
  assert.match(byRow["Proyecto Fantasma"].messages.join(" "), /Empresa desconocida: «Solaris»/);
  assert.match(byRow["Estado Raro"].messages.join(" "), /Estado desconocido: «Desaparecido»/);

  assert.equal((await list(true)).length, projectsBefore);
  assert.equal(await auditCount(), audits);
  assert.equal(currentVersion(), events);
  // Sin parámetro `dry` tampoco escribe.
  const noParam = await ctx.request<ImportReport>("/projects/import", "POST", (() => { const f = new FormData(); f.append("file", new Blob([buf as BlobPart]), "a.xlsx"); return f; })(), ctx.office);
  assert.equal(noParam.data.dry, true);
  assert.equal((await list(true)).length, projectsBefore);
});

test("importar: aplicar escribe las filas válidas con historial (XLS-03, HIS-01)", async () => {
  const buf = await workbook(importRows);
  const projectsBefore = (await list(true)).length;
  const motormax = await byName("Taller Motormax");
  const events = currentVersion();
  const r = await upload(buf, "0", ctx.admin);
  assert.equal(r.status, 200);
  assert.equal(r.data.dry, false);
  assert.equal(r.data.created, 2);
  assert.equal(r.data.updated, 1);
  assert.equal(r.data.errors, 2);
  assert.ok(currentVersion() > events);
  assert.equal((await list(true)).length, projectsBefore + 2);

  const hotel = await byName("Hotel Brisa Marina");
  assert.equal(hotel.kwp, "24.50");
  assert.equal(hotel.sale_date, "2026-10-20");
  assert.equal(hotel.team_id, teams["E2"]);
  assert.equal(hotel.start_date, "2026-11-09");
  assert.equal(hotel.end_date, "2026-11-13");
  assert.equal(hotel.estimated_days, 5);
  assert.equal(hotel.status_kind, "programado");
  assert.equal(hotel.company_id, companies["EcoSur"]);
  assert.ok(hotel.lead_employee_id);

  const sinFecha = await byName("Cliente Sin Fecha");
  assert.equal(sinFecha.sale_date, null);
  assert.equal(sinFecha.start_date, null);
  assert.equal(sinFecha.end_date, null);
  assert.equal(sinFecha.team_id, null);
  assert.equal(sinFecha.kwp, "8.00");

  const after = await byName("Taller Motormax");
  assert.equal(after.notes, "Faltan grapas; llegan jue 29");
  assert.equal(after.start_date, motormax.start_date); // celdas vacías no cambian nada
  assert.equal(after.version, motormax.version + 1);

  for (const p of [hotel, sinFecha, after]) {
    const rows = (await pool.query("SELECT actor_id,action FROM audit WHERE entity_id=$1 ORDER BY id DESC LIMIT 1", [p.id])).rows;
    assert.equal(rows[0].actor_id, ctx.adminId);
  }
  assert.equal((await pool.query("SELECT action FROM audit WHERE entity_id=$1", [hotel.id])).rows[0].action, "project.create");

  // Repetir el mismo archivo: ya coincide todo.
  const again = await upload(buf, "1");
  assert.equal(again.data.created, 0);
  assert.equal(again.data.updated, 0);
  assert.equal(again.data.unchanged, 3);
  assert.equal(again.data.errors, 2);
});

test("importar: archivos y columnas no válidos (XLS-01, XLS-06)", async () => {
  assert.equal((await upload(Buffer.from("hola"), "1", ctx.office, "datos.csv")).status, 422);
  assert.equal((await upload(Buffer.from("esto no es un excel"), "1", ctx.office, "datos.xlsx")).status, 422);
  const none = await ctx.request("/projects/import?dry=1", "POST", new FormData(), ctx.office);
  assert.equal(none.status, 422);
  const noCols = await upload(await workbook([["a", "b"]], ["Columna1", "Columna2"]), "1");
  assert.equal(noCols.status, 422);
  assert.match(noCols.data.message ?? "", /Contratista/);
  // Cabeceras sin tildes ni mayúsculas, y fila repetida.
  const dup = await upload(
    await workbook(
      [["ecosur", "Hotel Nuevo Uno", "1,5", null, "Bonao", "E1"], ["ECOSUR", "hotel nuevo uno", 2, null, "Bonao", "E1"]],
      ["CONTRATISTA", "proyecto", "KWP", "fecha venta", "lugar", "cuadrilla"],
    ),
    "1",
  );
  assert.equal(dup.status, 200, JSON.stringify(dup.data));
  assert.equal(dup.data.created, 1);
  assert.equal(dup.data.errors, 1);
  assert.match(dup.data.rows.find((r) => r.action === "error")!.messages.join(" "), /mismo proyecto de la fila 2/);
  // Más de 5 MB.
  const big = await upload(Buffer.alloc(5 * 1024 * 1024 + 4096, 0x50), "1");
  assert.equal(big.status, 422);
});

test("exportar a Excel con filtros (XLS-05)", async () => {
  assert.equal((await ctx.request("/projects/export")).status, 401);
  const read = async (query = "", cookie = ctx.office) => {
    const r = await ctx.request(`/projects/export${query}`, "GET", undefined, cookie);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type") ?? "", /spreadsheetml/);
    assert.match(r.headers.get("content-disposition") ?? "", /proyectos-2026-10-27\.xlsx/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(r.data as ArrayBuffer) as unknown as ExcelJS.Buffer);
    const ws = wb.worksheets[0];
    const header = (ws.getRow(1).values as unknown[]).slice(1).map(String);
    const rows = Array.from({ length: ws.rowCount - 1 }, (_, i) => ws.getRow(i + 2));
    return { header, rows };
  };
  const all = await read("", ctx.admin);
  assert.deepEqual(all.header, [
    "Contratista", "Proyecto", "kWp", "Fecha de venta", "Lugar", "Encargado", "Cuadrilla/Equipo", "Inicio", "Fin",
    "Estado", "Observación", "Tipo", "Preparación", "Días", "Fin real", "Prioridad", "Parte",
  ]);
  const total = (await list()).length;
  assert.equal(all.rows.length, total);
  const colegio = all.rows.find((r) => r.getCell(2).value === "Colegio Arcoíris")!;
  assert.equal(colegio.getCell(1).value, "EcoSur");
  assert.equal(colegio.getCell(3).value, 97.28);
  assert.equal(colegio.getCell(7).value, "Equipo 1");
  assert.equal(colegio.getCell(10).value, "En obra");
  assert.equal((colegio.getCell(8).value as Date).toISOString().slice(0, 10), "2026-10-19");
  assert.equal(colegio.getCell(12).value, "Híbrido");
  assert.equal(colegio.getCell(13).value, "Completa");
  assert.equal(colegio.getCell(14).value, 11);
  assert.equal(colegio.getCell(16).value, "Sí");

  const enObra = await read(`?status=${statuses["En obra"].id}`);
  assert.equal(enObra.rows.length, 3);
  const search = await read("?q=ARCOIRIS");
  assert.deepEqual(search.rows.map((r) => r.getCell(2).value), ["Colegio Arcoíris"]);
  const place = await read(`?q=la%20romana&status=${statuses["Terminado"].id}`);
  assert.deepEqual(place.rows.map((r) => r.getCell(2).value), ["Lácteos del Valle"]);

  // Lo exportado se puede volver a importar sin errores y sin cambios.
  const buf = Buffer.from((await ctx.request("/projects/export", "GET", undefined, ctx.admin)).data as ArrayBuffer);
  const again = await upload(buf, "1");
  assert.equal(again.status, 200);
  assert.deepEqual(again.data.rows.filter((r) => r.action === "error"), []);
});

test("estados: solo el administrador crea y edita, y no se borran (EST-01, EST-04)", async () => {
  const meter = statuses["Esperando medidor"];
  assert.equal((await ctx.request("/statuses", "POST", { name: "Reprogramado", kind: "programado", fg: "#3538CD", bg: "#EEF0FE", dot: "#6172F3" })).status, 401);
  const body = { name: "Reprogramado", kind: "programado", fg: "#3538CD", bg: "#EEF0FE", dot: "#6172F3" };
  assert.equal((await ctx.request("/statuses", "POST", body, ctx.office)).status, 403);
  assert.equal((await ctx.request("/statuses/" + meter.id, "PATCH", { version: meter.version, name: "X" }, ctx.office)).status, 403);
  assert.equal((await ctx.request("/statuses", "POST", { ...body, kind: "otro" }, ctx.admin)).status, 422);
  assert.equal((await ctx.request("/statuses", "POST", { ...body, fg: "azul" }, ctx.admin)).status, 422);

  const events = currentVersion();
  const created = await ctx.request<Status>("/statuses", "POST", body, ctx.admin);
  try {
    assert.equal(created.status, 201);
    assert.equal(created.data.kind, "programado");
    assert.equal(created.data.requires_schedule, true);
    assert.equal(created.data.requires_reason, false);
    assert.ok(currentVersion() > events);
    assert.equal((await ctx.request("/statuses", "POST", body, ctx.admin)).status, 409); // nombre repetido

    const renamed = await ctx.request<Status>(`/statuses/${meter.id}`, "PATCH", { version: meter.version, name: "Esperando contador", dot: "#0E7490", sort: 6 }, ctx.admin);
    assert.equal(renamed.status, 200);
    assert.equal(renamed.data.name, "Esperando contador");
    assert.equal(renamed.data.kind, "post_obra");
    assert.equal(renamed.data.version, meter.version + 1);
    assert.equal((await ctx.request(`/statuses/${meter.id}`, "PATCH", { version: meter.version, name: "Otro" }, ctx.admin)).status, 409);
    assert.equal((await ctx.request(`/statuses/${meter.id}`, "PATCH", { version: renamed.data.version, bg: "rojo" }, ctx.admin)).status, 422);
    const audits = (await pool.query("SELECT action FROM audit WHERE entity='status' ORDER BY id")).rows.map((r) => r.action);
    assert.deepEqual(audits, ["status.create", "status.update"]);
    // El nombre nuevo se refleja en el catálogo.
    assert.ok((await ctx.request<Status[]>("/statuses", "GET", undefined, ctx.office)).data.some((s) => s.name === "Esperando contador"));
    await ctx.request(`/statuses/${meter.id}`, "PATCH", { version: renamed.data.version, name: meter.name }, ctx.admin);

    assert.equal((await ctx.request(`/statuses/${meter.id}`, "DELETE", undefined, ctx.admin)).status, 409);
    assert.equal((await ctx.request(`/statuses/${meter.id}`, "DELETE", undefined, ctx.office)).status, 403);
    assert.equal((await ctx.request("/statuses/no-es-un-id", "PATCH", { version: 1 }, ctx.admin)).status, 404);
  } finally {
    await pool.query("DELETE FROM statuses WHERE name='Reprogramado'");
    await pool.query("UPDATE statuses SET name=$1,sort=$2,version=$3 WHERE id=$4", [meter.name, meter.sort, 1, meter.id]);
  }
  assert.deepEqual((await ctx.request<Status[]>("/statuses", "GET", undefined, ctx.office)).data.map((s) => s.name), [
    "En obra", "Programado", "Por programar", "En pausa", "Terminado", "Esperando medidor",
  ]);
});

test("importar: un proyecto archivado no se duplica ni bloquea al activo del mismo nombre (XLS-02)", async () => {
  const row = [["Evolta", "Oficina Evolta", 6.5, null, "Santo Domingo", null, null, null, null, "Por programar", "Revisar techo"]];
  const p = await byName("Oficina Evolta");
  assert.equal((await ctx.request(`/projects/${p.id}/archive`, "POST", { version: p.version }, ctx.office)).status, 200);
  const archived = await upload(await workbook(row), "1");
  assert.equal(archived.data.rows[0].action, "error");
  assert.match(archived.data.rows[0].messages.join(" "), /archivado/);
  const again = await ctx.request<Project>("/projects", "POST", { company_id: companies["Evolta"], name: "Oficina Evolta" }, ctx.office);
  assert.equal(again.status, 201);
  const active = await upload(await workbook(row), "1");
  assert.equal(active.data.rows[0].action, "update");
});

test("importar: rechaza hojas con demasiadas filas y zips que se expanden demasiado (seguridad)", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Hoja1");
  ws.addRow(["Contratista", "Proyecto", "Estado"]);
  ws.getCell("A60000").value = "x"; // una celda perdida al final
  const far = await upload(Buffer.from(await wb.xlsx.writeBuffer()), "1");
  assert.equal(far.status, 422);
  assert.match(far.data.message ?? "", /demasiadas filas/);

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  zip.file("xl/relleno.xml", "0".repeat(25 * 1024 * 1024));
  const bomb = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const r = await upload(bomb, "1");
  assert.equal(r.status, 422);
  assert.match(r.data.message ?? "", /demasiado grande/);
});

test("En obra exige fin o días estimados además de inicio y equipo (VAL-01)", async () => {
  const sin = await patch("Paola Núñez", { status_id: statuses["En obra"].id, start_date: "2026-10-30", team_id: teams["E3"] });
  assert.equal(sin.status, 422);
  assert.match(sin.data.message, /fecha de fin o días estimados/);
  const con = await patch("Paola Núñez", { status_id: statuses["En obra"].id, start_date: "2026-10-30", team_id: teams["E3"], estimated_days: 3 });
  assert.equal(con.status, 200);
  assert.equal(con.data.end_date, "2026-11-02");
});

test("un equipo desactivado no recibe obras, salvo que ya fuera el del proyecto (EQP-06)", async () => {
  const created = await ctx.request<{ id: string; version: number }>("/teams", "POST", { code: "E8", name: "Equipo 8" }, ctx.office);
  assert.equal(created.status, 201);
  const off = await ctx.request(`/teams/${created.data.id}`, "PATCH", { version: created.data.version, active: false }, ctx.office);
  assert.equal(off.status, 200);

  const events = currentVersion();
  const post = await ctx.request("/projects", "POST", { company_id: companies["Electsun"], name: "Obra en equipo apagado", team_id: created.data.id }, ctx.office);
  assert.equal(post.status, 422);
  assert.match((post.data as { message: string }).message, /desactivado/);
  const moved = await patch("Kevin Almánzar", { team_id: created.data.id });
  assert.equal(moved.status, 422);
  assert.match(moved.data.message, /desactivado/);
  assert.equal(currentVersion(), events);

  // El equipo que el proyecto ya tenía se conserva al editar otros campos.
  await pool.query("UPDATE projects SET team_id=$1 WHERE name='Kevin Almánzar'", [created.data.id]);
  const keep = await patch("Kevin Almánzar", { notes: "sigue en su equipo" });
  assert.equal(keep.status, 200);
  assert.equal(keep.data.team_id, created.data.id);
  await pool.query("UPDATE projects SET team_id=NULL WHERE name='Kevin Almánzar'");
});
