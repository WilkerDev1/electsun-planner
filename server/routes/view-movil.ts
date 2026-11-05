import { Router } from "express";
import { pool } from "../db.js";
import { device } from "../auth.js";
import { levelMap, listCompanies, listLevels, listPrepItems, listProjects, listRoles, listStatuses, listTeams } from "../queries.js";
import { serverToday } from "../today.js";
import { mobileModel, type MobileEmployee, type MobileNotice } from "../../shared/movil-model.js";
import { effectiveRoles } from "../../shared/domain.js";
import type { MovilView } from "../../shared/contracts/movil.js";

// F2·E — GET /api/view/movil (MOV-02..05, MOV-08, CAL-09). Solo con la cookie del enlace móvil (ROL-02).
export const viewMovil = Router();

const GONE = "Este enlace fue desactivado. Pide uno nuevo en la oficina.";

viewMovil.get("/", device("mobile"), async (req, res) => {
  const today = serverToday();
  // Nivel principal, niveles vigentes y permisos de cada persona, con los roles vigentes hoy (NIV-01).
  const [rows, levels, roles] = await Promise.all([
    pool.query("SELECT id,name,job,level,team_id,state,phone FROM employees ORDER BY name"),
    listLevels(pool, today),
    listRoles(pool),
  ]);
  const byLevel = levelMap(levels);
  const perms = new Map<string, boolean>();
  const employees = (rows.rows as MobileEmployee[]).map((e) => {
    const eff = effectiveRoles(roles.filter((r) => r.employee_id === e.id), byLevel, today);
    perms.set(e.id, eff.perms.can_use_mobile);
    const names = [...new Set(eff.current.filter((r) => r.level.active).map((r) => r.level.name))];
    return {
      ...e,
      level: eff.display?.name ?? e.level,
      level_names: names.length ? names : undefined,
      level_sort: eff.display?.sort,
      is_supervisor: eff.perms.is_supervisor,
    };
  });
  const me = employees.find((e) => e.id === req.device!.employee_id);
  // El enlace deja de valer cuando el empleado pasa a "De baja" (ACC-06) o ya no tiene un nivel con acceso móvil (NIV-01).
  if (!me || me.state === "De baja" || !perms.get(me.id)) return res.status(403).json({ message: GONE });

  const [teams, statuses, projects, companies, prepItems, notices] = await Promise.all([
    listTeams(pool),
    listStatuses(pool),
    listProjects(pool),
    listCompanies(pool),
    listPrepItems(pool),
    pool.query("SELECT id,text,starts_on,expires_on,sort FROM notices WHERE starts_on<=$1 AND expires_on>=$1 ORDER BY sort,created_at", [today]),
  ]);

  const view: MovilView = mobileModel(
    {
      employees,
      teams,
      statuses,
      projects,
      companies,
      prepItems,
      notices: notices.rows as MobileNotice[],
    },
    me.id,
    today,
  );
  res.json(view);
});
