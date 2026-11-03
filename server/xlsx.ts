import crypto from "node:crypto";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import type { PoolClient } from "pg";
import type { Db } from "./db.js";
import { PROJECT_COLUMNS, listProjects } from "./queries.js";
import { blankProject, changedFields, defaultPrep, fieldsOf, insertProject, saveProject, type ProjectFields } from "./project-store.js";
import type { ImportReport, ImportRow, Project } from "../shared/contracts/projects.js";
import type { Status } from "../shared/contracts/statuses.js";
import {
  SYSTEM_TYPES,
  countWorkdays,
  fold,
  joinEs,
  mergeProject,
  missingPrep,
  normalizeDate,
  parseKwp,
  validateProject,
  type PrepCatalogItem,
  type PrepEntry,
  type Schedulable,
  type SystemType,
} from "../shared/domain.js";

// Importar y exportar Excel (XLS-01..06). Todo se procesa en memoria: el archivo subido no se guarda (XLS-06).

type Col =
  | "company" | "name" | "kwp" | "sale" | "place" | "lead" | "team" | "start" | "end" | "status" | "notes"
  | "part" | "type" | "days";

const squash = (s: string) => fold(s).replace(/[^a-z0-9]+/g, "");

/** Cabeceras reconocidas (sin mayúsculas, tildes ni signos). Las primeras son las del Excel original (XLS-01). */
const ALIASES: Record<Col, string[]> = {
  company: ["Contratista", "Empresa", "Compañía"],
  name: ["Proyecto", "Cliente", "Proyecto / cliente", "Nombre"],
  kwp: ["kWp", "Potencia", "Potencia (kWp)"],
  sale: ["Fecha de venta", "Venta"],
  place: ["Lugar", "Ubicación"],
  lead: ["Encargado"],
  team: ["Cuadrilla/Equipo", "Cuadrilla", "Equipo"],
  start: ["Inicio", "Fecha de inicio"],
  end: ["Fin", "Fin previsto", "Fecha de fin"],
  status: ["Estado"],
  notes: ["Observación", "Observaciones", "Nota", "Notas"],
  part: ["Parte"],
  type: ["Tipo", "Tipo de sistema"],
  days: ["Días", "Días estimados"],
};
const ALIAS_INDEX = new Map<string, Col>(
  (Object.entries(ALIASES) as [Col, string[]][]).flatMap(([col, names]) => names.map((n) => [squash(n), col] as const)),
);

const EMPTY_TOKEN = /^(n\/?a|-+|—)$/i;

/** Valor simple de una celda de exceljs (texto enriquecido, fórmulas e hipervínculos incluidos). */
function plain(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v !== "object") return v;
  const o = v as Record<string, unknown>;
  if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join("");
  if ("result" in o) return plain(o.result);
  if (typeof o.text === "string") return o.text;
  return null;
}

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

