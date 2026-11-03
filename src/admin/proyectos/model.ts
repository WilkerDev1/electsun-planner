import type { Project, HistoryEntry } from "../../../shared/contracts/projects";
import type { Status } from "../../../shared/contracts/statuses";
import type { Company, Employee, Team } from "../../../shared/contracts/equipo";
import type { PrepItem } from "../../../shared/contracts/prep";
import {
  type PrepEntry,
  dayLabel,
  fold,
  monogramColors,
  rangeLabel,
  validateProject,
  type Schedulable,
  type WarningCode,
  addDays,
  lateDays,
  warningCodeOf,
} from "../../../shared/domain";

// Modelo de presentación de la pantalla Proyectos. Los cálculos viven en shared/domain.ts.

export type Catalogs = { statuses: Status[]; companies: Company[]; teams: Team[]; employees: Employee[]; prepItems: PrepItem[] };

export type Lookup = {
  statusById: Map<string, Status>;
  companyById: Map<string, Company>;
  teamById: Map<string, Team>;
  employeeById: Map<string, Employee>;
  prepItems: PrepItem[];
};

export const buildLookup = (c: Catalogs): Lookup => ({
  statusById: new Map(c.statuses.map((s) => [s.id, s])),
  companyById: new Map(c.companies.map((s) => [s.id, s])),
  teamById: new Map(c.teams.map((s) => [s.id, s])),
  employeeById: new Map(c.employees.map((s) => [s.id, s])),
  prepItems: c.prepItems,
});

/** Campos que la pantalla edita (PATCH). `kwp` viaja como texto. */
export type EditPatch = Partial<
  Pick<
    Project,
    | "company_id" | "name" | "kwp" | "sale_date" | "place" | "lead_employee_id" | "team_id" | "start_date"
    | "estimated_days" | "end_date" | "status_id" | "pause_reason" | "notes" | "show_on_mural" | "mural_until"
    | "priority" | "part" | "system_type" | "prep"
  >
>;

/** Fondo y texto del monograma de empresa: la fórmula única de shared/domain.ts. */
export const monoColors = monogramColors;

/** Avisos de cada fila con las mismas reglas del servidor (VAL). Los errores heredados también se muestran. */
export function computeWarnings(rows: Project[], lk: Lookup, today: string): Map<string, string[]> {
  const byTeam = new Map<string, Schedulable[]>();
  for (const p of rows) {
    if (!p.team_id || p.archived) continue;
    const list = byTeam.get(p.team_id) ?? [];
    list.push({ id: p.id, name: p.name, team_id: p.team_id, start_date: p.start_date, end_date: p.end_date, kind: p.status_kind });
    byTeam.set(p.team_id, list);
  }
  const out = new Map<string, string[]>();
  for (const p of rows) {
    const status = lk.statusById.get(p.status_id);
    if (!status || p.archived) continue;
    const v = validateProject(p, status, p.team_id ? (byTeam.get(p.team_id) ?? []) : [], today, (id) => lk.teamById.get(id)?.code ?? "El equipo", lk.prepItems);
    const all = [...v.errors, ...v.warnings];
    if (all.length) out.set(p.id, all);
  }
  return out;
}

export const isClashWarning = (w: string) => warningCodeOf(w) === "choque_equipo";
export const isLateWarning = (w: string) => warningCodeOf(w) === "atrasada";

export function filterRows(rows: Project[], statusId: string, query: string, lk: Lookup): Project[] {
  const q = fold(query);
  return rows.filter(
    (p) =>
      (statusId === "all" || p.status_id === statusId) &&
      (!q || fold(`${p.name} ${p.place} ${lk.companyById.get(p.company_id)?.name ?? ""}`).includes(q)),
  );
}

/** "27 oct – 30 oct" o "Espera planos" cuando todavía no hay fecha. */
export const datesShort = (p: Pick<Project, "start_date" | "end_date">) =>
  p.start_date ? rangeLabel(p.start_date, p.end_date) : "";

