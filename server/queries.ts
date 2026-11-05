import type { Db } from "./db.js";
import type { Project } from "../shared/contracts/projects.js";
import type { Status } from "../shared/contracts/statuses.js";
import type { Company, Employee, EmployeeRole, LevelItem, Team } from "../shared/contracts/equipo.js";
import type { PrepItem } from "../shared/contracts/prep.js";
import { effectiveRoles, effectiveTeamLead, type ISODate, type LevelDef } from "../shared/domain.js";
import { serverToday } from "./today.js";

// Lecturas compartidas por administración, mural y móvil. Las escrituras viven en cada módulo de routes/.

export const PROJECT_COLUMNS = `p.id,p.company_id,p.name,p.kwp::text AS kwp,p.sale_date,p.place,p.lead_employee_id,p.team_id,
  p.start_date,p.estimated_days,p.end_date,p.actual_end,p.status_id,s.kind AS status_kind,p.pause_reason,p.notes,
  p.show_on_mural,p.mural_until,p.priority,p.part,p.system_type,p.archived,
  COALESCE((SELECT json_agg(json_build_object('item_id',pp.item_id,'done',pp.done) ORDER BY i.sort,i.code)
    FROM project_prep pp JOIN prep_items i ON i.id=pp.item_id WHERE pp.project_id=p.id),'[]'::json) AS prep,
  p.version,p.created_at,p.updated_at`;

/**
 * `archived`: sin valor, solo los activos; `true`, todos (activos y archivados); `"only"`, solo los archivados.
 * `ids` limita a esos proyectos (cualquier estado).
 */
export async function listProjects(
  db: Db,
  opts: { archived?: boolean | "only"; id?: string; ids?: string[] } = {},
): Promise<Project[]> {
  const where: string[] = [];
  const args: unknown[] = [];
  if (opts.id) {
    args.push(opts.id);
    where.push(`p.id=$${args.length}`);
  } else if (opts.ids) {
    args.push(opts.ids);
    where.push(`p.id=ANY($${args.length}::uuid[])`);
  } else if (opts.archived === "only") where.push("p.archived");
  else if (!opts.archived) where.push("NOT p.archived");
  const r = await db.query(
    `SELECT ${PROJECT_COLUMNS} FROM projects p JOIN statuses s ON s.id=p.status_id
     ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY s.sort, p.priority DESC, p.start_date NULLS LAST, p.name`,
    args,
  );
  return r.rows;
}

export async function listStatuses(db: Db): Promise<Status[]> {
  return (
    await db.query(
      `SELECT s.id,s.name,s.kind,s.sort,s.fg,s.bg,s.dot,s.requires_schedule,s.requires_reason,s.version,
        (SELECT count(*)::int FROM projects p WHERE p.status_id=s.id) AS project_count
       FROM statuses s ORDER BY s.sort,s.name`,
    )
  ).rows;
}

/** Columnas de una empresa tal como la devuelve la API; requiere `companies c LEFT JOIN company_logos l`. */
export const COMPANY_COLUMNS = `c.id,c.name,c.code,c.color,c.pattern,c.active,c.version,
  CASE WHEN l.company_id IS NULL THEN NULL ELSE '/api/companies/'||c.id||'/logo?v='||left(l.sha256,12) END AS logo_url,
  (SELECT count(*)::int FROM projects p WHERE p.company_id=c.id AND NOT p.archived) AS project_count`;

export async function listCompanies(db: Db): Promise<Company[]> {
  return (
    await db.query(
      `SELECT ${COMPANY_COLUMNS}
       FROM companies c LEFT JOIN company_logos l ON l.company_id=c.id ORDER BY c.name`,
    )
  ).rows;
}

/** Catálogo de niveles con cuántas personas lo tienen vigente hoy (NIV-01). */
export async function listLevels(db: Db, today: ISODate = serverToday()): Promise<LevelItem[]> {
  return (
    await db.query(
      `SELECT l.id,l.code,l.name,l.group_label,l.sort,l.fg,l.bg,l.border,l.icon,l.can_lead_team,l.is_supervisor,l.can_use_mobile,l.is_field,
        l.active,l.version,
        (SELECT count(DISTINCT r.employee_id)::int FROM employee_roles r
          WHERE r.level_id=l.id AND r.starts_on<=$1::date AND (r.ends_on IS NULL OR r.ends_on>=$1::date)) AS person_count
       FROM levels l ORDER BY l.sort,l.name`,
      [today],
    )
  ).rows;
}

