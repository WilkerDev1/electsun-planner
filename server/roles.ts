import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { httpError } from "./db.js";
import { audit } from "./audit.js";
import { levelMap, listLevels, listRoles, type RoleRow } from "./queries.js";
import type { LevelItem } from "../shared/contracts/equipo.js";
import {
  addDays,
  effectiveRoles,
  effectiveTeamLead,
  findLeadOverlap,
  fold,
  isRoleActiveOn,
  joinEs,
  shortDate,
  spansOverlap,
  type ISODate,
  type LevelDef,
} from "../shared/domain.js";

// Reglas de escritura de niveles y roles con vigencia (NIV-01, EQP-01b, EQP-03b). Las usan employees, teams y levels.
// Siempre dentro de una transacción; `lockRoles` serializa las validaciones de cruce entre encargados.

export const lockRoles = (c: PoolClient) => c.query("SELECT pg_advisory_xact_lock(hashtext('employee_roles'))");

/** Rol que llega a guardarse: con `id` edita uno existente, sin `id` crea uno. */
export type DesiredRole = { id?: string; level_id: string; team_id: string | null; starts_on: ISODate; ends_on: ISODate | null; note: string };

export function levelByName(levels: readonly LevelDef[], name: string): LevelDef {
  const l = levels.find((x) => fold(x.name) === fold(name));
  if (!l) throw httpError(422, `El nivel «${name}» no existe. Elígelo de la lista de niveles.`);
  if (!l.active) throw httpError(422, `El nivel «${l.name}» está desactivado.`);
  return l;
}

const fmtRange = (r: { starts_on: ISODate; ends_on: ISODate | null }) =>
  r.ends_on ? `del ${shortDate(r.starts_on)} al ${shortDate(r.ends_on)}` : `desde el ${shortDate(r.starts_on)}`;

async function insertRole(c: PoolClient, r: Omit<RoleRow, "id"> & { id?: string }, actor: string | null) {
  await c.query(
    "INSERT INTO employee_roles(id,employee_id,level_id,team_id,starts_on,ends_on,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [r.id ?? crypto.randomUUID(), r.employee_id, r.level_id, r.team_id, r.starts_on, r.ends_on, r.note, actor],
  );
}

/**
 * Mantiene las copias `employees.level` (nivel principal de hoy) y `teams.lead_employee_id` (encargado de hoy).
 * La API las resuelve con la fecha de hoy al leer; esto solo evita que la copia quede vieja tras una escritura.
 */
export async function syncDerived(c: PoolClient, today: ISODate) {
  const map = levelMap(await listLevels(c, today));
  const roles = await listRoles(c);
  for (const e of (await c.query("SELECT id,level FROM employees")).rows as { id: string; level: string }[]) {
    const name = effectiveRoles(
      roles.filter((r) => r.employee_id === e.id),
      map,
      today,
    ).display?.name;
    if (name && name !== e.level) await c.query("UPDATE employees SET level=$1 WHERE id=$2", [name, e.id]);
  }
  for (const t of (await c.query("SELECT id,lead_employee_id FROM teams")).rows as { id: string; lead_employee_id: string | null }[]) {
    const lead = effectiveTeamLead(roles, map, t.id, today);
    if (lead !== t.lead_employee_id) await c.query("UPDATE teams SET lead_employee_id=$1 WHERE id=$2", [lead, t.id]);
  }
}

/** Revoca el enlace móvil de un empleado y cierra sus dispositivos (ACC-06). Devuelve los enlaces revocados. */
export async function revokeMobile(c: PoolClient, actor: string | null, employeeId: string, reason: string): Promise<string[]> {
  const links = await c.query(
    "UPDATE access_links SET active=false, token_hash=null WHERE employee_id=$1 AND (active OR token_hash IS NOT NULL) RETURNING id",
    [employeeId],
  );
  const ids = links.rows.map((r) => r.id as string);
  await c.query("DELETE FROM device_sessions WHERE link_id IN (SELECT id FROM access_links WHERE employee_id=$1)", [employeeId]);
  for (const linkId of ids)
    await audit(c, actor, "access_link.revoke", "access_link", linkId, { reason: ["", reason], employee_id: [null, employeeId] });
  return ids;
}

/** Permisos efectivos de un empleado hoy (OR de sus niveles vigentes y activos). */
export async function permsOf(db: PoolClient | { query: PoolClient["query"] }, employeeId: string, today: ISODate) {
  const c = db as PoolClient;
  const map = levelMap(await listLevels(c, today));
  return effectiveRoles(await listRoles(c, employeeId), map, today).perms;
}

/**
 * Aplica los roles vigentes y próximos de un empleado (los vencidos no se tocan).
 * Un rol que se quita se borra si aún no tenía efecto; si ya lo tenía, se cierra ayer para conservar el historial.
 */
