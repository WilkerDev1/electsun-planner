import { Router } from "express";
import { z } from "zod";
import { pool, httpError } from "../db.js";
import { findDevice } from "../auth.js";
import { listCompanies, listPrepItems, listProjects, listStatuses, listTeams } from "../queries.js";
import { serverToday } from "../today.js";
import { muralModel } from "../../shared/mural-model.js";
import { TvMuralOverrides } from "../../shared/contracts/access.js";
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
export const PAUSED = "Esta pantalla está en pausa. Volverá sola cuando la reactiven en la oficina.";

/** Título y ajustes propios del enlace de TV (ACC-08). */
async function linkConfig(linkId: string) {
  const r = (await pool.query("SELECT title,mural FROM access_links WHERE id=$1 AND kind='tv'", [linkId])).rows[0] as
    | { title: string | null; mural: unknown }
    | undefined;
  if (!r) return null;
  // Lo guardado ya se validó al escribir; si alguna vez no cuadra con el contrato, se ignora en vez de romper la TV.
  const mural = TvMuralOverrides.safeParse(r.mural);
  return { title: r.title, mural: mural.success ? mural.data : {} };
}

viewMural.get("/", async (req, res) => {
  let override: Partial<MuralSettings> = {};
  let own: Partial<MuralSettings> = {};
  let title: string | null = null;
  const link = typeof req.query.link === "string" ? req.query.link : undefined;
  if (req.user) {
    override = Preview.parse(req.query);
    // Vista previa de un enlace: exactamente lo que verá esa TV (aunque esté en pausa).
    if (link) {
      const cfg = z.uuid().safeParse(link).success ? await linkConfig(link) : null;
      if (!cfg) throw httpError(404, "El enlace no existe.");
      ({ title, mural: own } = cfg);
    }
  } else {
    if (!link) throw httpError(401, "Inicia sesión para continuar.");
    const d = z.uuid().safeParse(link).success ? await findDevice(req, "tv", link) : null;
    if (!d) throw httpError(403, DENIED);
    if (d.paused) throw httpError(403, PAUSED, "paused");
    const cfg = await linkConfig(link);
    if (cfg) ({ title, mural: own } = cfg);
  }

  const [projects, statuses, companies, teams, prepItems, notices, saved] = await Promise.all([
    listProjects(pool),
    listStatuses(pool),
    listCompanies(pool),
    listTeams(pool),
    listPrepItems(pool),
    pool.query("SELECT id,text,starts_on,expires_on,sort FROM notices ORDER BY sort,starts_on").then((r) => r.rows as Notice[]),
    getMuralSettings(pool),
  ]);
  const settings: MuralSettings = { ...saved, ...own, ...override };
  const today = serverToday();
  const view: MuralView = {
    today,
    generatedAt: new Date().toISOString(),
    settings,
    title,
    model: muralModel({ projects, statuses, companies, teams, notices, prepItems }, settings, today),
    companies: companies.map(({ id, name, code, color, pattern, logo_url }) => ({ id, name, code, color, pattern, logo_url })),
    teams: teams.map(({ id, code, name, color }) => ({ id, code, name, color })),
  };
  res.json(view);
});
