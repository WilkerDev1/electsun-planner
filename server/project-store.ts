import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { httpError, type Db } from "./db.js";
import { audit, diffOf } from "./audit.js";
import { PROJECT_COLUMNS, listProjects } from "./queries.js";
import type { Project } from "../shared/contracts/projects.js";
import type { Status } from "../shared/contracts/statuses.js";
import { validateProject, type PrepEntry, type Schedulable, type Validation } from "../shared/domain.js";

// Escritura y validación de proyectos compartidas por el PATCH y la importación de Excel (PRY, VAL, XLS, HIS).

/** Columnas de `projects` que la aplicación escribe (el resto lo gestiona la base). */
export const COLUMNS = [
  "company_id", "name", "kwp", "sale_date", "place", "lead_employee_id", "team_id", "start_date", "estimated_days",
  "end_date", "actual_end", "status_id", "pause_reason", "notes", "show_on_mural", "mural_until", "priority", "part",
  "system_type", "archived",
] as const;
/** Campos que escribe la aplicación: las columnas más `prep`, que vive en la tabla `project_prep` (PRY-12). */
export const WRITABLE = [...COLUMNS, "prep"] as const;
export type Writable = (typeof WRITABLE)[number];
export type ProjectFields = Pick<Project, Writable>;

export const fieldsOf = (p: Project): ProjectFields =>
  Object.fromEntries(WRITABLE.map((k) => [k, p[k]])) as ProjectFields;

/** Código de cada parámetro de preparación, para auditar con nombres legibles en vez de ids. */
async function prepCodes(c: PoolClient): Promise<Map<string, string>> {
  return new Map((await c.query("SELECT id,code FROM prep_items")).rows.map((r) => [r.id, r.code]));
}

/** Estado de preparación por código (`{ PL: true, MA: false }`): lo que se guarda en el historial. */
export const prepByCode = (prep: PrepEntry[], codes: Map<string, string>): Record<string, boolean> =>
  Object.fromEntries(prep.map((e) => [codes.get(e.item_id) ?? e.item_id, e.done]));

/** Campos como se guardan en el historial: `prep` se ve por código. */
async function auditFields(c: PoolClient, p: Project): Promise<Record<string, unknown>> {
  return { ...fieldsOf(p), prep: prepByCode(p.prep, await prepCodes(c)) };
}

/** Ítems con `default_on`, sin hacer, para un proyecto nuevo sin `prep` explícito. */
export async function defaultPrep(db: Pick<Db, "query">): Promise<PrepEntry[]> {
  const r = await db.query("SELECT id FROM prep_items WHERE default_on ORDER BY sort,code");
  return r.rows.map((x) => ({ item_id: x.id, done: false }));
}

/** Los ítems existen en el catálogo (y no se repiten: eso lo valida el contrato). */
export async function assertPrepItems(db: Pick<Db, "query">, prep: PrepEntry[]): Promise<void> {
  if (!prep.length) return;
  const found = await db.query("SELECT id FROM prep_items WHERE id=ANY($1::uuid[])", [prep.map((e) => e.item_id)]);
  if (found.rowCount !== prep.length)
    throw httpError(422, "Algún parámetro de preparación ya no existe. Recarga la lista e inténtalo de nuevo.");
}

/** Valida los ítems y los deja en el orden del catálogo, que es como se leen (así `changedFields` no ve cambios falsos). */
export async function normalizePrep(db: Pick<Db, "query">, prep: PrepEntry[]): Promise<PrepEntry[]> {
  await assertPrepItems(db, prep);
  if (prep.length < 2) return prep;
  const order = (await db.query("SELECT id FROM prep_items ORDER BY sort,code")).rows.map((r) => r.id as string);
  return [...prep].sort((a, b) => order.indexOf(a.item_id) - order.indexOf(b.item_id));
}

/** Reemplaza la lista de preparación del proyecto. */
async function replacePrep(c: PoolClient, projectId: string, prep: PrepEntry[]): Promise<void> {
  await c.query("DELETE FROM project_prep WHERE project_id=$1", [projectId]);
  if (prep.length)
    await c.query(
      "INSERT INTO project_prep(project_id,item_id,done) SELECT $1,x.item_id,x.done FROM unnest($2::uuid[],$3::boolean[]) AS x(item_id,done)",
      [projectId, prep.map((e) => e.item_id), prep.map((e) => e.done)],
    );
}

/** Valores iniciales de un proyecto nuevo. */
export const blankProject = (company_id: string, name: string, status_id: string, part = ""): ProjectFields => ({
  company_id, name, kwp: null, sale_date: null, place: "", lead_employee_id: null, team_id: null,
  start_date: null, estimated_days: null, end_date: null, actual_end: null, status_id, pause_reason: "",
  notes: "", show_on_mural: false, mural_until: null, priority: false, part, system_type: "neta",
  prep: [], archived: false,
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
  const cols = ["id", ...COLUMNS, "created_by"];
  const values = [id, ...COLUMNS.map((k) => fields[k]), actorId];
  await c.query(
    `INSERT INTO projects(${cols.join(",")}) VALUES(${cols.map((_, i) => "$" + (i + 1)).join(",")})`,
    values,
  );
  await assertPrepItems(c, fields.prep);
  await replacePrep(c, id, fields.prep);
  const [created] = await listProjects(c, { id });
  await audit(c, actorId, "project.create", "project", id, diffOf(null, await auditFields(c, created)));
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
  const { prep, ...columns } = changes;
  const keys = Object.keys(columns) as (typeof COLUMNS)[number][];
  const sets = keys.map((k, i) => `${k}=$${i + 1}`);
  await c.query(
    `UPDATE projects SET ${[...sets, "version=version+1", "updated_at=now()"].join(",")} WHERE id=$${keys.length + 1}`,
    [...keys.map((k) => columns[k]), before.id],
  );
  if (prep !== undefined) {
    await assertPrepItems(c, prep);
    await replacePrep(c, before.id, prep);
  }
  const [after] = await listProjects(c, { id: before.id });
  await audit(c, actorId, action, "project", before.id, diffOf(await auditFields(c, before), await auditFields(c, after)));
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
  | "estimated_days" | "system_type" | "prep"
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
  const catalog = (await db.query("SELECT id,code,name,pending_label,applies_to FROM prep_items ORDER BY sort,code")).rows;
  return validateProject(p, status, others, today, () => teamCode ?? "El equipo", catalog);
}

/**
 * Un equipo inactivo no puede recibir obras: no sale en el calendario y la obra desaparecería de la vista.
 * Se permite si es el equipo que el proyecto ya tenía (`currentTeamId`).
 */
export async function assertTeamAssignable(db: Pick<Db, "query">, teamId: string | null, currentTeamId: string | null = null): Promise<void> {
  if (!teamId || teamId === currentTeamId) return;
  const r = await db.query("SELECT active FROM teams WHERE id=$1", [teamId]);
  if (r.rows[0] && !r.rows[0].active) throw httpError(422, "Ese equipo está desactivado. Elige otro equipo.");
}