function asText(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

/** Cabeceras antiguas de la preparación, por código del parámetro (el Excel de la v0.1/v0.2 las usaba). */
const LEGACY_PREP_HEADERS: Record<string, string[]> = {
  PL: ["Planos", "Planos y BOM"],
  MA: ["Materiales", "Material", "Materiales completos"],
  EDE: ["EDE", "Carta de no objeción"],
};

/** Cabecera (sin tildes ni signos) → parámetro del catálogo: por nombre, por código o por una cabecera antigua. */
function prepHeaderIndex(catalog: PrepCatalogItem[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const item of catalog) {
    for (const h of [item.name, item.code, ...(LEGACY_PREP_HEADERS[item.code] ?? [])]) {
      const key = squash(h);
      if (key && !index.has(key)) index.set(key, item.id);
    }
  }
  return index;
}

type Header = { row: number; cols: Partial<Record<Col, number>>; prepCols: Map<string, number> };

function findHeader(ws: ExcelJS.Worksheet, prepIndex: Map<string, string>): Header | null {
  for (let r = 1; r <= Math.min(ws.rowCount, 10); r++) {
    const cols: Partial<Record<Col, number>> = {};
    const prepCols = new Map<string, number>();
    ws.getRow(r).eachCell((cell, n) => {
      const key = squash(asText(plain(cell.value) ?? ""));
      const col = ALIAS_INDEX.get(key);
      if (col) {
        if (cols[col] === undefined) cols[col] = n;
        return;
      }
      const item = prepIndex.get(key);
      if (item && !prepCols.has(item)) prepCols.set(item, n);
    });
    if (cols.company && cols.name) return { row: r, cols, prepCols };
  }
  return null;
}

const YES = /^(s[ií]|x|1|true|verdadero|hecho|listo|ok|completo|completa)$/i;
const NO = /^(no|0|false|falso|pendiente|falta)$/i;

type Plan =
  | { kind: "create"; id: string; fields: ProjectFields }
  | { kind: "update"; before: Project; changes: Partial<ProjectFields> };

/**
 * Lee el libro y lo compara con los proyectos. Con `dry` no escribe nada (XLS-02); si no, escribe en la
 * transacción de `c` las filas válidas y deja una entrada de historial por proyecto (XLS-03).
 */
const MAX_UNZIPPED = 20 * 1024 * 1024;
const MAX_ENTRIES = 200;
export const MAX_IMPORT_ROWS = 5000;

/** Rechaza zips que se expanden demasiado antes de que exceljs los descomprima (evita bombas zip). */
async function guardZip(buffer: Buffer) {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw Object.assign(new Error("No se pudo leer el archivo. Verifica que sea un Excel (.xlsx) válido."), { status: 422 });
  }
  const files = Object.values(zip.files);
  // `_data.uncompressedSize` es el tamaño declarado en el índice del zip, sin descomprimir nada.
  const total = files.reduce((sum, f) => sum + ((f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0), 0);
  if (files.length > MAX_ENTRIES || total > MAX_UNZIPPED)
    throw Object.assign(new Error("El archivo es demasiado grande para importarlo. Divide el Excel en partes más pequeñas."), { status: 422 });
}

export async function importProjects(
  c: PoolClient,
  buffer: Buffer,
  opts: { dry: boolean; actorId: string; today: string },
): Promise<ImportReport> {
  await guardZip(buffer);
  const catalog = (
    await c.query("SELECT id,code,name,pending_label,applies_to FROM prep_items ORDER BY sort,code")
  ).rows as PrepCatalogItem[];
  const defaults = await defaultPrep(c);
  const order = new Map(catalog.map((i, n) => [i.id, n]));
  const prepIndex = prepHeaderIndex(catalog);
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw Object.assign(new Error("No se pudo leer el archivo. Verifica que sea un Excel (.xlsx) válido."), { status: 422 });
  }
  let sheet: ExcelJS.Worksheet | undefined;
  let header: Header | null = null;
  for (const ws of wb.worksheets) {
    header = findHeader(ws, prepIndex);
    if (header) {
      sheet = ws;
      break;
    }
  }
  if (!sheet || !header)
    throw Object.assign(new Error("No encontré las columnas «Contratista» y «Proyecto» en las primeras filas del archivo."), { status: 422 });
  const cols = header.cols;

  // Catálogos
  const statusRows = await c.query("SELECT id,name,kind,sort,fg,bg,dot,requires_schedule,requires_reason,version FROM statuses ORDER BY sort,name");
  const companyRows = await c.query("SELECT id,name,code FROM companies");
  const teamRows = await c.query("SELECT id,name,code,active FROM teams");
  const employeeRows = await c.query("SELECT id,name FROM employees");
  const statuses = statusRows.rows as Status[];
  const statusByName = new Map(statuses.map((s) => [fold(s.name), s]));
  const statusById = new Map(statuses.map((s) => [s.id, s]));
  const defaultStatus = statuses.find((s) => s.kind === "por_programar") ?? statuses[0];
  const companyBy = new Map<string, string>();
  for (const x of companyRows.rows) {
    companyBy.set(fold(x.name), x.id);
    companyBy.set(fold(x.code), x.id);
  }
  const teamBy = new Map<string, string>();
  const teamCode = new Map<string, string>();
  const inactiveTeams = new Set<string>();
  for (const x of teamRows.rows) {
    teamBy.set(fold(x.name), x.id);
    teamBy.set(fold(x.code), x.id);
    teamCode.set(x.id, x.code);
    if (!x.active) inactiveTeams.add(x.id);
  }
  const employeeBy = new Map<string, string>(employeeRows.rows.map((x) => [fold(x.name), x.id]));

  // Proyectos actuales (con bloqueo si vamos a escribir)
  const current = (
    await c.query(
      `SELECT ${PROJECT_COLUMNS} FROM projects p JOIN statuses s ON s.id=p.status_id
       ${opts.dry ? "" : "FOR UPDATE OF p"}`,
    )
  ).rows as Project[];
  const byKey = new Map<string, Project[]>();
  for (const p of current) {
    const k = `${p.company_id}|${fold(p.name)}`;
    byKey.set(k, [...(byKey.get(k) ?? []), p]);
  }
  const sched = new Map<string, Schedulable>(
    (
      await c.query(
        `SELECT p.id,p.name,p.team_id,p.start_date,p.end_date,p.archived,s.kind
         FROM projects p JOIN statuses s ON s.id=p.status_id WHERE NOT p.archived`,
      )
    ).rows.map((r) => [r.id, r]),
  );

  const rows: ImportRow[] = [];
  const plans: Plan[] = [];
  const seen = new Map<string, number>();
  let unchanged = 0;

  if (sheet.actualRowCount > MAX_IMPORT_ROWS || sheet.rowCount - header.row > MAX_IMPORT_ROWS * 4)
    throw Object.assign(new Error(`El Excel tiene demasiadas filas (máximo ${MAX_IMPORT_ROWS}). Borra las filas vacías del final o divide el archivo.`), { status: 422 });
  for (let n = header.row + 1; n <= sheet.rowCount; n++) {
    const xr = sheet.getRow(n);
    const raw = (col: Col): unknown => (cols[col] === undefined ? undefined : plain(xr.getCell(cols[col]!).value));
    const prepRaw = (itemId: string): unknown => plain(xr.getCell(header!.prepCols.get(itemId)!).value);
    if ((Object.keys(cols) as Col[]).every((k) => isBlank(raw(k))) && [...header.prepCols.keys()].every((i) => isBlank(prepRaw(i)))) continue;

    const errors: string[] = [];
    const notes: string[] = [];
    const patch: Partial<ProjectFields> = {};
    const label = isBlank(raw("name")) ? "(sin nombre)" : asText(raw("name"));
    const fail = (msg: string) => errors.push(msg);

    const text = (col: Col, max: number, title: string): string | undefined => {
      const v = raw(col);
      if (isBlank(v)) return undefined;
      const s = EMPTY_TOKEN.test(asText(v)) ? "" : asText(v);
      if (s.length > max) {
        fail(`«${title}» es demasiado largo (máximo ${max} caracteres).`);
        return undefined;
      }
      return s;
    };
    const date = (col: Col, title: string): string | null | undefined => {
      const v = raw(col);
      if (isBlank(v)) return undefined;
      const d = normalizeDate(typeof v === "string" ? v.trim() : v);
      if (d === undefined) fail(`Fecha no válida en «${title}»: ${asText(v)}.`);
      return d;
    };

    // Claves para encontrar el proyecto
    const companyRaw = raw("company");
    const companyId = isBlank(companyRaw) ? undefined : companyBy.get(fold(asText(companyRaw)));
    if (isBlank(companyRaw)) fail("Falta la empresa (Contratista).");
    else if (!companyId) fail(`Empresa desconocida: «${asText(companyRaw)}».`);
    const name = isBlank(raw("name")) ? "" : asText(raw("name"));
    if (!name) fail("Falta el nombre del proyecto.");
    else if (name.length > 160) fail("El nombre del proyecto supera los 160 caracteres.");
    const part = text("part", 40, "Parte");

    const kwp = raw("kwp");
    if (!isBlank(kwp)) {
      const parsed = parseKwp(kwp);
      if (parsed === undefined) fail(`kWp no válido: ${asText(kwp)}.`);
      else patch.kwp = parsed;
    }
    const sale = date("sale", "Fecha de venta");
    if (sale !== undefined) patch.sale_date = sale;
    const start = date("start", "Inicio");
    if (start !== undefined) patch.start_date = start;
    const end = date("end", "Fin");
    if (end !== undefined) patch.end_date = end;
    const place = text("place", 120, "Lugar");
    if (place !== undefined) patch.place = place;
    const obs = text("notes", 500, "Observación");
    if (obs !== undefined) patch.notes = obs;

    const lead = raw("lead");
    if (!isBlank(lead)) {
      if (EMPTY_TOKEN.test(asText(lead))) patch.lead_employee_id = null;
      else if (employeeBy.has(fold(asText(lead)))) patch.lead_employee_id = employeeBy.get(fold(asText(lead)))!;
      else notes.push(`No encontré al encargado «${asText(lead)}»; se dejó sin asignar.`);
    }
    const team = raw("team");
    if (!isBlank(team)) {
      const t = asText(team);
      if (EMPTY_TOKEN.test(t)) patch.team_id = null;
      else {
        const id = teamBy.get(fold(/^\d{1,2}$/.test(t) ? "E" + t : t));
        if (id) patch.team_id = id;
        else fail(`Equipo desconocido: «${t}».`);
      }
    }
    const status = raw("status");
    if (!isBlank(status) && !EMPTY_TOKEN.test(asText(status))) {
      const s = statusByName.get(fold(asText(status)));
      if (s) patch.status_id = s.id;
      else fail(`Estado desconocido: «${asText(status)}».`);
    }
    const type = raw("type");
    if (!isBlank(type)) {
      const t = fold(asText(type));
      const sys: SystemType | undefined = t.includes("hibrid") ? "hibrido" : t.includes("neta") ? "neta" : undefined;
      if (sys && SYSTEM_TYPES.includes(sys)) patch.system_type = sys;
      else fail(`Tipo de sistema desconocido: «${asText(type)}» (usa Neta o Híbrido).`);
    }
    const days = raw("days");
    if (!isBlank(days)) {
      const d = Number(asText(days).replace(",", "."));
      if (!Number.isInteger(d) || d < 1 || d > 120) fail("Los días estimados deben ser un entero entre 1 y 120.");
      else patch.estimated_days = d;
    }

    // Preparación: «Sí» = hecho, «No» = pendiente, «N/A» o «-» = el proyecto no lleva ese parámetro, vacío = sin cambios.
    const prepChanges = new Map<string, boolean | null>();
    for (const item of catalog) {
      if (!header.prepCols.has(item.id)) continue;
      const v = prepRaw(item.id);
      if (isBlank(v)) continue;
      const t = asText(v);
      if (EMPTY_TOKEN.test(t)) prepChanges.set(item.id, null);
      else if (YES.test(t)) prepChanges.set(item.id, true);
      else if (NO.test(t)) prepChanges.set(item.id, false);
      else fail(`Valor no válido en «${item.name}»: ${t}. Usa Sí, No o N/A.`);
    }

    // ¿Es nuevo o actualiza? (empresa + nombre + parte)
    const key = `${companyId}|${fold(name)}|${part === undefined ? "" : fold(part)}`;
    if (!errors.length) {
      if (seen.has(key)) fail(`Es el mismo proyecto de la fila ${seen.get(key)}.`);
      else seen.set(key, n);
    }
    let prev: Project | undefined;
    if (!errors.length) {
      const all = (byKey.get(`${companyId}|${fold(name)}`) ?? []).filter(
        (p) => part === undefined || fold(p.part) === fold(part),
      );
      // La ambigüedad se mide con los activos; un archivado solo cuenta si no hay activo con ese nombre.
      const active = all.filter((p) => !p.archived);
      const matches = active.length ? active : all;
      if (matches.length > 1) fail("Hay más de un proyecto con ese nombre en la empresa. Agrega la columna «Parte» para distinguirlos.");
      else if (matches[0]?.archived) fail("Ese proyecto está archivado. Desarchívalo en la tabla antes de importarlo.");
      else prev = matches[0];
    }
    if (errors.length) {
      rows.push({ row: n, action: "error", name: label, messages: errors });
      continue;
    }

    // Resultado: mezcla con la fila actual (o con los valores por defecto) y normalización común
    const base: ProjectFields = prev ? fieldsOf(prev) : { ...blankProject(companyId!, name, defaultStatus.id, part ?? ""), prep: defaults };
    if (prepChanges.size) {
      const mine = new Map<string, boolean>(base.prep.map((e: PrepEntry) => [e.item_id, e.done]));
      for (const [itemId, done] of prepChanges) if (done === null) mine.delete(itemId);
      else mine.set(itemId, done);
      patch.prep = [...mine].map(([item_id, done]) => ({ item_id, done })).sort((a, b) => (order.get(a.item_id) ?? 0) - (order.get(b.item_id) ?? 0));
    }
    const target = statusById.get(patch.status_id ?? base.status_id)!;
    const merged = mergeProject(base, patch, target.kind, opts.today, patch.end_date ?? base.end_date ?? opts.today);
    if (target.requires_reason && !merged.pause_reason.trim() && merged.notes.trim()) {
      merged.pause_reason = merged.notes.slice(0, 200);
      notes.push("Se usó la observación como motivo de la pausa.");
    }
    if (merged.estimated_days !== null && merged.estimated_days > 120) {
      rows.push({ row: n, action: "error", name: label, messages: ["La obra supera los 120 días laborables."] });
      continue;
    }
    // Igual que en la tabla: no se asigna un equipo desactivado, salvo el que el proyecto ya tenía.
    if (merged.team_id && inactiveTeams.has(merged.team_id) && merged.team_id !== prev?.team_id) {
      rows.push({ row: n, action: "error", name: label, messages: [`El equipo ${teamCode.get(merged.team_id)} está desactivado. Elige otro equipo.`] });
      continue;
    }
    const id = prev?.id ?? crypto.randomUUID();
    const check = validateProject(
      { ...merged, id },
      target,
      [...sched.values()],
      opts.today,
      (t) => teamCode.get(t) ?? "El equipo",
      catalog,
    );
    if (check.errors.length) {
      rows.push({ row: n, action: "error", name: label, messages: check.errors });
      continue;
    }
    const messages = [...notes, ...check.warnings];
    if (prev) {
      const changes = changedFields(fieldsOf(prev), merged);
      if (!Object.keys(changes).length) {
        unchanged++;
        continue;
      }
      plans.push({ kind: "update", before: prev, changes });
      rows.push({ row: n, action: "update", name: label, messages });
    } else {
      plans.push({ kind: "create", id, fields: merged });
      rows.push({ row: n, action: "create", name: label, messages });
    }
    sched.set(id, { id, name: merged.name, team_id: merged.team_id, start_date: merged.start_date, end_date: merged.end_date, archived: false, kind: target.kind });
  }

  if (!opts.dry)
    for (const plan of plans) {
      if (plan.kind === "create") await insertProject(c, plan.fields, opts.actorId, plan.id);
      else await saveProject(c, plan.before, plan.changes, opts.actorId);
    }
  return {
    dry: opts.dry,
    created: plans.filter((p) => p.kind === "create").length,
    updated: plans.filter((p) => p.kind === "update").length,
    errors: rows.filter((r) => r.action === "error").length,
    unchanged,
    rows,
  };
}

