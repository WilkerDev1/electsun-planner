import { Router } from "express";
import { z } from "zod";
import { pool, httpError } from "../db.js";
import { findDevice } from "../auth.js";
import { listCompanies, listProjects, listStatuses, listTeams } from "../queries.js";
import { serverToday } from "../today.js";
import { muralModel } from "../../shared/mural-model.js";
import { MuralSettings, type MuralView, type Notice } from "../../shared/contracts/mural.js";
import { getMuralSettings } from "./mural.js";

// F2·D — GET /api/view/mural (MUR, CAL-08). Una cuenta, o una TV con su cookie de dispositivo y `?link=<id>`.
export const viewMural = Router();

const flag = z.enum(["0", "1", "true", "false"]).transform((v) => v === "1" || v === "true");
// Vista previa de Configuración: una cuenta puede probar ajustes sin guardarlos. La TV no los puede cambiar.
const Preview = z
  .object({
    design: MuralSettings.shape.design,
    weeks: z.enum(["2", "3", "4"]).transform((v) => Number(v) as 2 | 3 | 4),
    upcoming_order: MuralSettings.shape.upcoming_order,
    show_waiting: flag,
    show_notes: flag,
    show_priority: flag,
    show_clock: flag,
    show_kwp: flag,
  })
  .partial();

const DENIED = "Este enlace fue desactivado. Pide uno nuevo en la oficina.";

viewMural.get("/", async (req, res) => {
  let override: Partial<MuralSettings> = {};
  if (req.user) {
    override = Preview.parse(req.query);
  } else {
    const link = typeof req.query.link === "string" ? req.query.link : undefined;
    if (!link) throw httpError(401, "Inicia sesión para continuar.");
    if (!z.uuid().safeParse(link).success || !(await findDevice(req, "tv", link))) throw httpError(403, DENIED);
  }

  const [projects, statuses, companies, teams, notices, saved] = await Promise.all([
    listProjects(pool),
    listStatuses(pool),
    listCompanies(pool),
    listTeams(pool),
    pool.query("SELECT id,text,starts_on,expires_on,sort FROM notices ORDER BY sort,starts_on").then((r) => r.rows as Notice[]),
    getMuralSettings(pool),
  ]);
  const settings: MuralSettings = { ...saved, ...override };
  const today = serverToday();
  const view: MuralView = {
    today,
    generatedAt: new Date().toISOString(),
    settings,
    model: muralModel({ projects, statuses, companies, teams, notices }, settings, today),
    companies: companies.map(({ id, name, code, color }) => ({ id, name, code, color })),
    teams: teams.map(({ id, code, name, color }) => ({ id, code, name, color })),
  };
  res.json(view);
});
