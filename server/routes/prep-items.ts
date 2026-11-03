import { Router } from "express";
import { z } from "zod";
import type { PoolClient } from "pg";
import { pool, transaction, httpError } from "../db.js";
import { admin, authenticated } from "../auth.js";
import { audit, diffOf } from "../audit.js";
import { publishChange } from "../events.js";
import { listPrepItems } from "../queries.js";
import { lockProject, prepByCode } from "../project-store.js";
import { MAX_PREP_ITEMS, PrepItemCreate, PrepItemDelete, PrepItemPatch, type PrepItem, type PrepItemDeleted } from "../../shared/contracts/prep.js";

// Catálogo de preparación (PRY-12, CAL-07). Lo lee cualquier cuenta; solo el administrador lo escribe.
export const prepItems = Router();

const FIELDS = ["code", "name", "pending_label", "applies_to", "default_on", "sort"];

const idParam = (raw: unknown) => {
  const parsed = z.uuid().safeParse(raw);
  if (!parsed.success) throw httpError(404, "Ese parámetro de preparación no existe.");
  return parsed.data;
};

async function getItem(c: PoolClient, id: string): Promise<PrepItem | undefined> {
  return (await listPrepItems(c)).find((i) => i.id === id);
}

/** Código y nombre únicos (el nombre sin importar mayúsculas: es la cabecera de la columna en el Excel). */
async function assertUnique(c: PoolClient, f: { code?: string; name?: string }, exceptId?: string) {
  if (f.code !== undefined) {
    const r = await c.query("SELECT name FROM prep_items WHERE code=$1 AND ($2::uuid IS NULL OR id<>$2)", [f.code, exceptId ?? null]);
    if (r.rowCount) throw httpError(409, `El código ${f.code} ya lo usa «${r.rows[0].name}».`);
  }
  if (f.name !== undefined) {
    const r = await c.query("SELECT 1 FROM prep_items WHERE lower(name)=lower($1) AND ($2::uuid IS NULL OR id<>$2)", [f.name, exceptId ?? null]);
    if (r.rowCount) throw httpError(409, `Ya existe un parámetro llamado «${f.name}».`);
  }
}

prepItems.get("/", authenticated, async (_req, res) => res.json(await listPrepItems(pool)));

prepItems.post("/", authenticated, admin, async (req, res) => {
  const body = PrepItemCreate.parse(req.body);
  const created = await transaction(async (c) => {
    const { n, next } = (await c.query("SELECT count(*)::int AS n, COALESCE(max(sort),0)+1 AS next FROM prep_items")).rows[0];
    if (n >= MAX_PREP_ITEMS) throw httpError(422, `El catálogo ya tiene ${MAX_PREP_ITEMS} parámetros. Quita alguno antes de agregar otro.`);
    await assertUnique(c, body);
    const r = await c.query(
      "INSERT INTO prep_items(id,code,name,pending_label,applies_to,default_on,sort) VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6) RETURNING id",
      [body.code, body.name, body.pending_label, body.applies_to, body.default_on, Math.min(next, 99)],
    );
    const item = (await getItem(c, r.rows[0].id))!;
    await audit(c, req.user!.id, "prep_item.create", "prep_item", item.id, diffOf(null, item as unknown as Record<string, unknown>, FIELDS));
    return item;
  });
  publishChange("prep");
  res.status(201).json(created);
});

prepItems.patch("/:id", authenticated, admin, async (req, res) => {
  const id = idParam(req.params.id);
  const { version, ...changes } = PrepItemPatch.parse(req.body);
  const out = await transaction(async (c) => {
    await c.query("SELECT 1 FROM prep_items WHERE id=$1 FOR UPDATE", [id]);
    const before = await getItem(c, id);
    if (!before) throw httpError(404, "Ese parámetro de preparación no existe.");
    if (before.version !== version) throw httpError(409, "Otra persona cambió este parámetro. Recarga para ver la versión más reciente.");
    await assertUnique(c, { code: changes.code !== before.code ? changes.code : undefined, name: changes.name !== before.name ? changes.name : undefined }, id);
    const keys = Object.keys(changes) as (keyof typeof changes)[];
    if (!keys.length) return { after: before, changed: false };
    await c.query(
      `UPDATE prep_items SET ${[...keys.map((k, i) => `${k}=$${i + 1}`), "version=version+1", "updated_at=now()"].join(",")} WHERE id=$${keys.length + 1}`,
      [...keys.map((k) => changes[k]), id],
    );
    const after = (await getItem(c, id))!;
    await audit(c, req.user!.id, "prep_item.update", "prep_item", id, diffOf(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>, FIELDS));
    return { after, changed: true };
  });
  if (out.changed) publishChange("prep");
  res.json(out.after);
});

// Quitar un parámetro lo quita también de los proyectos que lo tenían (ON DELETE CASCADE). Cada uno recibe versión nueva
// y una entrada de historial, para que quien tenga la ficha abierta vea el cambio y no guarde la lista vieja.
prepItems.delete("/:id", authenticated, admin, async (req, res) => {
  const id = idParam(req.params.id);
  const { version } = PrepItemDelete.parse(req.body ?? {});
  const out = await transaction(async (c): Promise<PrepItemDeleted> => {
    await c.query("SELECT 1 FROM prep_items WHERE id=$1 FOR UPDATE", [id]);
    const before = await getItem(c, id);
    if (!before) throw httpError(404, "Ese parámetro de preparación no existe.");
    if (before.version !== version) throw httpError(409, "Otra persona cambió este parámetro. Recarga para ver la versión más reciente.");
    const codes = new Map((await c.query("SELECT id,code FROM prep_items")).rows.map((r) => [r.id as string, r.code as string]));
    const affected = (await c.query("SELECT project_id FROM project_prep WHERE item_id=$1 ORDER BY project_id", [id])).rows.map((r) => r.project_id as string);
    const histories: { id: string; before: Record<string, boolean>; after: Record<string, boolean> }[] = [];
    for (const projectId of affected) {
      const p = (await lockProject(c, projectId))!;
      histories.push({
        id: projectId,
        before: prepByCode(p.prep, codes),
        after: prepByCode(p.prep.filter((e) => e.item_id !== id), codes),
      });
    }
    await c.query("DELETE FROM prep_items WHERE id=$1", [id]);
    if (affected.length) await c.query("UPDATE projects SET version=version+1,updated_at=now() WHERE id=ANY($1::uuid[])", [affected]);
    for (const h of histories) await audit(c, req.user!.id, "project.update", "project", h.id, { prep: [h.before, h.after] });
    await audit(c, req.user!.id, "prep_item.delete", "prep_item", id, {
      ...diffOf(before as unknown as Record<string, unknown>, {}, FIELDS),
      projects: [affected.length, 0],
    });
    return { deleted_id: id, project_count: affected.length };
  });
  publishChange("prep");
  if (out.project_count) publishChange("project");
  res.json(out);
});
