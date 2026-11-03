import { Router } from "express";
import { z } from "zod";
import type { PoolClient } from "pg";
import { transaction, httpError } from "../db.js";
import { authenticated } from "../auth.js";
import { audit, diffOf } from "../audit.js";
import { publishChange } from "../events.js";
import { EmployeeCreate, EmployeePatch, type Employee } from "../../shared/contracts/equipo.js";

// F1·C — Escrituras de empleados (EQP-01, EQP-02, EQP-04, ACC-06)
export const employees = Router();

const FIELDS = ["name", "job", "level", "team_id", "state", "phone"] as const;

export async function getEmployee(db: Pick<PoolClient, "query">, id: string, lock = false): Promise<Employee | undefined> {
  const r = await db.query(
    `SELECT e.id,e.name,e.job,e.level,e.team_id,e.state,e.phone,e.version,
      CASE WHEN l.id IS NULL THEN 'none' WHEN l.active THEN 'active' ELSE 'revoked' END AS mobile_access,
      l.id AS mobile_link_id
     FROM employees e LEFT JOIN access_links l ON l.employee_id=e.id AND l.kind='mobile'
     WHERE e.id=$1 ${lock ? "FOR UPDATE OF e" : ""}`,
    [id],
  );
  return r.rows[0];
}

async function assertTeam(c: PoolClient, teamId: string | null | undefined) {
  if (!teamId) return;
  const t = await c.query("SELECT 1 FROM teams WHERE id=$1", [teamId]);
  if (!t.rowCount) throw httpError(422, "Ese equipo ya no existe.");
}

employees.post("/", authenticated, async (req, res) => {
  const b = EmployeeCreate.parse(req.body);
  const created = await transaction(async (c) => {
    await assertTeam(c, b.team_id);
    const r = await c.query(
      "INSERT INTO employees(id,name,job,level,team_id,state,phone) VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6) RETURNING id",
      [b.name, b.job, b.level, b.team_id ?? null, b.state, b.phone],
    );
    const e = (await getEmployee(c, r.rows[0].id))!;
    await audit(c, req.user!.id, "employee.create", "employee", e.id, diffOf(null, e, [...FIELDS]));
    return e;
  });
  publishChange("employee.create");
  res.status(201).json(created);
});

employees.patch("/:id", authenticated, async (req, res) => {
  const id = z.uuid().safeParse(req.params.id);
  if (!id.success) throw httpError(404, "Ese empleado no existe.");
  const { version, ...changes } = EmployeePatch.parse(req.body);
  const updated = await transaction(async (c) => {
    const before = await getEmployee(c, id.data, true);
    if (!before) throw httpError(404, "Ese empleado no existe.");
    if (before.version !== version)
      throw httpError(409, "Otra persona cambió a este empleado. Se recargó la fila; revisa y vuelve a intentar.");

    const next = { ...before, ...Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined)) };
    if (changes.team_id !== undefined) await assertTeam(c, changes.team_id);

    // Un encargado de equipo debe seguir siendo Encargado o Supervisor (EQP-03).
    if (changes.level && !["Encargado", "Supervisor"].includes(changes.level)) {
      const lead = await c.query("SELECT name FROM teams WHERE lead_employee_id=$1 LIMIT 1", [id.data]);
      if (lead.rowCount)
        throw httpError(422, `${before.name} es el encargado de ${lead.rows[0].name}. Elige otro encargado antes de cambiar su nivel.`);
    }

    const sets: string[] = [];
    const args: unknown[] = [];
    for (const f of FIELDS) {
      if (changes[f] === undefined) continue;
      args.push(changes[f]);
      sets.push(`${f}=$${args.length}`);
    }
    if (sets.length) {
      args.push(id.data);
      await c.query(`UPDATE employees SET ${sets.join(",")},version=version+1,updated_at=now() WHERE id=$${args.length}`, args);
    }

    // ACC-06: quien pasa a "De baja" pierde su enlace móvil y sus dispositivos, en la misma transacción.
    let revoked: string[] = [];
    if (next.state === "De baja") {
      const links = await c.query(
        "UPDATE access_links SET active=false, token_hash=null WHERE employee_id=$1 AND (active OR token_hash IS NOT NULL) RETURNING id",
        [id.data],
      );
      revoked = links.rows.map((r) => r.id as string);
      await c.query("DELETE FROM device_sessions WHERE link_id IN (SELECT id FROM access_links WHERE employee_id=$1)", [id.data]);
      for (const linkId of revoked)
        await audit(c, req.user!.id, "access_link.revoke", "access_link", linkId, { reason: ["", "employee.inactive"], employee_id: [null, id.data] });
    }

    const after = (await getEmployee(c, id.data))!;
    if (sets.length) await audit(c, req.user!.id, "employee.update", "employee", id.data, diffOf(before, after, [...FIELDS]));
    return after;
  });
  publishChange("employee.update");
  res.json(updated);
});
