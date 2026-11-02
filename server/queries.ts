import type { Db } from "./db.js";
import type { Project } from "../shared/contracts/projects.js";
import type { Status } from "../shared/contracts/statuses.js";
import type { Company, Employee, Team } from "../shared/contracts/equipo.js";

// Lecturas compartidas por administración, mural y móvil. Las escrituras viven en cada módulo de routes/.

export const PROJECT_COLUMNS = `p.id,p.company_id,p.name,p.kwp::text AS kwp,p.sale_date,p.place,p.lead_employee_id,p.team_id,
  p.start_date,p.estimated_days,p.end_date,p.actual_end,p.status_id,s.kind AS status_kind,p.pause_reason,p.notes,
  p.show_on_mural,p.mural_until,p.priority,p.part,p.system_type,p.prep_plans,p.prep_materials,p.prep_ede,p.archived,
  p.version,p.created_at,p.updated_at`;

export async function listProjects(db: Db, opts: { archived?: boolean; id?: string } = {}): Promise<Project[]> {
  const where: string[] = [];
  const args: unknown[] = [];
  if (opts.id) {
    args.push(opts.id);
    where.push(`p.id=$${args.length}`);
  } else if (!opts.archived) where.push("NOT p.archived");
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
      "SELECT id,name,kind,sort,fg,bg,dot,requires_schedule,requires_reason,version FROM statuses ORDER BY sort,name",
    )
  ).rows;
}

export async function listCompanies(db: Db): Promise<Company[]> {
  return (
    await db.query(
      `SELECT c.id,c.name,c.code,c.color,c.active,c.version,
        (SELECT count(*)::int FROM projects p WHERE p.company_id=c.id AND NOT p.archived) AS project_count
       FROM companies c ORDER BY c.name`,
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
