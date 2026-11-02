import { Router } from "express";
import { z } from "zod";
import type { PoolClient } from "pg";
import { transaction, httpError } from "../db.js";
import { authenticated } from "../auth.js";
import { audit, diffOf } from "../audit.js";
import { publishChange } from "../events.js";
import { TeamCreate, TeamPatch, type Team } from "../../shared/contracts/equipo.js";

// F1·C — Escrituras de equipos de obra (EQP-03, EQP-04, EQP-06)
export const teams = Router();

const FIELDS = ["code", "name", "lead_employee_id", "color", "active"] as const;

async function getTeam(c: PoolClient, id: string, lock = false): Promise<Team | undefined> {
  if (lock) await c.query("SELECT 1 FROM teams WHERE id=$1 FOR UPDATE", [id]);
  const r = await c.query(
    `SELECT t.id,t.code,t.name,t.lead_employee_id,t.color,t.active,t.version,
      COALESCE(array_agg(e.id ORDER BY e.name) FILTER (WHERE e.id IS NOT NULL),'{}') AS member_ids
     FROM teams t LEFT JOIN employees e ON e.team_id=t.id WHERE t.id=$1 GROUP BY t.id`,
    [id],
  );
  return r.rows[0];
}

/** El encargado debe ser un empleado de nivel Encargado o Supervisor (EQP-03). */
async function assertLead(c: PoolClient, leadId: string | null | undefined) {
  if (!leadId) return;
  const r = await c.query("SELECT level FROM employees WHERE id=$1", [leadId]);
  if (!r.rowCount) throw httpError(422, "Ese empleado ya no existe.");
  if (!["Encargado", "Supervisor"].includes(r.rows[0].level))
    throw httpError(422, "El encargado debe ser un empleado de nivel Encargado o Supervisor.");
}

async function assertCodeFree(c: PoolClient, code: string, exceptId?: string) {
  const r = await c.query("SELECT 1 FROM teams WHERE code=$1 AND ($2::uuid IS NULL OR id<>$2)", [code, exceptId ?? null]);
  if (r.rowCount) throw httpError(409, `Ya existe un equipo con el código ${code}.`);
}

teams.post("/", authenticated, async (req, res) => {
  const b = TeamCreate.parse(req.body);
  const created = await transaction(async (c) => {
    await assertCodeFree(c, b.code);
    await assertLead(c, b.lead_employee_id);
    const r = await c.query(
      "INSERT INTO teams(id,code,name,lead_employee_id,color) VALUES(gen_random_uuid(),$1,$2,$3,$4) RETURNING id",
      [b.code, b.name, b.lead_employee_id ?? null, b.color ?? null],
    );
    const t = (await getTeam(c, r.rows[0].id))!;
    await audit(c, req.user!.id, "team.create", "team", t.id, diffOf(null, t, [...FIELDS]));
    return t;
  });
  publishChange("team.create");
  res.status(201).json(created);
});

teams.patch("/:id", authenticated, async (req, res) => {
  const id = z.uuid().safeParse(req.params.id);
  if (!id.success) throw httpError(404, "Ese equipo no existe.");
  const { version, member_ids, ...changes } = TeamPatch.parse(req.body);
  const updated = await transaction(async (c) => {
    const before = await getTeam(c, id.data, true);
    if (!before) throw httpError(404, "Ese equipo no existe.");
    if (before.version !== version)
      throw httpError(409, "Otra persona cambió este equipo. Se recargó; revisa y vuelve a intentar.");

    if (changes.code !== undefined && changes.code !== before.code) await assertCodeFree(c, changes.code, id.data);
    if (changes.lead_employee_id !== undefined) await assertLead(c, changes.lead_employee_id);

    // EQP-06: un equipo con obras programadas o en curso no se puede desactivar.
    if (changes.active === false && before.active) {
      const busy = await c.query(
        `SELECT p.name FROM projects p JOIN statuses s ON s.id=p.status_id
         WHERE p.team_id=$1 AND NOT p.archived AND s.kind IN ('programado','en_obra') ORDER BY p.start_date NULLS LAST, p.name`,
        [id.data],
      );
      if (busy.rowCount) {
        const names = busy.rows.slice(0, 3).map((r) => r.name).join(", ");
        const more = busy.rowCount > 3 ? ` y ${busy.rowCount - 3} más` : "";
        throw httpError(
          422,
          `${before.name} tiene ${busy.rowCount === 1 ? "una obra activa" : `${busy.rowCount} obras activas`} (${names}${more}). Cámbiala de equipo o termínala antes de desactivar el equipo.`,
        );
      }
    }

    const sets: string[] = [];
    const args: unknown[] = [];
    for (const f of FIELDS) {
      if (changes[f] === undefined) continue;
      args.push(changes[f]);
      sets.push(`${f}=$${args.length}`);
    }

    // `member_ids` fija exactamente los integrantes (EQP-04): saca a quien sobra y trae a quien falta de otro equipo.
    const moved: { id: string; from: string | null; to: string | null }[] = [];
    if (member_ids) {
      const wanted = [...new Set(member_ids)];
      const found = await c.query("SELECT id FROM employees WHERE id=ANY($1::uuid[])", [wanted]);
      if (found.rowCount !== wanted.length) throw httpError(422, "Algún integrante ya no existe.");
      const out = await c.query(
        "UPDATE employees SET team_id=NULL,version=version+1,updated_at=now() WHERE team_id=$1 AND NOT (id=ANY($2::uuid[])) RETURNING id",
        [id.data, wanted],
      );
      for (const r of out.rows) moved.push({ id: r.id, from: id.data, to: null });
      const incoming = await c.query(
        `UPDATE employees e SET team_id=$1,version=e.version+1,updated_at=now()
         FROM (SELECT id,team_id FROM employees WHERE id=ANY($2::uuid[]) AND team_id IS DISTINCT FROM $1 FOR UPDATE) old
         WHERE e.id=old.id RETURNING e.id,old.team_id AS from_team`,
        [id.data, wanted],
      );
      for (const r of incoming.rows) moved.push({ id: r.id, from: r.from_team, to: id.data });
    }

    args.push(id.data);
    await c.query(`UPDATE teams SET ${sets.length ? sets.join(",") + "," : ""}version=version+1,updated_at=now() WHERE id=$${args.length}`, args);

    const after = (await getTeam(c, id.data))!;
    const diff: Record<string, unknown> = diffOf(before, after, [...FIELDS]);
    if (JSON.stringify([...before.member_ids].sort()) !== JSON.stringify([...after.member_ids].sort()))
      diff.member_ids = [before.member_ids, after.member_ids];
    await audit(c, req.user!.id, "team.update", "team", id.data, diff);
    for (const m of moved) await audit(c, req.user!.id, "employee.update", "employee", m.id, { team_id: [m.from, m.to] });
    return after;
  });
  publishChange("team.update");
  res.json(updated);
});