export const levelMap = (levels: readonly LevelDef[]) => new Map(levels.map((l) => [l.id, l]));

export type RoleRow = { id: string; employee_id: string; level_id: string; team_id: string | null; starts_on: ISODate; ends_on: ISODate | null; note: string };

/** Todos los roles (o los de un empleado), el más reciente primero. */
export async function listRoles(db: Db, employeeId?: string): Promise<RoleRow[]> {
  return (
    await db.query(
      `SELECT id,employee_id,level_id,team_id,starts_on,ends_on,note FROM employee_roles
       ${employeeId ? "WHERE employee_id=$1" : ""} ORDER BY starts_on DESC, created_at DESC, id`,
      employeeId ? [employeeId] : [],
    )
  ).rows;
}

/** El encargado de cada equipo se resuelve con los roles vigentes hoy (EQP-03b); `lead_employee_id` guardado es solo una copia. */
export async function listTeams(db: Db, today: ISODate = serverToday(), opts: { id?: string } = {}): Promise<Team[]> {
  const rows = (
    await db.query(
      `SELECT t.id,t.code,t.name,t.lead_employee_id,t.color,t.active,t.version,
        COALESCE(array_agg(e.id ORDER BY e.name) FILTER (WHERE e.id IS NOT NULL),'{}') AS member_ids
       FROM teams t LEFT JOIN employees e ON e.team_id=t.id
       ${opts.id ? "WHERE t.id=$1" : ""}
       GROUP BY t.id ORDER BY length(t.code), t.code`,
      opts.id ? [opts.id] : [],
    )
  ).rows as Team[];
  const [levels, roles] = await Promise.all([listLevels(db, today), listRoles(db)]);
  const byId = levelMap(levels);
  return rows.map((t) => ({ ...t, lead_employee_id: effectiveTeamLead(roles, byId, t.id, today) }));
}

/** Empleados con su nivel principal vigente hoy y todos sus roles. Ordenados por jerarquía del nivel y nombre. */
export async function listEmployees(db: Db, today: ISODate = serverToday(), opts: { id?: string } = {}): Promise<Employee[]> {
  const rows = (
    await db.query(
      `SELECT e.id,e.name,e.job,e.level,e.team_id,e.state,e.phone,e.version,
        CASE WHEN l.id IS NULL THEN 'none' WHEN l.active THEN 'active' ELSE 'revoked' END AS mobile_access,
        l.id AS mobile_link_id
       FROM employees e LEFT JOIN access_links l ON l.employee_id=e.id AND l.kind='mobile'
       ${opts.id ? "WHERE e.id=$1" : ""}`,
      opts.id ? [opts.id] : [],
    )
  ).rows as Omit<Employee, "roles">[];
  const [levels, roles] = await Promise.all([listLevels(db, today), listRoles(db, opts.id)]);
  const byId = levelMap(levels);
  const sortOf = new Map<string, number>();
  const out = rows.map((e) => {
    const mine = roles.filter((r) => r.employee_id === e.id);
    const eff = effectiveRoles(mine, byId, today);
    sortOf.set(e.id, eff.display?.sort ?? 999);
    const list: EmployeeRole[] = mine.map((r) => ({
      id: r.id,
      level_id: r.level_id,
      level: byId.get(r.level_id)?.name ?? "",
      team_id: r.team_id,
      starts_on: r.starts_on,
      ends_on: r.ends_on,
      note: r.note,
    }));
    return { ...e, level: eff.display?.name ?? e.level, roles: list };
  });
  return out.sort((a, b) => sortOf.get(a.id)! - sortOf.get(b.id)! || a.name.localeCompare(b.name, "es"));
}

/** Catálogo de preparación con cuántos proyectos tiene cada parámetro (PRY-12). */
export async function listPrepItems(db: Db): Promise<PrepItem[]> {
  return (
    await db.query(
      `SELECT i.id,i.code,i.name,i.pending_label,i.applies_to,i.default_on,i.sort,i.version,
        (SELECT count(*)::int FROM project_prep pp WHERE pp.item_id=i.id) AS project_count
       FROM prep_items i ORDER BY i.sort,i.code`,
    )
  ).rows;
}
