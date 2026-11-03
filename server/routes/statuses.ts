import { Router } from "express";
import { z } from "zod";
import type { PoolClient } from "pg";
import { transaction, httpError } from "../db.js";
import { admin, authenticated } from "../auth.js";
import { audit, diffOf } from "../audit.js";
import { publishChange } from "../events.js";
import { listStatuses } from "../queries.js";
import { serverToday } from "../today.js";
import { changedFields, fieldsOf, lockProject, saveProject, validateAgainstDb } from "../project-store.js";
import type { Project } from "../../shared/contracts/projects.js";
import { StatusCreate, StatusDelete, StatusPatch, type StatusDeleted } from "../../shared/contracts/statuses.js";
import { mergeProject, plural, type StatusKind } from "../../shared/domain.js";

// F1·B — Escrituras de estados (EST-01, EST-04, EST-05). La lectura está en catalogs.ts. Solo admin.
export const statuses = Router();

const idParam = (raw: unknown) => {
  const parsed = z.uuid().safeParse(raw);
  if (!parsed.success) throw httpError(404, "Ese estado no existe.");
  return parsed.data;
};

// Un estado nuevo hereda las reglas de su tipo (EST-02).
const REQUIRES_SCHEDULE = ["programado", "en_obra"];
const REQUIRES_REASON = ["en_pausa"];

const KIND_LABEL: Record<StatusKind, string> = {
  por_programar: "Por programar", programado: "Programado", en_obra: "En obra",
  en_pausa: "En pausa", terminado: "Terminado", post_obra: "Post-obra",
};

/** Dos estados no pueden llamarse igual aunque cambien las mayúsculas (la base solo lo evita con la misma grafía). */
async function assertFreeName(c: PoolClient, name: string, exceptId?: string) {
  const r = await c.query("SELECT 1 FROM statuses WHERE lower(name)=lower($1) AND ($2::uuid IS NULL OR id<>$2)", [name, exceptId ?? null]);
  if (r.rowCount) throw httpError(409, `Ya existe un estado llamado «${name}».`);
}

statuses.post("/", authenticated, admin, async (req, res) => {
  const body = StatusCreate.parse(req.body);
  const created = await transaction(async (c) => {
    await assertFreeName(c, body.name);
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
    if (changes.name !== undefined && changes.name !== before.name) await assertFreeName(c, changes.name, id);
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

// EST-05: borrar un estado. Los proyectos que lo usan (archivados incluidos) pasan al estado de reemplazo en la misma
// transacción, cada uno con su historial y su versión nueva. Nunca queda un tipo sin estado.
statuses.delete("/:id", authenticated, admin, async (req, res) => {
  const id = idParam(req.params.id);
  const { version, replacement_id } = StatusDelete.parse(req.body ?? {});
  const today = serverToday();
  const out = await transaction(async (c): Promise<StatusDeleted> => {
    const before = (await listStatuses(c)).find((s) => s.id === id);
    if (!before) throw httpError(404, "Ese estado no existe.");
    // El tipo no cambia nunca (StatusPatch no lo permite). Un bloqueo por tipo serializa los borrados del mismo tipo para que
    // el conteo de abajo vea el resultado de los demás; después se bloquean el estado y su reemplazo en orden de id.
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`status-kind:${before.kind}`]);
    const lockIds = [id, ...(replacement_id && replacement_id !== id ? [replacement_id] : [])];
    await c.query("SELECT id FROM statuses WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE", [lockIds]);
    const current = (await c.query("SELECT version FROM statuses WHERE id=$1", [id])).rows[0];
    if (!current) throw httpError(404, "Ese estado ya no existe.");
    if (current.version !== version) throw httpError(409, "Otra persona cambió este estado. Recarga para ver la versión más reciente.");

    const sameKind = await c.query("SELECT count(*)::int AS n FROM statuses WHERE kind=$1", [before.kind]);
    if (sameKind.rows[0].n <= 1)
      throw httpError(409, `«${before.name}» es el único estado de tipo ${KIND_LABEL[before.kind]}. Crea otro de ese tipo antes de borrarlo.`);

    const using = (await c.query("SELECT id FROM projects WHERE status_id=$1 ORDER BY id FOR UPDATE", [id])).rows as { id: string }[];
    if (using.length && !replacement_id)
      throw httpError(422, `${plural(using.length, "proyecto usa", "proyectos usan")} el estado «${before.name}». Elige a qué estado pasan antes de borrarlo.`);
    if (replacement_id === id) throw httpError(422, "El estado de reemplazo debe ser otro.");
    const replacement = replacement_id ? (await listStatuses(c)).find((s) => s.id === replacement_id) : undefined;
    if (replacement_id && !replacement) throw httpError(422, "El estado de reemplazo ya no existe. Elige otro y vuelve a intentarlo.");

    if (replacement) {
      const problems: string[] = [];
      const moves: { before: Project; changes: ReturnType<typeof changedFields> }[] = [];
      for (const { id: projectId } of using) {
        const p = (await lockProject(c, projectId))!;
        const merged = mergeProject(fieldsOf(p), { status_id: replacement.id }, replacement.kind, today);
        // Cambiar de tipo puede exigir fechas, equipo o motivo (VAL-01, VAL-02); con el mismo tipo no cambia ninguna regla.
        // Los archivados no están en uso: pasan sin validar (regla documentada, no bloquean el borrado).
        if (replacement.kind !== before.kind && !p.archived) {
          const check = await validateAgainstDb(c, { ...merged, id: p.id }, replacement, today);
          if (check.errors.length) problems.push(`${p.name}: ${check.errors.join(" ")}`);
        }
        moves.push({ before: p, changes: changedFields(fieldsOf(p), merged) });
      }
      if (problems.length)
        throw httpError(
          422,
          `No se pueden pasar a «${replacement.name}» estos proyectos: ${problems.slice(0, 3).join(" · ")}${problems.length > 3 ? ` y ${problems.length - 3} más` : ""}. Elige otro estado de reemplazo.`,
        );
      for (const m of moves) await saveProject(c, m.before, m.changes, req.user!.id);
    }

    await c.query("DELETE FROM statuses WHERE id=$1", [id]);
    await audit(c, req.user!.id, "status.delete", "status", id, {
      ...diffOf(before as unknown as Record<string, unknown>, {}, ["name", "kind", "sort", "fg", "bg", "dot"]),
      moved_projects: [using.length, 0],
      replacement: [null, replacement?.name ?? null],
    });
    return { deleted_id: id, moved_projects: using.length };
  });
  publishChange("status");
  if (out.moved_projects) publishChange("project");
  res.json(out);
});
