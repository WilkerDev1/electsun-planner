import { Router } from "express";
import { pool, transaction } from "../db.js";
import type { Db } from "../db.js";
import { admin, authenticated } from "../auth.js";
import { audit, diffOf } from "../audit.js";
import { publishChange } from "../events.js";
import { MuralSettings } from "../../shared/contracts/mural.js";

// F2·D — Configuración del mural: GET/PUT /settings (MUR-09). Leer: cualquier cuenta; escribir: solo administración (ROL-02).
export const mural = Router();

export async function getMuralSettings(db: Db): Promise<MuralSettings> {
  const r = await db.query(
    "SELECT design,weeks,upcoming_order,show_waiting,show_notes,show_priority,show_clock,show_kwp FROM mural_settings WHERE id=1",
  );
  return r.rows[0];
}

mural.get("/settings", authenticated, async (_req, res) => {
  res.json(await getMuralSettings(pool));
});

mural.put("/settings", authenticated, admin, async (req, res) => {
  const next = MuralSettings.parse(req.body);
  const changed = await transaction(async (c) => {
    const before = (await c.query("SELECT * FROM mural_settings WHERE id=1 FOR UPDATE")).rows[0];
    const diff = diffOf(before, next, Object.keys(next));
    if (!Object.keys(diff).length) return false;
    await c.query(
      `UPDATE mural_settings SET design=$1,weeks=$2,upcoming_order=$3,show_waiting=$4,show_notes=$5,
         show_priority=$6,show_clock=$7,show_kwp=$8,updated_at=now() WHERE id=1`,
      [next.design, next.weeks, next.upcoming_order, next.show_waiting, next.show_notes, next.show_priority, next.show_clock, next.show_kwp],
    );
    await audit(c, req.user!.id, "mural.settings", "mural_settings", null, diff);
    return true;
  });
  if (changed) publishChange("mural.settings");
  res.json(await getMuralSettings(pool));
});