export async function applyRoles(
  c: PoolClient,
  o: { employeeId: string; employeeName: string; desired: DesiredRole[]; today: ISODate; actor: string | null; levels: LevelItem[] },
) {
  const { employeeId, today } = o;
  const map = levelMap(o.levels);
  const existing = await listRoles(c, employeeId);
  const editable = existing.filter((r) => r.ends_on === null || r.ends_on >= today);
  const finalRoles: RoleRow[] = existing.filter((r) => !editable.includes(r));
  const inserts: RoleRow[] = [];
  const updates: RoleRow[] = [];
  const deletes: string[] = [];
  const seen = new Set<string>();

  for (const d of o.desired) {
    if (d.id) {
      const e = editable.find((r) => r.id === d.id);
      if (!e || seen.has(d.id)) throw httpError(422, "Uno de los roles ya no se puede editar. Recarga la ficha e intenta de nuevo.");
      seen.add(d.id);
      const next: RoleRow = { ...e, level_id: d.level_id, team_id: d.team_id, starts_on: d.starts_on, ends_on: d.ends_on, note: d.note };
      if (JSON.stringify(next) !== JSON.stringify(e)) {
        if (next.level_id !== e.level_id && !map.get(next.level_id)?.active) throw httpError(422, "Ese nivel está desactivado o ya no existe.");
        updates.push(next);
      }
      finalRoles.push(next);
    } else {
      const r: RoleRow = { id: crypto.randomUUID(), employee_id: employeeId, level_id: d.level_id, team_id: d.team_id, starts_on: d.starts_on, ends_on: d.ends_on, note: d.note };
      if (!map.get(r.level_id)?.active) throw httpError(422, "Ese nivel está desactivado o ya no existe.");
      inserts.push(r);
      finalRoles.push(r);
    }
  }
  for (const e of editable.filter((r) => !seen.has(r.id))) {
    if (e.starts_on >= today) deletes.push(e.id);
    else {
      const closed = { ...e, ends_on: addDays(today, -1) };
      updates.push(closed);
      finalRoles.push(closed);
    }
  }

  await assertRoleSet(c, o.employeeName, employeeId, finalRoles, map, today);

  // Un equipo no puede quedarse sin encargado por quitarle el suyo (EQP-03). Para cambiarlo se usa el equipo.
  const all = await listRoles(c);
  const others = all.filter((r) => r.employee_id !== employeeId);
  for (const t of (await c.query("SELECT id,name FROM teams ORDER BY code")).rows as { id: string; name: string }[]) {
    if (effectiveTeamLead(all, map, t.id, today) !== employeeId) continue;
    if (effectiveTeamLead([...others, ...finalRoles], map, t.id, today) !== employeeId)
      throw httpError(422, `${o.employeeName} es el encargado de ${t.name}. Elige otro encargado antes de cambiar su nivel.`);
  }

  for (const id of deletes) await c.query("DELETE FROM employee_roles WHERE id=$1", [id]);
  for (const r of updates)
    await c.query("UPDATE employee_roles SET level_id=$2,team_id=$3,starts_on=$4,ends_on=$5,note=$6 WHERE id=$1", [
      r.id, r.level_id, r.team_id, r.starts_on, r.ends_on, r.note,
    ]);
  for (const r of inserts) await insertRole(c, r, o.actor);
}

/** Reglas del conjunto final de roles de una persona (EQP-01b, EQP-03b). */
async function assertRoleSet(c: PoolClient, name: string, employeeId: string, roles: RoleRow[], map: Map<string, LevelDef>, today: ISODate) {
  for (const r of roles) if (!map.has(r.level_id)) throw httpError(422, "Uno de los niveles ya no existe.");
  const teamIds = [...new Set(roles.map((r) => r.team_id).filter((x): x is string => !!x))];
  const teamName = new Map<string, string>();
  if (teamIds.length) {
    for (const t of (await c.query("SELECT id,name FROM teams WHERE id=ANY($1::uuid[])", [teamIds])).rows) teamName.set(t.id, t.name);
    if (teamName.size !== teamIds.length) throw httpError(422, "Ese equipo ya no existe.");
  }
  for (const r of roles)
    if (r.team_id && !map.get(r.level_id)!.can_lead_team)
      throw httpError(422, `El nivel «${map.get(r.level_id)!.name}» no puede liderar un equipo. Quita el equipo de ese rol.`);
  if (!effectiveRoles(roles, map, today).current.some((r) => r.level.active))
    throw httpError(422, `${name} necesita al menos un rol vigente hoy.`);

  // Dos encargados del mismo equipo no pueden coincidir en fechas.
  const own = findLeadOverlap(roles, map);
  if (own) throw httpError(422, `${name} tiene dos encargos de ${teamName.get(own[0].team_id!)} que se cruzan en fechas.`);
  if (teamIds.length) {
    const rivals = (
      await c.query(
        `SELECT r.level_id,r.team_id,r.starts_on,r.ends_on,e.name FROM employee_roles r JOIN employees e ON e.id=r.employee_id
         WHERE r.team_id=ANY($1::uuid[]) AND r.employee_id<>$2`,
        [teamIds, employeeId],
      )
    ).rows as { level_id: string; team_id: string; starts_on: ISODate; ends_on: ISODate | null; name: string }[];
    for (const a of roles.filter((r) => r.team_id && map.get(r.level_id)!.can_lead_team)) {
      const b = rivals.find((x) => x.team_id === a.team_id && map.get(x.level_id)?.can_lead_team && spansOverlap(a, x));
      if (b)
        throw httpError(
          422,
          `${teamName.get(a.team_id!)} ya tiene a ${b.name} como encargado ${fmtRange(b)}. Ajusta las fechas para que no se crucen.`,
        );
    }
  }
}