// ---------- Historial (HIS-02) ----------

const FIELD_LABEL: Record<string, string> = {
  company_id: "la empresa", name: "el nombre", kwp: "la potencia", sale_date: "la fecha de venta", place: "el lugar",
  lead_employee_id: "el encargado", estimated_days: "los días estimados", pause_reason: "el motivo de la pausa",
  show_on_mural: "el mural", mural_until: "la fecha del mural", part: "la parte", system_type: "el tipo de sistema",
  prep: "la preparación", actual_end: "el fin real",
  notes: "la observación", start_date: "el inicio", end_date: "el fin previsto",
};

/** Historial de la preparación: el diff viene por código (`{ PL: true }`) y se cuenta qué se agregó, quitó o cambió. */
function describePrep(before: unknown, after: unknown): string[] {
  const a = (before && typeof before === "object" ? before : {}) as Record<string, boolean>;
  const b = (after && typeof after === "object" ? after : {}) as Record<string, boolean>;
  const out: string[] = [];
  for (const code of Object.keys(b)) {
    if (!(code in a)) out.push(`agregó ${code} a la preparación`);
    else if (a[code] !== b[code]) out.push(b[code] ? `marcó ${code} como hecho` : `dejó ${code} pendiente`);
  }
  for (const code of Object.keys(a)) if (!(code in b)) out.push(`quitó ${code} de la preparación`);
  return out.length ? out : ["cambió la preparación"];
}

export function describeChange(h: HistoryEntry, lk: Lookup): string {
  if (h.action === "project.create") return "creó el proyecto";
  if (h.action === "project.archive") return "archivó el proyecto";
  if (h.action === "project.unarchive") return "desarchivó el proyecto";
  const status = (v: unknown) => lk.statusById.get(String(v))?.name ?? "otro estado";
  const phrases: string[] = [];
  for (const [key, pair] of Object.entries(h.diff)) {
    const [a, b] = pair;
    if (key === "status_id") phrases.push(`cambió el estado de ${status(a)} a ${status(b)}`);
    else if (key === "team_id") phrases.push(b ? `asignó ${lk.teamById.get(String(b))?.code ?? "un equipo"}` : "quitó el equipo");
    else if (key === "priority") phrases.push(b ? "marcó la prioridad" : "quitó la prioridad");
    else if ((key === "start_date" || key === "end_date") && typeof b === "string")
      phrases.push(`puso ${key === "start_date" ? "el inicio" : "el fin"} el ${dayLabel(b)}`);
    else if (key === "start_date" || key === "end_date") phrases.push(`quitó ${FIELD_LABEL[key]}`);
    else if (key === "system_type") phrases.push(`cambió el tipo a ${b === "hibrido" ? "Híbrido" : "Medición neta"}`);
    else if (key === "show_on_mural") phrases.push(b ? "mostró la observación en el mural" : "quitó la observación del mural");
    else if (key === "actual_end" || key === "mural_until") continue;
    else if (key === "prep") phrases.push(...describePrep(a, b));
    else phrases.push(`cambió ${FIELD_LABEL[key] ?? key}`);
  }
  if (!phrases.length) return "actualizó el proyecto";
  const shown = phrases.slice(0, 3).join(", ");
  return phrases.length > 3 ? `${shown} y ${phrases.length - 3} cambios más` : shown;
}