// ---------- Exportar (XLS-05) ----------

const EXPORT_COLUMNS: { header: string; width: number }[] = [
  { header: "Contratista", width: 16 },
  { header: "Proyecto", width: 32 },
  { header: "kWp", width: 10 },
  { header: "Fecha de venta", width: 15 },
  { header: "Lugar", width: 22 },
  { header: "Encargado", width: 22 },
  { header: "Cuadrilla/Equipo", width: 16 },
  { header: "Inicio", width: 12 },
  { header: "Fin", width: 12 },
  { header: "Estado", width: 18 },
  { header: "Observación", width: 40 },
  { header: "Tipo", width: 10 },
  { header: "Preparación", width: 26 },
  { header: "Días", width: 8 },
  { header: "Fin real", width: 12 },
  { header: "Prioridad", width: 10 },
  { header: "Parte", width: 12 },
];
/** Después de estas columnas va una por cada parámetro del catálogo de preparación. */

const asDate = (iso: string | null) => (iso ? new Date(iso + "T00:00:00Z") : null);

/** Libro `.xlsx` con las columnas del Excel original más Tipo, Preparación, Días, Fin real, Prioridad y Parte. */
export async function exportProjects(db: Db, filter: { status?: string; q?: string }): Promise<Buffer> {
  const [projects, statuses, companies, teams, employees, prepCatalog] = await Promise.all([
    listProjects(db),
    db.query("SELECT id,name FROM statuses"),
    db.query("SELECT id,name FROM companies"),
    db.query("SELECT id,name FROM teams"),
    db.query("SELECT id,name FROM employees"),
    db.query("SELECT id,code,name,pending_label,applies_to FROM prep_items ORDER BY sort,code"),
  ]);
  const catalog = prepCatalog.rows as PrepCatalogItem[];
  const name = (rows: { id: string; name: string }[]) => new Map(rows.map((r) => [r.id, r.name]));
  const statusName = name(statuses.rows);
  const companyName = name(companies.rows);
  const teamName = name(teams.rows);
  const employeeName = name(employees.rows);
  const q = filter.q ? fold(filter.q) : "";
  const list = projects.filter(
    (p) =>
      (!filter.status || p.status_id === filter.status) &&
      (!q || fold(`${p.name} ${p.place} ${companyName.get(p.company_id) ?? ""}`).includes(q)),
  );

  const wb = new ExcelJS.Workbook();
  wb.creator = "Electsun Planner";
  const ws = wb.addWorksheet("Proyectos", { views: [{ state: "frozen", ySplit: 1, xSplit: 2 }] });
  const columns = [...EXPORT_COLUMNS, ...catalog.map((i) => ({ header: i.name, width: Math.max(12, Math.min(26, i.name.length + 2)) }))];
  ws.columns = columns.map((x) => ({ header: x.header, width: x.width }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F4F7" } };
  for (const p of list) {
    const miss = missingPrep(p, catalog);
    const mine = new Map(p.prep.map((e) => [e.item_id, e.done]));
    ws.addRow([
      companyName.get(p.company_id) ?? "",
      p.name,
      p.kwp === null ? null : Number(p.kwp),
      asDate(p.sale_date),
      p.place,
      p.lead_employee_id ? (employeeName.get(p.lead_employee_id) ?? "") : "",
      p.team_id ? (teamName.get(p.team_id) ?? "") : "",
      asDate(p.start_date),
      asDate(p.end_date),
      statusName.get(p.status_id) ?? "",
      p.notes,
      p.system_type === "hibrido" ? "Híbrido" : "Neta",
      miss.length ? `Falta ${joinEs(miss)}` : "Completa",
      p.estimated_days ?? (p.start_date && p.end_date ? countWorkdays(p.start_date, p.end_date) : null),
      asDate(p.actual_end),
      p.priority ? "Sí" : "",
      p.part,
      ...catalog.map((i) => (mine.has(i.id) ? (mine.get(i.id) ? "Sí" : "No") : "")),
    ]);
  }
  for (const k of [4, 8, 9, 15]) ws.getColumn(k).numFmt = "dd/mm/yyyy";
  ws.getColumn(3).numFmt = "0.00";
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

