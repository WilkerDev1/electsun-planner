import type { Db } from "./db.js";

/** Diferencias campo a campo entre dos versiones de una fila (HIS-01). */
export function diffOf(before: Record<string, unknown> | null, after: Record<string, unknown>, fields?: string[]) {
  const out: Record<string, [unknown, unknown]> = {};
  for (const k of fields ?? Object.keys(after)) {
    if (["version", "updated_at", "created_at"].includes(k)) continue;
    const a = before?.[k] ?? null;
    const b = after[k] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = [a, b];
  }
  return out;
}

/** Registra una escritura en `audit`. Llamar dentro de la misma transacción que el cambio. */
export async function audit(
  db: Db,
  actorId: string | null,
  action: string,
  entity: string,
  entityId: string | null,
  diff: Record<string, unknown> = {},
) {
  await db.query("INSERT INTO audit(actor_id,action,entity,entity_id,diff) VALUES($1,$2,$3,$4,$5)", [
    actorId,
    action,
    entity,
    entityId,
    JSON.stringify(diff),
  ]);
}
