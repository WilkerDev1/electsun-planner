import { Router } from "express";
import type { PoolClient } from "pg";
import { z } from "zod";
import { pool, transaction, httpError, type Db } from "../db.js";
import { admin, authenticated, hash, token } from "../auth.js";
import { audit } from "../audit.js";
import { publishChange } from "../events.js";
import { permsOf } from "../roles.js";
import { serverToday } from "../today.js";
import { id } from "../../shared/contracts/common.js";
import { CreateLinkBody, LINK_KINDS, type AccessLink, type LinkKind, type LinkSecret } from "../../shared/contracts/access.js";

// F1·A — Enlaces de TV y móvil (ACC-01..03, ACC-06, ACC-07). Solo administración (ROL-02).
// El token solo se guarda como hash(); la ruta con el token se devuelve una única vez.
export const accessLinks = Router();
accessLinks.use(authenticated, admin);

const LINK_SELECT = `SELECT l.id,l.kind,l.name,l.employee_id,e.name AS employee_name,l.active,l.last_seen_at,l.created_at
  FROM access_links l LEFT JOIN employees e ON e.id=l.employee_id`;

async function getLink(db: Db, linkId: string): Promise<AccessLink> {
  return (await db.query(`${LINK_SELECT} WHERE l.id=$1`, [linkId])).rows[0];
}

/** El enlace móvil solo existe para empleados activos (ACC-06) con algún nivel vigente que permita el móvil (NIV-01). Bloquea la fila. */
async function requireActiveEmployee(c: PoolClient, employeeId: string) {
  const e = (await c.query("SELECT name,state FROM employees WHERE id=$1 FOR UPDATE", [employeeId])).rows[0] as
    | { name: string; state: string }
    | undefined;
  if (!e) throw httpError(404, "El empleado no existe.");
  if (e.state !== "Activo") throw httpError(422, "Solo se puede dar acceso móvil a un empleado activo.");
  if (!(await permsOf(c, employeeId, serverToday())).can_use_mobile)
    throw httpError(422, `El nivel de ${e.name} no tiene acceso móvil. Cámbialo en Ajustes o en su ficha.`);
  return e;
}

const pathFor = (kind: LinkKind, linkId: string, t: string) => (kind === "tv" ? `/tv/${linkId}#${t}` : `/m/activar#${linkId}.${t}`);

accessLinks.get("/", async (req, res) => {
  const kind = z.enum(LINK_KINDS).optional().parse(req.query.kind);
  const r = await pool.query(`${LINK_SELECT} ${kind ? "WHERE l.kind=$1" : ""} ORDER BY l.created_at, l.name`, kind ? [kind] : []);
  res.json(r.rows as AccessLink[]);
});

/** Crea un enlace de TV, o el enlace móvil de un empleado (si ya tiene uno, lo rota). */
accessLinks.post("/", async (req, res) => {
  const b = CreateLinkBody.parse(req.body);
  const t = token();
  const result = await transaction(async (c) => {
    if (b.kind === "tv") {
      const linkId = (
        await c.query(
          "INSERT INTO access_links(id,kind,name,active,token_hash,created_by) VALUES(gen_random_uuid(),'tv',$1,true,$2,$3) RETURNING id",
          [b.name, hash(t), req.user!.id],
        )
      ).rows[0].id as string;
      await audit(c, req.user!.id, "link.create", "access_link", linkId, { kind: [null, "tv"], name: [null, b.name] });
      return { linkId, kind: "tv" as const, rotated: false };
    }
    const emp = await requireActiveEmployee(c, b.employee_id);
    const existing = (await c.query("SELECT id,name FROM access_links WHERE employee_id=$1 AND kind='mobile' FOR UPDATE", [b.employee_id]))
      .rows[0] as { id: string; name: string } | undefined;
    if (existing) {
      const name = b.name ?? existing.name;
      await c.query("UPDATE access_links SET name=$1,active=true,token_hash=$2 WHERE id=$3", [name, hash(t), existing.id]);
      await c.query("DELETE FROM device_sessions WHERE link_id=$1", [existing.id]);
      await audit(c, req.user!.id, "link.rotate", "access_link", existing.id, { employee_id: [b.employee_id, b.employee_id] });
      return { linkId: existing.id, kind: "mobile" as const, rotated: true };
    }
    const name = b.name ?? emp.name;
    const linkId = (
      await c.query(
        "INSERT INTO access_links(id,kind,name,employee_id,active,token_hash,created_by) VALUES(gen_random_uuid(),'mobile',$1,$2,true,$3,$4) RETURNING id",
        [name, b.employee_id, hash(t), req.user!.id],
      )
    ).rows[0].id as string;
    await audit(c, req.user!.id, "link.create", "access_link", linkId, {
      kind: [null, "mobile"],
      name: [null, name],
      employee_id: [null, b.employee_id],
    });
    return { linkId, kind: "mobile" as const, rotated: false };
  });
  if (result.rotated) publishChange("link.rotate");
  const body: LinkSecret = { link: await getLink(pool, result.linkId), path: pathFor(result.kind, result.linkId, t) };
  res.status(result.rotated ? 200 : 201).json(body);
});

/** Token nuevo: el anterior y las sesiones de los dispositivos dejan de valer (ACC-02). */
accessLinks.post("/:id/rotate", async (req, res) => {
  const linkId = id.parse(req.params.id);
  const t = token();
  const kind = await transaction(async (c) => {
    const l = (await c.query("SELECT kind,employee_id FROM access_links WHERE id=$1 FOR UPDATE", [linkId])).rows[0] as
      | { kind: LinkKind; employee_id: string | null }
      | undefined;
    if (!l) throw httpError(404, "El enlace no existe.");
    if (l.employee_id) await requireActiveEmployee(c, l.employee_id);
    await c.query("UPDATE access_links SET active=true,token_hash=$1 WHERE id=$2", [hash(t), linkId]);
    await c.query("DELETE FROM device_sessions WHERE link_id=$1", [linkId]);
    await audit(c, req.user!.id, "link.rotate", "access_link", linkId);
    return l.kind;
  });
  publishChange("link.rotate");
  const body: LinkSecret = { link: await getLink(pool, linkId), path: pathFor(kind, linkId, t) };
  res.json(body);
});

/** Desactiva el enlace y cierra sus sesiones; el dispositivo recibe 403 en su siguiente petición (ACC-03). */
accessLinks.post("/:id/revoke", async (req, res) => {
  const linkId = id.parse(req.params.id);
  await transaction(async (c) => {
    const r = await c.query("UPDATE access_links SET active=false,token_hash=NULL WHERE id=$1 RETURNING id", [linkId]);
    if (!r.rowCount) throw httpError(404, "El enlace no existe.");
    await c.query("DELETE FROM device_sessions WHERE link_id=$1", [linkId]);
    await audit(c, req.user!.id, "link.revoke", "access_link", linkId);
  });
  publishChange("link.revoke");
  res.json(await getLink(pool, linkId));
});
