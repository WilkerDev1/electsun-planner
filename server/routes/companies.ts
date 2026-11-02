import { Router } from "express";
import { z } from "zod";
import type { PoolClient } from "pg";
import { transaction, httpError } from "../db.js";
import { authenticated } from "../auth.js";
import { audit, diffOf } from "../audit.js";
import { publishChange } from "../events.js";
import { BRAND, colorDistance } from "../../shared/domain.js";
import { CompanyCreate, CompanyPatch, type Company } from "../../shared/contracts/equipo.js";

// F1·C — Escrituras de empresas (EQP-05, EQP-06)
export const companies = Router();

const FIELDS = ["name", "code", "color", "active"] as const;
/** Por debajo de esta distancia RGB dos colores se confunden en el mural (EQP-05). */
const CLOSE = 60;

async function getCompany(c: PoolClient, id: string, lock = false): Promise<Company | undefined> {
  const r = await c.query(
    `SELECT c.id,c.name,c.code,c.color,c.active,c.version,
      (SELECT count(*)::int FROM projects p WHERE p.company_id=c.id AND NOT p.archived) AS project_count
     FROM companies c WHERE c.id=$1 ${lock ? "FOR UPDATE OF c" : ""}`,
    [id],
  );
  return r.rows[0];
}

/** Avisos de color (no bloquean): cerca del naranja de la marca o de otra empresa (EQP-05, VAL-10). */
async function colorWarnings(c: PoolClient, color: string, selfId?: string): Promise<string[]> {
  const out: string[] = [];
  if (colorDistance(color, BRAND) < CLOSE)
    out.push("Ese color se parece al naranja de la marca, que el mural reserva para «hoy». Elige otro para distinguirlo.");
  const others = await c.query("SELECT name,color FROM companies WHERE ($1::uuid IS NULL OR id<>$1)", [selfId ?? null]);
  for (const o of others.rows)
    if (colorDistance(color, o.color) < CLOSE) out.push(`Ese color se parece al de ${o.name}; cuesta distinguirlas en el mural.`);
  return out;
}

async function assertUnique(c: PoolClient, f: { name?: string; code?: string }, exceptId?: string) {
  if (f.name !== undefined) {
    const r = await c.query("SELECT 1 FROM companies WHERE lower(name)=lower($1) AND ($2::uuid IS NULL OR id<>$2)", [f.name, exceptId ?? null]);
    if (r.rowCount) throw httpError(409, `Ya existe una empresa llamada ${f.name}.`);
  }
  if (f.code !== undefined) {
    const r = await c.query("SELECT name FROM companies WHERE code=$1 AND ($2::uuid IS NULL OR id<>$2)", [f.code, exceptId ?? null]);
    if (r.rowCount) throw httpError(409, `La sigla ${f.code} ya la usa ${r.rows[0].name}.`);
  }
}

companies.post("/", authenticated, async (req, res) => {
  const b = CompanyCreate.parse(req.body);
  b.color = b.color.toUpperCase();
  const { created, warnings } = await transaction(async (c) => {
    await assertUnique(c, b);
    const warnings = await colorWarnings(c, b.color);
    const r = await c.query("INSERT INTO companies(id,name,code,color) VALUES(gen_random_uuid(),$1,$2,$3) RETURNING id", [b.name, b.code, b.color]);
    const company = (await getCompany(c, r.rows[0].id))!;
    await audit(c, req.user!.id, "company.create", "company", company.id, diffOf(null, company, [...FIELDS]));
    return { created: company, warnings };
  });
  publishChange("company.create");
  res.status(201).json({ ...created, warnings });
});

companies.patch("/:id", authenticated, async (req, res) => {
  const id = z.uuid().safeParse(req.params.id);
  if (!id.success) throw httpError(404, "Esa empresa no existe.");
  const { version, ...changes } = CompanyPatch.parse(req.body);
  if (changes.color) changes.color = changes.color.toUpperCase();
  const { updated, warnings } = await transaction(async (c) => {
    const before = await getCompany(c, id.data, true);
    if (!before) throw httpError(404, "Esa empresa no existe.");
    if (before.version !== version)
      throw httpError(409, "Otra persona cambió esta empresa. Se recargó; revisa y vuelve a intentar.");

    await assertUnique(c, { name: changes.name !== before.name ? changes.name : undefined, code: changes.code !== before.code ? changes.code : undefined }, id.data);

    // EQP-06: con proyectos sin archivar no se puede desactivar.
    if (changes.active === false && before.active && before.project_count > 0)
      throw httpError(
        422,
        `${before.name} tiene ${before.project_count === 1 ? "un proyecto" : `${before.project_count} proyectos`} sin archivar. Archívalos o cámbialos de empresa antes de desactivarla.`,
      );

    const warnings = changes.color !== undefined ? await colorWarnings(c, changes.color, id.data) : [];

    const sets: string[] = [];
    const args: unknown[] = [];
    for (const f of FIELDS) {
      if (changes[f] === undefined) continue;
      args.push(changes[f]);
      sets.push(`${f}=$${args.length}`);
    }
    args.push(id.data);
    await c.query(`UPDATE companies SET ${sets.length ? sets.join(",") + "," : ""}version=version+1,updated_at=now() WHERE id=$${args.length}`, args);
    const after = (await getCompany(c, id.data))!;
    await audit(c, req.user!.id, "company.update", "company", id.data, diffOf(before, after, [...FIELDS]));
    return { updated: after, warnings };
  });
  publishChange("company.update");
  res.json({ ...updated, warnings });
});
