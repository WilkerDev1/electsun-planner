import { Router } from "express";
import { z } from "zod";
import type { PoolClient } from "pg";
import { pool, transaction, httpError } from "../db.js";
import { admin, authenticated } from "../auth.js";
import { audit, diffOf } from "../audit.js";
import { publishChange } from "../events.js";
import { levelMap, listLevels } from "../queries.js";
import { levelImpact, lockRoles, revokeMobile, syncDerived } from "../roles.js";
import { serverToday } from "../today.js";
import { LevelCreate, LevelPatch, MAX_LEVELS, type LevelItem } from "../../shared/contracts/equipo.js";
import { fold, joinEs } from "../../shared/domain.js";

// Catálogo de niveles de empleado (NIV-01). Lo lee cualquier cuenta; solo el administrador lo escribe.
export const levels = Router();

const FIELDS = ["code", "name", "group_label", "sort", "fg", "bg", "border", "icon", "can_lead_team", "is_supervisor", "can_use_mobile", "is_field", "active"];
/** El nivel «Oficina» es el de quien no sale a obra: solo se puede reordenar. */
const LOCKED_CODE = "oficina";

const idParam = (raw: unknown) => {
  const parsed = z.uuid().safeParse(raw);
  if (!parsed.success) throw httpError(404, "Ese nivel no existe.");
  return parsed.data;
};

/** Serializa altas y cambios: el tope, la unicidad y las comprobaciones de uso se hacen sin carreras. */
const lockLevels = async (c: PoolClient) => {
  await c.query("SELECT pg_advisory_xact_lock(hashtext('levels'))");
  await lockRoles(c);
};

const getLevel = async (c: PoolClient, id: string) => (await listLevels(c, serverToday())).find((l) => l.id === id);
const asRecord = (l: LevelItem) => l as unknown as Record<string, unknown>;

/** «Jefe de obra» → `jefe_de_obra`: letras sin tildes, números y guion bajo, de 2 a 24 caracteres. */
function slug(name: string) {
  const s = fold(name).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24).replace(/_+$/g, "");
  return s.length >= 2 ? s : `nivel_${s}`.slice(0, 24);
}

levels.get("/", authenticated, async (_req, res) => res.json(await listLevels(pool, serverToday())));

levels.post("/", authenticated, admin, async (req, res) => {
  const body = LevelCreate.parse(req.body);
  const created = await transaction(async (c) => {
    await lockLevels(c);
    const all = await listLevels(c, serverToday());
    if (all.length >= MAX_LEVELS) throw httpError(422, `Ya hay ${MAX_LEVELS} niveles. Desactiva o reutiliza uno antes de agregar otro.`);
    const hit = all.find((l) => fold(l.name) === fold(body.name));
    if (hit) throw httpError(409, `Ya existe un nivel llamado «${hit.name}».`);
    let code = body.code ?? slug(body.name);
    if (body.code) {
      if (all.some((l) => l.code === code)) throw httpError(409, `El código ${code} ya lo usa «${all.find((l) => l.code === code)!.name}».`);
    } else {
      const base = code;
      for (let n = 2; all.some((l) => l.code === code); n++) code = `${base.slice(0, 24 - String(n).length - 1)}_${n}`;
    }
    const sort = Math.min(Math.max(0, ...all.map((l) => l.sort)) + 1, 99);
    const r = await c.query(
      `INSERT INTO levels(id,code,name,group_label,sort,fg,bg,border,icon,can_lead_team,is_supervisor,can_use_mobile,is_field)
       VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [code, body.name, body.group_label ?? body.name, sort, body.fg, body.bg, body.border, body.icon, body.can_lead_team, body.is_supervisor, body.can_use_mobile, body.is_field],
    );
    const item = (await getLevel(c, r.rows[0].id))!;
    await audit(c, req.user!.id, "level.create", "level", item.id, diffOf(null, asRecord(item), FIELDS));
    return item;
  });
  publishChange("level");
  res.status(201).json(created);
});

levels.patch("/:id", authenticated, admin, async (req, res) => {
  const id = idParam(req.params.id);
  const { version, ...changes } = LevelPatch.parse(req.body);
  const out = await transaction(async (c) => {
    const today = serverToday();
    await lockLevels(c);
    await c.query("SELECT 1 FROM levels WHERE id=$1 FOR UPDATE", [id]);
    const all = await listLevels(c, today);
    const before = all.find((l) => l.id === id);
    if (!before) throw httpError(404, "Ese nivel no existe.");
    if (before.version !== version) throw httpError(409, "Otra persona cambió este nivel. Recarga para ver la versión más reciente.");
    const keys = (Object.keys(changes) as (keyof typeof changes)[]).filter((k) => changes[k] !== undefined && changes[k] !== before[k]);
    if (!keys.length) return { after: before, changed: false };
    if (before.code === LOCKED_CODE && keys.some((k) => k !== "sort")) throw httpError(422, `El nivel «${before.name}» no se puede cambiar; solo moverlo de lugar.`);
    if (changes.name !== undefined) {
      const hit = all.find((l) => l.id !== id && fold(l.name) === fold(changes.name!));
      if (hit) throw httpError(409, `Ya existe un nivel llamado «${hit.name}».`);
    }

    // Reglas de uso: no dejar sin nivel a nadie ni sin encargado a un equipo activo, ni apagar el último nivel activo.
    const afterDef = { ...before, ...Object.fromEntries(keys.map((k) => [k, changes[k]])) };
    const afterMap = levelMap(all.map((l) => (l.id === id ? afterDef : l)));
    if (!afterMap.size || ![...afterMap.values()].some((l) => l.active)) throw httpError(422, "Debe quedar al menos un nivel activo.");
    const impact = await levelImpact(c, today, afterMap);
    const names = (list: string[]) => joinEs(list.slice(0, 3)) + (list.length > 3 ? ` y ${list.length - 3} más` : "");
    if (impact.noRole.length)
      throw httpError(422, `«${before.name}» es el único nivel vigente de ${names(impact.noRole)}. Cámbiales el nivel antes de desactivarlo.`);
    if (impact.noLead.length)
      throw httpError(422, `${names(impact.noLead)} se quedaría sin encargado. Elige otro encargado antes de cambiar «${before.name}».`);

    await c.query(
      `UPDATE levels SET ${[...keys.map((k, i) => `${k}=$${i + 1}`), "version=version+1", "updated_at=now()"].join(",")} WHERE id=$${keys.length + 1}`,
      [...keys.map((k) => changes[k]), id],
    );
    // Cambiar el nombre actualiza `employees.level`; quitar el acceso móvil revoca los enlaces de quien lo pierde.
    await syncDerived(c, today);
    for (const employeeId of impact.lostMobile) await revokeMobile(c, req.user!.id, employeeId, "level.no_mobile");
    const after = (await getLevel(c, id))!;
    await audit(c, req.user!.id, "level.update", "level", id, diffOf(asRecord(before), asRecord(after), FIELDS));
    return { after, changed: true };
  });
  if (out.changed) publishChange("level");
  res.json(out.after);
});
