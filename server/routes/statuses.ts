import { Router } from "express";
import { z } from "zod";
import { transaction, httpError } from "../db.js";
import { admin, authenticated } from "../auth.js";
import { audit, diffOf } from "../audit.js";
import { publishChange } from "../events.js";
import { listStatuses } from "../queries.js";
import { StatusCreate, StatusPatch } from "../../shared/contracts/statuses.js";

// F1·B — Escrituras de estados (EST-01, EST-04). La lectura está en catalogs.ts. Solo admin; no se borran.
export const statuses = Router();

const idParam = (raw: unknown) => {
  const parsed = z.uuid().safeParse(raw);
  if (!parsed.success) throw httpError(404, "Ese estado no existe.");
  return parsed.data;
};

// Un estado nuevo hereda las reglas de su tipo (EST-02).
const REQUIRES_SCHEDULE = ["programado", "en_obra"];
const REQUIRES_REASON = ["en_pausa"];

statuses.post("/", authenticated, admin, async (req, res) => {
  const body = StatusCreate.parse(req.body);
  const created = await transaction(async (c) => {
    const sort = (await c.query("SELECT COALESCE(max(sort),0)+1 AS next FROM statuses")).rows[0].next;
    const r = await c.query(
      `INSERT INTO statuses(id,name,kind,sort,fg,bg,dot,requires_schedule,requires_reason)
       VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [body.name, body.kind, Math.min(sort, 99), body.fg, body.bg, body.dot, REQUIRES_SCHEDULE.includes(body.kind), REQUIRES_REASON.includes(body.kind)],
    );
    const status = (await listStatuses(c)).find((s) => s.id === r.rows[0].id)!;
    await audit(c, req.user!.id, "status.create", "status", status.id, diffOf(null, status as unknown as Record<string, unknown>));
    return status;
  });
  publishChange("status");
  res.status(201).json(created);
});

statuses.patch("/:id", authenticated, admin, async (req, res) => {
  const id = idParam(req.params.id);
  const { version, ...changes } = StatusPatch.parse(req.body);
  const updated = await transaction(async (c) => {
    const before = (await c.query("SELECT * FROM statuses WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (!before) throw httpError(404, "Ese estado no existe.");
    if (before.version !== version) throw httpError(409, "Otra persona cambió este estado. Recarga para ver la versión más reciente.");
    const keys = Object.keys(changes) as (keyof typeof changes)[];
    if (keys.length)
      await c.query(
        `UPDATE statuses SET ${[...keys.map((k, i) => `${k}=$${i + 1}`), "version=version+1", "updated_at=now()"].join(",")} WHERE id=$${keys.length + 1}`,
        [...keys.map((k) => changes[k]), id],
      );
    const after = (await listStatuses(c)).find((s) => s.id === id)!;
    if (keys.length) await audit(c, req.user!.id, "status.update", "status", id, diffOf(before, after as unknown as Record<string, unknown>));
    return { after, changed: keys.length > 0 };
  });
  if (updated.changed) publishChange("status");
  res.json(updated.after);
});

// EST-04: un estado no se borra (hay proyectos que lo usan y cada tipo necesita al menos uno).
statuses.delete("/:id", authenticated, admin, (_req, _res) => {
  throw httpError(409, "Un estado no se puede borrar. Puedes cambiarle el nombre, el orden o el color.");
});

