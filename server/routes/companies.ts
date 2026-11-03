import crypto from "node:crypto";
import express, { Router } from "express";
import { z } from "zod";
import type { PoolClient } from "pg";
import { pool, transaction, httpError } from "../db.js";
import { authenticated, hasAnyAccess } from "../auth.js";
import { sniffImage } from "../image.js";
import { COMPANY_COLUMNS } from "../queries.js";
import { audit, diffOf } from "../audit.js";
import { publishChange } from "../events.js";
import { BRAND, colorDistance } from "../../shared/domain.js";
import { CompanyCreate, CompanyPatch, type Company } from "../../shared/contracts/equipo.js";

// F1·C — Escrituras de empresas (EQP-05, EQP-06) y v0.3: patrón y logotipo (EQP-07, EQP-08)
export const companies = Router();

const FIELDS = ["name", "code", "color", "pattern", "active"] as const;
/** Por debajo de esta distancia RGB dos colores se confunden en el mural (EQP-05). */
const CLOSE = 60;

async function getCompany(c: PoolClient, id: string, lock = false): Promise<Company | undefined> {
  const r = await c.query(
    `SELECT ${COMPANY_COLUMNS} FROM companies c LEFT JOIN company_logos l ON l.company_id=c.id
     WHERE c.id=$1 ${lock ? "FOR UPDATE OF c" : ""}`,
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
    const r = await c.query("INSERT INTO companies(id,name,code,color,pattern) VALUES(gen_random_uuid(),$1,$2,$3,$4) RETURNING id", [b.name, b.code, b.color, b.pattern ?? "solido"]);
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

// ---------- Logotipo (EQP-07) ----------

const MAX_LOGO_BYTES = 300 * 1024;
const MAX_LOGO_SIDE = 2048;

// Cuerpo binario directo (PUT con la imagen tal cual) y no multipart: es un solo archivo, no hay campos que leer y se evita
// el analizador de formularios. El tipo que declara el cliente no se usa; manda lo que dicen los bytes.
const rawBody = express.raw({ type: () => true, limit: MAX_LOGO_BYTES });
const logoBody: express.RequestHandler = (req, res, next) =>
  rawBody(req, res, (err?: unknown) => {
    if ((err as { type?: string } | undefined)?.type === "entity.too.large")
      return next(httpError(413, "El logotipo pesa más de 300 KB. Reduce la imagen e inténtalo de nuevo."));
    next(err);
  });

const companyId = (raw: unknown) => {
  const parsed = z.uuid().safeParse(raw);
  if (!parsed.success) throw httpError(404, "Esa empresa no existe.");
  return parsed.data;
};

companies.put("/:id/logo", authenticated, logoBody, async (req, res) => {
  const id = companyId(req.params.id);
  const data = req.body;
  if (!Buffer.isBuffer(data) || !data.length) throw httpError(422, "Elige una imagen PNG, JPG o WebP.");
  const info = sniffImage(data);
  if (!info) throw httpError(422, "El archivo no es una imagen PNG, JPG o WebP. No se admite SVG.");
  if (!info.width || !info.height) throw httpError(422, "No se pudo leer el tamaño de la imagen.");
  if (info.width > MAX_LOGO_SIDE || info.height > MAX_LOGO_SIDE)
    throw httpError(422, `La imagen mide ${info.width}×${info.height} px. El máximo es ${MAX_LOGO_SIDE}×${MAX_LOGO_SIDE} px.`);
  const sha = crypto.createHash("sha256").update(data).digest("hex");
  const updated = await transaction(async (c) => {
    const before = await getCompany(c, id, true);
    if (!before) throw httpError(404, "Esa empresa no existe.");
    const old = (await c.query("SELECT sha256 FROM company_logos WHERE company_id=$1", [id])).rows[0]?.sha256 ?? null;
    await c.query(
      `INSERT INTO company_logos(company_id,mime,data,sha256) VALUES($1,$2,$3,$4)
       ON CONFLICT (company_id) DO UPDATE SET mime=EXCLUDED.mime,data=EXCLUDED.data,sha256=EXCLUDED.sha256,updated_at=now()`,
      [id, info.mime, data, sha],
    );
    await c.query("UPDATE companies SET updated_at=now() WHERE id=$1", [id]);
    await audit(c, req.user!.id, "company.logo", "company", id, { logo: [old, sha] });
    return (await getCompany(c, id))!;
  });
  publishChange("company.update");
  res.json(updated);
});

companies.delete("/:id/logo", authenticated, async (req, res) => {
  const id = companyId(req.params.id);
  const { updated, changed } = await transaction(async (c) => {
    const before = await getCompany(c, id, true);
    if (!before) throw httpError(404, "Esa empresa no existe.");
    const removed = await c.query("DELETE FROM company_logos WHERE company_id=$1 RETURNING sha256", [id]);
    if (removed.rowCount) {
      await c.query("UPDATE companies SET updated_at=now() WHERE id=$1", [id]);
      await audit(c, req.user!.id, "company.logo", "company", id, { logo: [removed.rows[0].sha256, null] });
    }
    return { updated: (await getCompany(c, id))!, changed: !!removed.rowCount };
  });
  if (changed) publishChange("company.update");
  res.json(updated);
});

// Lo puede leer cualquier pantalla con credencial: cuenta, TV o móvil. El `?v=` de `logo_url` cambia con cada logotipo nuevo,
// así que con él la respuesta no caduca nunca; sin él se revalida con el ETag.
companies.get("/:id/logo", async (req, res) => {
  if (!(await hasAnyAccess(req))) throw httpError(401, "Inicia sesión para continuar.");
  const parsed = z.uuid().safeParse(req.params.id);
  const logo = parsed.success
    ? (await pool.query("SELECT mime,data,sha256 FROM company_logos WHERE company_id=$1", [parsed.data])).rows[0]
    : undefined;
  if (!logo) throw httpError(404, "Esta empresa no tiene logotipo.");
  const etag = `"${logo.sha256}"`;
  res.setHeader("Content-Type", logo.mime);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", "inline");
  res.setHeader("Content-Security-Policy", "default-src 'none'");
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", req.query.v === String(logo.sha256).slice(0, 12) ? "private, max-age=31536000, immutable" : "private, no-cache");
  if (req.get("If-None-Match") === etag) return res.status(304).end();
  res.send(logo.data);
});