const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
/** "hace 2 h" para lo reciente; fecha corta para lo antiguo. */
export function ago(iso: string, now = new Date()): string {
  const t = new Date(iso);
  const secs = Math.round((t.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(secs);
  if (abs < 60) return "hace un momento";
  if (abs < 3600) return rtf.format(Math.round(secs / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(secs / 3600), "hour");
  if (abs < 7 * 86400) return rtf.format(Math.round(secs / 86400), "day");
  const day = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  return `${dayLabel(day)} ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
}

export const teamLabel = (p: Pick<Project, "team_id">, lk: Lookup) => (p.team_id ? (lk.teamById.get(p.team_id)?.code ?? "—") : "sin equipo");


/** Lista de preparación tras pulsar un parámetro: lo marca o desmarca; si el proyecto no lo llevaba, lo agrega como hecho. */
export function toggledPrep(p: Pick<Project, "prep">, itemId: string): PrepEntry[] {
  return p.prep.some((e) => e.item_id === itemId)
    ? p.prep.map((e) => (e.item_id === itemId ? { ...e, done: !e.done } : e))
    : [...p.prep, { item_id: itemId, done: true }];
}

// ---------- Preparación opcional por proyecto (PRY-12) ----------

/** Ordena la lista de preparación como el catálogo, igual que el servidor. */
export function sortedPrep(prep: PrepEntry[], catalog: readonly { id: string }[]): PrepEntry[] {
  const order = new Map(catalog.map((c, i) => [c.id, i]));
  return [...prep].sort((x, y) => (order.get(x.item_id) ?? 999) - (order.get(y.item_id) ?? 999));
}

/** Lista de preparación tras agregar un parámetro (pendiente) a un proyecto o quitárselo. */
export function withPrepItem(p: Pick<Project, "prep">, itemId: string, selected: boolean, catalog: readonly { id: string }[]): PrepEntry[] {
  const has = p.prep.some((e) => e.item_id === itemId);
  if (selected) return has ? p.prep : sortedPrep([...p.prep, { item_id: itemId, done: false }], catalog);
  return p.prep.filter((e) => e.item_id !== itemId);
}

// ---------- Avisos de cada proyecto (VAL-10) ----------

/** Un aviso con su código; sin código es un error de validación heredado. */
export type Aviso = { code: WarningCode | "error"; text: string };
export const AVISO_SEP = "\n";

export const parseAvisos = (joined: string): Aviso[] =>
  joined ? joined.split(AVISO_SEP).map((text) => ({ code: warningCodeOf(text) ?? "error", text })) : [];

/** Resumen corto del disparador cuando el proyecto tiene un solo aviso. */
export function avisoShort(a: Aviso, p: Pick<Project, "status_kind" | "end_date">, today: string): string {
  switch (a.code) {
    case "atrasada": return `Atrasada · +${lateDays(p.status_kind, p.end_date, today)}`;
    case "prep_pendiente": return "Falta preparación";
    case "choque_equipo": return "Choque de equipo";
    case "inicio_antes_venta": return "Inicio antes de la venta";
    default: return "Revisar datos";
  }
}

/** Abierto por defecto si hay un error o un atraso; los avisos informativos empiezan cerrados. */
export const avisoOpenByDefault = (list: Aviso[]) => list.some((a) => a.code === "error" || a.code === "atrasada");

const AVISO_KEY = (id: string) => `planner.aviso.${id}`;
export function readAvisoPref(id: string): boolean | null {
  try {
    const v = window.localStorage.getItem(AVISO_KEY(id));
    return v === "1" ? true : v === "0" ? false : null;
  } catch {
    return null;
  }
}
export function saveAvisoPref(id: string, open: boolean) {
  try {
    window.localStorage.setItem(AVISO_KEY(id), open ? "1" : "0");
  } catch {
    /* sin almacenamiento: la preferencia dura solo esta sesión */
  }
}

// ---------- Archivar (PRY-10) ----------

export const STALE_DAYS = 30;
/** Proyectos terminados cuyo fin real o previsto pasó hace más de 30 días y siguen sin archivar. */
export const staleFinished = (rows: Project[], today: string): Project[] => {
  const cutoff = addDays(today, -STALE_DAYS);
  return rows.filter((p) => {
    const end = p.actual_end ?? p.end_date;
    return !p.archived && p.status_kind === "terminado" && !!end && end < cutoff;
  });
};
