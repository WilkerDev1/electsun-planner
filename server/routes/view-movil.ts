import { Router } from "express";
import { pool } from "../db.js";
import { device } from "../auth.js";
import { listProjects, listStatuses, listTeams } from "../queries.js";
import { serverToday } from "../today.js";
import { mobileModel, type MobileEmployee, type MobileNotice } from "../../shared/movil-model.js";
import type { MovilView } from "../../shared/contracts/movil.js";

// F2·E — GET /api/view/movil (MOV-02..05, MOV-08, CAL-09). Solo con la cookie del enlace móvil (ROL-02).
export const viewMovil = Router();

const GONE = "Este enlace fue desactivado. Pide uno nuevo en la oficina.";

viewMovil.get("/", device("mobile"), async (req, res) => {
  const today = serverToday();
  const employees = (
    await pool.query("SELECT id,name,job,level,team_id,state,phone FROM employees ORDER BY name")
  ).rows as MobileEmployee[];
  const me = employees.find((e) => e.id === req.device!.employee_id);
  // El enlace deja de valer cuando el empleado pasa a "De baja" (ACC-06): 403 y la pantalla lo explica.
  if (!me || me.state === "De baja") return res.status(403).json({ message: GONE });

  const [teams, statuses, projects, companies, notices] = await Promise.all([
    listTeams(pool),
    listStatuses(pool),
    listProjects(pool),
    pool.query("SELECT id,name,code,color FROM companies"),
    pool.query("SELECT id,text,starts_on,expires_on,sort FROM notices WHERE starts_on<=$1 AND expires_on>=$1 ORDER BY sort,created_at", [today]),
  ]);

  const view: MovilView = mobileModel(
    {
      employees,
      teams,
      statuses,
      projects,
      companies: companies.rows,
      notices: notices.rows as MobileNotice[],
    },
    me.id,
    today,
  );
  res.json(view);
});
