import type { Project, HistoryEntry } from "../../../shared/contracts/projects";
import type { Status } from "../../../shared/contracts/statuses";
import type { Company, Employee, Team } from "../../../shared/contracts/equipo";
import {
  dayLabel,
  fold,
  monogramColors,
  rangeLabel,
  validateProject,
  type Schedulable,
  warningCodeOf,
} from "../../../shared/domain";

// Modelo de presentación de la pantalla Proyectos. Los cálculos viven en shared/domain.ts.

export type Catalogs = { statuses: Status[]; companies: Company[]; teams: Team[]; employees: Employee[] };

export type Lookup = {
  statusById: Map<string, Status>;
  companyById: Map<string, Company>;
  teamById: Map<string, Team>;
  employeeById: Map<string, Employee>;
};

export const buildLookup = (c: Catalogs): Lookup => ({
  statusById: new Map(c.statuses.map((s) => [s.id, s])),
  companyById: new Map(c.companies.map((s) => [s.id, s])),
  teamById: new Map(c.teams.map((s) => [s.id, s])),
  employeeById: new Map(c.employees.map((s) => [s.id, s])),
});

/** Campos que la pantalla edita (PATCH). `kwp` viaja como texto. */
export type EditPatch = Partial<
  Pick<
    Project,
    | "company_id" | "name" | "kwp" | "sale_date" | "place" | "lead_employee_id" | "team_id" | "start_date"
    | "estimated_days" | "end_date" | "status_id" | "pause_reason" | "notes" | "show_on_mural" | "mural_until"
    | "priority" | "part" | "system_type" | "prep_plans" | "prep_materials" | "prep_ede"
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
    const v = validateProject(p, status, p.team_id ? (byTeam.get(p.team_id) ?? []) : [], today, (id) => lk.teamById.get(id)?.code ?? "El equipo");
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
  prep_plans: "los planos", prep_materials: "los materiales", prep_ede: "la carta de la EDE", actual_end: "el fin real",
  notes: "la observación", start_date: "el inicio", end_date: "el fin previsto",
};

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
    else if (key.startsWith("prep_")) phrases.push(`${b ? "marcó" : "desmarcó"} ${FIELD_LABEL[key]}`);
    else if (key === "show_on_mural") phrases.push(b ? "mostró la observación en el mural" : "quitó la observación del mural");
    else if (key === "actual_end" || key === "mural_until") continue;
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