/** Cierra el encargo de un equipo en un rol, sin dejar a la persona sin rol (conserva su nivel, sin equipo). */
async function endAssignment(c: PoolClient, r: RoleRow, today: ISODate, actor: string | null) {
  if (r.starts_on >= today) {
    await c.query("UPDATE employee_roles SET team_id=NULL WHERE id=$1", [r.id]);
    return;
  }
  await c.query("UPDATE employee_roles SET ends_on=$2 WHERE id=$1", [r.id, addDays(today, -1)]);
  await insertRole(c, { employee_id: r.employee_id, level_id: r.level_id, team_id: null, starts_on: today, ends_on: r.ends_on, note: r.note }, actor);
}

/**
 * Cambia el encargado de un equipo (EQP-03): cierra el encargo vigente del anterior y abre el del nuevo desde hoy.
 * El nuevo debe tener hoy un rol vigente de un nivel que pueda liderar equipos.
 */
export async function setTeamLead(c: PoolClient, teamId: string, leadId: string | null, today: ISODate, actor: string | null) {
  const levels = await listLevels(c, today);
  const map = levelMap(levels);
  const roles = await listRoles(c);
  const isLead = (r: RoleRow) => !!map.get(r.level_id)?.can_lead_team;
  const current = roles.filter((r) => r.team_id === teamId && isLead(r) && isRoleActiveOn(r, today));
  if (leadId && current.some((r) => r.employee_id === leadId)) return;

  let base: RoleRow | undefined;
  if (leadId) {
    if (!(await c.query("SELECT 1 FROM employees WHERE id=$1", [leadId])).rowCount) throw httpError(422, "Ese empleado ya no existe.");
    base = roles
      .filter((r) => r.employee_id === leadId && isRoleActiveOn(r, today) && isLead(r) && map.get(r.level_id)!.active)
      .sort((a, b) => map.get(a.level_id)!.sort - map.get(b.level_id)!.sort)[0];
    if (!base) {
      const names = joinEs(levels.filter((l) => l.active && l.can_lead_team).map((l) => l.name));
      throw httpError(422, `El encargado debe ser un empleado de un nivel que pueda liderar equipos (${names || "ninguno"}).`);
    }
  }
  for (const r of current) await endAssignment(c, r, today, actor);
  if (!leadId || !base) return;

  // Si otra persona ya tiene programado el encargo más adelante, el nuevo termina el día anterior.
  const next = roles.filter((r) => r.team_id === teamId && isLead(r) && r.starts_on > today).sort((a, b) => a.starts_on.localeCompare(b.starts_on))[0];
  const limit = next ? addDays(next.starts_on, -1) : null;
  if (base.team_id === null && !limit) await c.query("UPDATE employee_roles SET team_id=$2 WHERE id=$1", [base.id, teamId]);
  else await insertRole(c, { employee_id: leadId, level_id: base.level_id, team_id: teamId, starts_on: today, ends_on: limit, note: "" }, actor);
}

/**
 * Qué pasaría con las personas y los equipos si el catálogo quedara como `after` (NIV-01):
 * quién se queda sin rol vigente, qué equipos activos pierden su encargado y a quién se le quita el acceso móvil.
 */
export async function levelImpact(c: PoolClient, today: ISODate, after: Map<string, LevelDef>) {
  const before = levelMap(await listLevels(c, today));
  const roles = await listRoles(c);
  const people = (await c.query("SELECT id,name,state FROM employees ORDER BY name")).rows as { id: string; name: string; state: string }[];
  const noRole: string[] = [];
  const lostMobile: string[] = [];
  for (const p of people) {
    const mine = roles.filter((r) => r.employee_id === p.id);
    const was = effectiveRoles(mine, before, today);
    const now = effectiveRoles(mine, after, today);
    if (p.state !== "De baja" && was.current.some((r) => r.level.active) && !now.current.some((r) => r.level.active)) noRole.push(p.name);
    if (was.perms.can_use_mobile && !now.perms.can_use_mobile) lostMobile.push(p.id);
  }
  const noLead = (await c.query("SELECT id,name FROM teams WHERE active ORDER BY code")).rows
    .filter((t) => effectiveTeamLead(roles, before, t.id, today) && !effectiveTeamLead(roles, after, t.id, today))
    .map((t) => t.name as string);
  return { noRole, noLead, lostMobile };
}
