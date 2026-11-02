import crypto from "node:crypto";
import { transaction } from "./db.js";
import { addDays, countWorkdays, diffDays, mondayOf } from "../shared/domain.js";
import { DEMO_TODAY, demoCompanies, demoEmployees, demoNotices, demoProjects, demoTeams } from "../shared/seed-demo.js";

/**
 * Carga los datos ficticios si no hay proyectos (o siempre con `reset`).
 * Desplaza las fechas semanas completas para que `today` caiga en la misma semana que la demo.
 */
export async function seedDemo(today: string, opts: { reset?: boolean } = {}) {
  return transaction(async (c) => {
    if (opts.reset)
      await c.query("TRUNCATE projects,notices,access_links,device_sessions,employees,teams,companies,audit CASCADE");
    else if ((await c.query("SELECT 1 FROM projects LIMIT 1")).rowCount) return false;
    const shift = diffDays(mondayOf(DEMO_TODAY), mondayOf(today));
    const d = (iso: string) => (iso ? addDays(iso, shift) : null);
    const uuid = () => crypto.randomUUID();

    const company = new Map<string, string>();
    for (const x of demoCompanies) {
      const id = uuid();
      company.set(x.name, id);
      await c.query("INSERT INTO companies(id,name,code,color) VALUES($1,$2,$3,$4)", [id, x.name, x.code, x.color]);
    }
    const team = new Map<string, string>();
    for (const t of demoTeams) {
      const id = uuid();
      team.set(t.code, id);
      await c.query("INSERT INTO teams(id,code,name) VALUES($1,$2,$3)", [id, t.code, t.name]);
    }
    const employee = new Map<string, string>();
    for (const e of demoEmployees) {
      const id = uuid();
      employee.set(e.name, id);
      await c.query("INSERT INTO employees(id,name,job,level,team_id,state,phone) VALUES($1,$2,$3,$4,$5,$6,$7)", [
        id, e.name, e.job, e.level, team.get(e.team) ?? null, e.state ?? "Activo", e.phone,
      ]);
    }
    for (const t of demoTeams)
      await c.query("UPDATE teams SET lead_employee_id=$1 WHERE id=$2", [employee.get(t.lead), team.get(t.code)]);

    const status = new Map<string, string>(
      (await c.query("SELECT id,name FROM statuses")).rows.map((r) => [r.name, r.id]),
    );
    for (const p of demoProjects) {
      const start = d(p.start);
      const end = d(p.end);
      await c.query(
        `INSERT INTO projects(id,company_id,name,kwp,sale_date,place,team_id,start_date,estimated_days,end_date,actual_end,
          status_id,pause_reason,notes,show_on_mural,mural_until,priority,part,system_type,prep_plans,prep_materials,prep_ede)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
        [
          uuid(), company.get(p.company), p.name, p.kwp, d(p.sale), p.place, team.get(p.team) ?? null,
          start, start && end ? countWorkdays(start, end) : null, end, p.actualEnd ? d(p.actualEnd) : null,
          status.get(p.status), p.pause ?? "", p.notes ?? "", !!p.mural, p.mural ? addDays(today, 3) : null,
          !!p.priority, p.part ?? "", p.type, ...p.prep,
        ],
      );
    }
    for (const [i, n] of demoNotices.entries())
      await c.query("INSERT INTO notices(id,text,starts_on,expires_on,sort) VALUES($1,$2,$3,$4,$5)", [
        uuid(), n.text, today, addDays(today, n.days), i,
      ]);
    return true;
  });
}
