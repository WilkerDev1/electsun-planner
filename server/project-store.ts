import crypto from "node:crypto";
import type { PoolClient } from "pg";
import type { Db } from "./db.js";
import { audit, diffOf } from "./audit.js";
import { PROJECT_COLUMNS, listProjects } from "./queries.js";
import type { Project } from "../shared/contracts/projects.js";
import type { Status } from "../shared/contracts/statuses.js";
import { validateProject, type Schedulable, type Validation } from "../shared/domain.js";

// Escritura y validación de proyectos compartidas por el PATCH y la importación de Excel (PRY, VAL, XLS, HIS).

/** Columnas de `projects` que la aplicación escribe (el resto lo gestiona la base). */
export const WRITABLE = [
  "company_id", "name", "kwp", "sale_date", "place", "lead_employee_id", "team_id", "start_date", "estimated_days",
  "end_date", "actual_end", "status_id", "pause_reason", "notes", "show_on_mural", "mural_until", "priority", "part",
  "system_type", "prep_plans", "prep_materials", "prep_ede", "archived",
] as const;
export type Writable = (typeof WRITABLE)[number];
export type ProjectFields = Pick<Project, Writable>;

export const fieldsOf = (p: Project): ProjectFields =>
  Object.fromEntries(WRITABLE.map((k) => [k, p[k]])) as ProjectFields;

/** Valores iniciales de un proyecto nuevo. */
export const blankProject = (company_id: string, name: string, status_id: string, part = ""): ProjectFields => ({
  company_id, name, kwp: null, sale_date: null, place: "", lead_employee_id: null, team_id: null,
  start_date: null, estimated_days: null, end_date: null, actual_end: null, status_id, pause_reason: "",
  notes: "", show_on_mural: false, mural_until: null, priority: false, part, system_type: "neta",
  prep_plans: false, prep_materials: false, prep_ede: false, archived: false,
});

/** Lee y bloquea la fila para el resto de la transacción. */
export async function lockProject(c: PoolClient, id: string): Promise<Project | undefined> {
  const r = await c.query(
    `SELECT ${PROJECT_COLUMNS} FROM projects p JOIN statuses s ON s.id=p.status_id WHERE p.id=$1 FOR UPDATE OF p`,
    [id],
  );
  return r.rows[0];
}

/** Inserta un proyecto, lo audita (`project.create`) y devuelve la fila leída. */
export async function insertProject(
  c: PoolClient,
  fields: ProjectFields,
  actorId: string | null,
  id: string = crypto.randomUUID(),
): Promise<Project> {
  const cols = ["id", ...WRITABLE, "created_by"];
  const values = [id, ...WRITABLE.map((k) => fields[k]), actorId];
  await c.query(
    `INSERT INTO projects(${cols.join(",")}) VALUES(${cols.map((_, i) => "$" + (i + 1)).join(",")})`,
    values,
  );
  const [created] = await listProjects(c, { id });
  await audit(c, actorId, "project.create", "project", id, diffOf(null, fieldsOf(created) as Record<string, unknown>));
  return created;
}

/** Aplica `changes` (ya normalizados), sube `version`, audita el diff y devuelve la fila leída. */
export async function saveProject(
  c: PoolClient,
  before: Project,
  changes: Partial<ProjectFields>,
  actorId: string | null,
  action = "project.update",
): Promise<Project> {
  const keys = Object.keys(changes) as Writable[];
  const sets = keys.map((k, i) => `${k}=$${i + 1}`);
  await c.query(
    `UPDATE projects SET ${[...sets, "version=version+1", "updated_at=now()"].join(",")} WHERE id=$${keys.length + 1}`,
    [...keys.map((k) => changes[k]), before.id],
  );
  const [after] = await listProjects(c, { id: before.id });
  await audit(c, actorId, action, "project", before.id, diffOf(fieldsOf(before), fieldsOf(after) as Record<string, unknown>));
  return after;
}

/** Campos que cambian respecto de la fila actual (JSON como comparación, igual que `diffOf`). */
export function changedFields(before: ProjectFields, next: ProjectFields): Partial<ProjectFields> {
  const out: Record<string, unknown> = {};
  for (const k of WRITABLE) if (JSON.stringify(before[k] ?? null) !== JSON.stringify(next[k] ?? null)) out[k] = next[k];
  return out as Partial<ProjectFields>;
}

type Validatable = Pick<
  Project,
  | "id" | "name" | "sale_date" | "start_date" | "end_date" | "team_id" | "pause_reason" | "archived"
  | "system_type" | "prep_plans" | "prep_materials" | "prep_ede"
>;

/** Reglas VAL contra los demás proyectos del mismo equipo en la base. */
export async function validateAgainstDb(db: Db, p: Validatable, status: Status, today: string): Promise<Validation> {
  let others: Schedulable[] = [];
  let teamCode: string | undefined;
  if (p.team_id) {
    others = (
      await db.query(
        `SELECT p.id,p.name,p.team_id,p.start_date,p.end_date,p.archived,s.kind
         FROM projects p JOIN statuses s ON s.id=p.status_id WHERE NOT p.archived AND p.team_id=$1 AND p.id<>$2`,
        [p.team_id, p.id],
      )
    ).rows;
    teamCode = (await db.query("SELECT code FROM teams WHERE id=$1", [p.team_id])).rows[0]?.code;
  }
  return validateProject(p, status, others, today, () => teamCode ?? "El equipo");
}
