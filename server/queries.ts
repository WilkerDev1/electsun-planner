import type { Db } from "./db.js";
import type { Project } from "../shared/contracts/projects.js";
import type { Status } from "../shared/contracts/statuses.js";
import type { Company, Employee, Team } from "../shared/contracts/equipo.js";
import type { PrepItem } from "../shared/contracts/prep.js";

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

export async function listTeams(db: Db): Promise<Team[]> {
  return (
    await db.query(
      `SELECT t.id,t.code,t.name,t.lead_employee_id,t.color,t.active,t.version,
        COALESCE(array_agg(e.id ORDER BY e.name) FILTER (WHERE e.id IS NOT NULL),'{}') AS member_ids
       FROM teams t LEFT JOIN employees e ON e.team_id=t.id
       GROUP BY t.id ORDER BY length(t.code), t.code`,
    )
  ).rows;
}

export async function listEmployees(db: Db): Promise<Employee[]> {
  return (
    await db.query(
      `SELECT e.id,e.name,e.job,e.level,e.team_id,e.state,e.phone,e.version,
        CASE WHEN l.id IS NULL THEN 'none' WHEN l.active THEN 'active' ELSE 'revoked' END AS mobile_access,
        l.id AS mobile_link_id
       FROM employees e LEFT JOIN access_links l ON l.employee_id=e.id AND l.kind='mobile'
       ORDER BY array_position(ARRAY['Supervisor','Encargado','Técnico','Ayudante','Oficina'], e.level), e.name`,
    )
  ).rows;
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
