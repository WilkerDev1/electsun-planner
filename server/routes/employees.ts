import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { PoolClient } from "pg";
import { transaction, httpError } from "../db.js";
import { authenticated } from "../auth.js";
import { audit, diffOf } from "../audit.js";
import { publishChange } from "../events.js";
import { listEmployees, listLevels, listRoles } from "../queries.js";
import { applyRoles, levelByName, lockRoles, permsOf, revokeMobile, syncDerived, type DesiredRole } from "../roles.js";
import { serverToday } from "../today.js";
import { EmployeeCreate, EmployeePatch, type Employee, type EmployeeRoleInput } from "../../shared/contracts/equipo.js";
import { effectiveRoles, type ISODate } from "../../shared/domain.js";

// F1·C — Escrituras de empleados (EQP-01, EQP-01b, EQP-02, EQP-04, ACC-06)
export const employees = Router();

const FIELDS = ["name", "job", "level", "team_id", "state", "phone"] as const;

export async function getEmployee(c: PoolClient, id: string, lock = false, today: ISODate = serverToday()): Promise<Employee | undefined> {
  if (lock) await c.query("SELECT 1 FROM employees WHERE id=$1 FOR UPDATE", [id]);
  return (await listEmployees(c, today, { id }))[0];
}

async function assertTeam(c: PoolClient, teamId: string | null | undefined) {
  if (!teamId) return;
  const t = await c.query("SELECT 1 FROM teams WHERE id=$1", [teamId]);
  if (!t.rowCount) throw httpError(422, "Ese equipo ya no existe.");
}

const desiredOf = (r: EmployeeRoleInput): DesiredRole => ({
  id: r.id,
  level_id: r.level_id,
  team_id: r.team_id ?? null,
  starts_on: r.starts_on,
  ends_on: r.ends_on ?? null,
  note: r.note,
});

/** Resumen de los roles vigentes y próximos para el historial (HIS-01). */
const roleSummary = (e: Employee) =>
  e.roles.map((r) => `${r.level}${r.team_id ? ` (${r.team_id})` : ""} ${r.starts_on}→${r.ends_on ?? ""}`);

/** Sin enlace móvil: «De baja» o ningún nivel vigente con acceso móvil (ACC-06, NIV-01). */
async function revokeIfNoMobile(c: PoolClient, actor: string, id: string, state: string, today: ISODate) {
  if (state !== "De baja" && (await permsOf(c, id, today)).can_use_mobile) return;
  await revokeMobile(c, actor, id, state === "De baja" ? "employee.inactive" : "level.no_mobile");
}

employees.post("/", authenticated, async (req, res) => {
  const b = EmployeeCreate.parse(req.body);
  const created = await transaction(async (c) => {
    const today = serverToday();
    await lockRoles(c);
    await assertTeam(c, b.team_id);
    const levels = await listLevels(c, today);
    // El atajo `level` abre un solo rol, vigente desde hoy y sin fecha de fin.
    const desired: DesiredRole[] = b.roles
      ? b.roles.map(desiredOf)
      : [{ level_id: levelByName(levels, b.level!).id, team_id: null, starts_on: today, ends_on: null, note: "" }];
    const id = crypto.randomUUID();
    await c.query(
      "INSERT INTO employees(id,name,job,level,team_id,state,phone) VALUES($1,$2,$3,'-',$4,$5,$6)",
      [id, b.name, b.job, b.team_id ?? null, b.state, b.phone],
    );
    await applyRoles(c, { employeeId: id, employeeName: b.name, desired, today, actor: req.user!.id, levels });
    await syncDerived(c, today);
    const e = (await getEmployee(c, id, false, today))!;
    await audit(c, req.user!.id, "employee.create", "employee", e.id, { ...diffOf(null, e, [...FIELDS]), roles: [null, roleSummary(e)] });
    return e;
  });
  publishChange("employee.create");
  res.status(201).json(created);
});

employees.patch("/:id", authenticated, async (req, res) => {
  const id = z.uuid().safeParse(req.params.id);
  if (!id.success) throw httpError(404, "Ese empleado no existe.");
  const { version, level, roles, ...changes } = EmployeePatch.parse(req.body);
  const updated = await transaction(async (c) => {
    const today = serverToday();
    await lockRoles(c);
    const before = await getEmployee(c, id.data, true, today);
    if (!before) throw httpError(404, "Ese empleado no existe.");
    if (before.version !== version)
      throw httpError(409, "Otra persona cambió a este empleado. Se recargó la fila; revisa y vuelve a intentar.");
    if (changes.team_id !== undefined) await assertTeam(c, changes.team_id);

    const next = { ...before, ...Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined)) };

    // Roles: edición completa (`roles`) o atajo de nivel (`level`): cierra el rol principal y abre el nuevo con historial.
    let rolesChanged = false;
    if (roles || level) {
      const levels = await listLevels(c, today);
      let desired: DesiredRole[];
      if (roles) desired = roles.map(desiredOf);
      else {
        const target = levelByName(levels, level!);
        const map = new Map(levels.map((l) => [l.id, l]));
        const mine = await listRoles(c, id.data);
        const eff = effectiveRoles(mine, map, today);
        const main = eff.current.find((r) => r.level.active);
        if (main?.level_id === target.id) desired = [];
        else {
          const keep = mine.filter((r) => (r.ends_on === null || r.ends_on >= today) && r.id !== main?.id);
          desired = [
            ...keep.map(({ id: rid, level_id, team_id, starts_on, ends_on, note }) => ({ id: rid, level_id, team_id, starts_on, ends_on, note })),
            { level_id: target.id, team_id: target.can_lead_team ? (main?.team_id ?? null) : null, starts_on: today, ends_on: main?.ends_on ?? null, note: "" },
          ];
        }
      }
      if (roles || desired.length) {
        await applyRoles(c, { employeeId: id.data, employeeName: before.name, desired, today, actor: req.user!.id, levels });
        rolesChanged = true;
      }
    }

    const sets: string[] = [];
    const args: unknown[] = [];
    for (const f of FIELDS) {
      if (f === "level" || changes[f as keyof typeof changes] === undefined) continue;
      args.push(changes[f as keyof typeof changes]);
      sets.push(`${f}=$${args.length}`);
    }
    if (sets.length || rolesChanged) {
      args.push(id.data);
      await c.query(`UPDATE employees SET ${sets.length ? sets.join(",") + "," : ""}version=version+1,updated_at=now() WHERE id=$${args.length}`, args);
    }
    if (rolesChanged) await syncDerived(c, today);

    // ACC-06 / NIV-01: sin acceso móvil (De baja o ningún nivel vigente lo permite) se revoca el enlace y los dispositivos.
    await revokeIfNoMobile(c, req.user!.id, id.data, next.state, today);

    const after = (await getEmployee(c, id.data, false, today))!;
    if (sets.length || rolesChanged) {
      const diff: Record<string, unknown> = diffOf(before, after, [...FIELDS]);
      if (roles) {
        const [a, z2] = [JSON.stringify(roleSummary(before)), JSON.stringify(roleSummary(after))];
        if (a !== z2) diff.roles = [roleSummary(before), roleSummary(after)];
      }
      await audit(c, req.user!.id, "employee.update", "employee", id.data, diff);
    }
    return after;
  });
  publishChange("employee.update");
  res.json(updated);
});
