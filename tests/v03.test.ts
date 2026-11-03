// v0.3 — Base: estados que se borran (EST-05), logotipo y patrón de empresa (EQP-07, EQP-08), catálogo de preparación
// (PRY-12, CAL-07, VAL-07), archivado en bloque (PRY-10), Excel con columnas de preparación (XLS-05, XLS-07) y migración 002.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ExcelJS from "exceljs";
import pg from "pg";
import { setup, endPool, cookieFrom, pool, type Ctx } from "./helpers.js";
import { sniffImage } from "../server/image.js";
import { currentVersion } from "../server/events.js";
import type { Project, ProjectResponse, ImportReport, ArchiveBulkResult } from "../shared/contracts/projects.js";
import type { Status, StatusDeleted } from "../shared/contracts/statuses.js";
import type { Company } from "../shared/contracts/equipo.js";
import type { PrepItem, PrepItemDeleted } from "../shared/contracts/prep.js";
import type { MuralView } from "../shared/contracts/mural.js";
import type { MovilView } from "../shared/contracts/movil.js";

let ctx: Ctx;
before(async () => {
  ctx = await setup();
});
after(async () => {
  await ctx.close();
  await endPool();
});

const get = async <T>(path: string, cookie = ctx.admin) => (await ctx.request<T>(path, "GET", undefined, cookie)).data;
const projects = (archived: "" | "1" | "only" = "1") => get<Project[]>("/projects" + (archived ? `?archived=${archived}` : ""));
const project = async (name: string) => {
  const p = (await projects()).find((x) => x.name === name);
  assert.ok(p, `proyecto de la demo: ${name}`);
  return p;
};
const statusByName = async (name: string) => (await get<Status[]>("/statuses")).find((s) => s.name === name)!;
const prepByCode = async (code: string) => (await get<PrepItem[]>("/prep-items")).find((i) => i.code === code)!;
const company = async (name: string) => (await get<Company[]>("/companies")).find((c) => c.name === name)!;
const auditActions = async (entity: string, id?: string) =>
  (await pool.query("SELECT action FROM audit WHERE entity=$1" + (id ? " AND entity_id=$2" : "") + " ORDER BY id", id ? [entity, id] : [entity])).rows.map((r) => r.action as string);

// ---------- EST-05 · borrar estados ----------

const newStatus = (name: string, kind: string) =>
  ctx.request<Status>("/statuses", "POST", { name, kind, fg: "#3538CD", bg: "#EEF0FE", dot: "#6172F3" }, ctx.admin);

test("GET /statuses trae project_count con los archivados incluidos (EST-05)", async () => {
  const before = await statusByName("Programado");
  const all = await projects();
  assert.equal(before.project_count, all.filter((p) => p.status_id === before.id).length);
  const target = all.find((p) => p.status_id === before.id)!;
  await ctx.request(`/projects/${target.id}/archive`, "POST", { version: target.version }, ctx.office);
  assert.equal((await statusByName("Programado")).project_count, before.project_count); // archivado sigue contando
  await ctx.request(`/projects/${target.id}/unarchive`, "POST", {}, ctx.office);
});

test("borrar un estado sin proyectos: solo el administrador, con versión y en el historial (EST-05)", async () => {
  const events = currentVersion();
  const temp = await newStatus("Provisional", "programado");
  assert.equal(temp.status, 201);
  assert.equal(temp.data.project_count, 0);

  assert.equal((await ctx.request(`/statuses/${temp.data.id}`, "DELETE", { version: temp.data.version })).status, 401);
  assert.equal((await ctx.request(`/statuses/${temp.data.id}`, "DELETE", { version: temp.data.version }, ctx.office)).status, 403);
  assert.equal((await ctx.request(`/statuses/${temp.data.id}`, "DELETE", {}, ctx.admin)).status, 422); // falta la versión
  assert.equal((await ctx.request(`/statuses/${temp.data.id}`, "DELETE", { version: temp.data.version + 5 }, ctx.admin)).status, 409);
  assert.equal((await ctx.request(`/statuses/00000000-0000-4000-8000-000000000000`, "DELETE", { version: 1 }, ctx.admin)).status, 404);

  const done = await ctx.request<StatusDeleted>(`/statuses/${temp.data.id}`, "DELETE", { version: temp.data.version }, ctx.admin);
  assert.equal(done.status, 200);
  assert.deepEqual(done.data, { deleted_id: temp.data.id, moved_projects: 0 });
  assert.ok(currentVersion() > events);
  assert.ok(!(await get<Status[]>("/statuses")).some((s) => s.name === "Provisional"));
  assert.ok((await auditActions("status", temp.data.id)).includes("status.delete"));
});

test("con proyectos hace falta un reemplazo; los proyectos pasan en la misma transacción, con historial y versión (EST-05)", async () => {
  const temp = (await newStatus("Provisional", "programado")).data;
  const carla = await project("Carla Méndez");
  const tomas = await project("Tomás Rivera");
  for (const p of [carla, tomas]) {
    const r = await ctx.request<ProjectResponse>(`/projects/${p.id}`, "PATCH", { version: p.version, status_id: temp.id }, ctx.office);
    assert.equal(r.status, 200);
  }
  // Uno de ellos archivado: también cuenta.
  const tomasNow = await project("Tomás Rivera");
  await ctx.request(`/projects/${tomasNow.id}/archive`, "POST", { version: tomasNow.version }, ctx.office);
  const fresh = await statusByName("Provisional");
  assert.equal(fresh.project_count, 2);

  const programado = await statusByName("Programado");
  const noReplacement = await ctx.request<{ message: string }>(`/statuses/${temp.id}`, "DELETE", { version: fresh.version }, ctx.admin);
  assert.equal(noReplacement.status, 422);
  assert.match(noReplacement.data.message, /2 proyectos usan/);
  assert.equal((await ctx.request(`/statuses/${temp.id}`, "DELETE", { version: fresh.version, replacement_id: temp.id }, ctx.admin)).status, 422); // a sí mismo
  assert.equal((await ctx.request(`/statuses/${temp.id}`, "DELETE", { version: fresh.version, replacement_id: "00000000-0000-4000-8000-000000000000" }, ctx.admin)).status, 422);
  assert.equal((await statusByName("Provisional")).project_count, 2); // nada cambió

  const before = { carla: await project("Carla Méndez"), tomas: await project("Tomás Rivera") };
  const auditBefore = (await auditActions("project", before.carla.id)).length;
  const done = await ctx.request<StatusDeleted>(`/statuses/${temp.id}`, "DELETE", { version: fresh.version, replacement_id: programado.id }, ctx.admin);
  assert.equal(done.status, 200);
  assert.equal(done.data.moved_projects, 2);
  const after = { carla: await project("Carla Méndez"), tomas: await project("Tomás Rivera") };
  for (const k of ["carla", "tomas"] as const) {
    assert.equal(after[k].status_id, programado.id);
    assert.equal(after[k].version, before[k].version + 1);
  }
  assert.equal((await auditActions("project", before.carla.id)).length, auditBefore + 1);
  const history = await get<{ action: string; diff: Record<string, unknown[]> }[]>(`/projects/${before.carla.id}/history`);
  assert.deepEqual(history[0].diff.status_id, [temp.id, programado.id]);
  await ctx.request(`/projects/${after.tomas.id}/unarchive`, "POST", {}, ctx.office);
});

test("no se borra el último estado de su tipo (EST-05)", async () => {
  const meter = await statusByName("Esperando medidor");
  const r = await ctx.request<{ message: string }>(`/statuses/${meter.id}`, "DELETE", { version: meter.version, replacement_id: (await statusByName("Terminado")).id }, ctx.admin);
  assert.equal(r.status, 409);
  assert.match(r.data.message, /único estado de tipo Post-obra/);
  assert.ok(await statusByName("Esperando medidor"));
  assert.equal((await project("Dulcería Mirabal")).status_id, meter.id);
});

test("pasar proyectos a un estado de otro tipo respeta las reglas del estado nuevo (EST-05, VAL-01)", async () => {
  const spare = (await newStatus("Espera de cliente", "por_programar")).data;
  const kevin = await project("Kevin Almánzar");
  const porProgramar = await statusByName("Por programar");
  assert.equal((await ctx.request(`/projects/${kevin.id}`, "PATCH", { version: kevin.version, status_id: spare.id }, ctx.office)).status, 200);
  const spareNow = await statusByName("Espera de cliente");
  // Kevin no tiene fechas ni equipo: no puede pasar a «Programado».
  const bad = await ctx.request<{ message: string }>(`/statuses/${spare.id}`, "DELETE", { version: spareNow.version, replacement_id: (await statusByName("Programado")).id }, ctx.admin);
  assert.equal(bad.status, 422);
  assert.match(bad.data.message, /Kevin Almánzar/);
  assert.equal((await project("Kevin Almánzar")).status_id, spare.id);
  const ok = await ctx.request<StatusDeleted>(`/statuses/${spare.id}`, "DELETE", { version: spareNow.version, replacement_id: porProgramar.id }, ctx.admin);
  assert.equal(ok.status, 200);
  assert.equal((await project("Kevin Almánzar")).status_id, porProgramar.id);
});

test("crear estados: nombre repetido sin importar mayúsculas (EST-05)", async () => {
  const a = await newStatus("Visita técnica", "por_programar");
  assert.equal(a.status, 201);
  const dup = await newStatus("visita TÉCNICA".replace("É", "é"), "por_programar");
  assert.equal(dup.status, 409);
  assert.match((dup.data as unknown as { message: string }).message, /Ya existe un estado/);
  await ctx.request(`/statuses/${a.data.id}`, "DELETE", { version: a.data.version }, ctx.admin);
});

// ---------- EQP-08 · patrón ----------

test("patrón de la empresa: catálogo cerrado, valor por defecto y cambio (EQP-08)", async () => {
  const created = await ctx.request<Company>("/companies", "POST", { name: "Prueba Patrón", code: "PP", color: "#336699" }, ctx.office);
  assert.equal(created.status, 201);
  assert.equal(created.data.pattern, "solido");
  assert.equal(created.data.logo_url, null);
  assert.equal((await ctx.request("/companies", "POST", { name: "Otra", code: "OT", color: "#336699", pattern: "estrellas" }, ctx.office)).status, 422);
  const patched = await ctx.request<Company>(`/companies/${created.data.id}`, "PATCH", { version: created.data.version, pattern: "zigzag" }, ctx.office);
  assert.equal(patched.status, 200);
  assert.equal(patched.data.pattern, "zigzag");
  assert.equal((await ctx.request(`/companies/${created.data.id}`, "PATCH", { version: patched.data.version, pattern: "no" }, ctx.office)).status, 422);
  assert.equal((await company("Compusol")).pattern, "rayas");
  await pool.query("DELETE FROM companies WHERE id=$1", [created.data.id]);
});

// ---------- EQP-07 · logotipo ----------

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
/** PNG con el tamaño dicho en la cabecera (el resto no importa: el servidor solo lee la cabecera). */
const pngOf = (w: number, h: number) => {
  const b = Buffer.from(PNG_1X1);
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
};
const jpegOf = (w: number, h: number) =>
  Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]),
    Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]),
    Buffer.from([0xff, 0xd9]),
  ]);
const webpXOf = (w: number, h: number) => {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0, "latin1");
  b.writeUInt32LE(22, 4);
  b.write("WEBPVP8X", 8, "latin1");
  b.writeUInt32LE(10, 16);
  b.writeUIntLE(w - 1, 24, 3);
  b.writeUIntLE(h - 1, 27, 3);
  return b;
};
const webpLOf = (w: number, h: number) => {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0, "latin1");
  b.write("WEBPVP8L", 8, "latin1");
  b[20] = 0x2f;
  b.writeUInt32LE(((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14), 21);
  return b;
};
const webpOf = (w: number, h: number) => {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0, "latin1");
  b.write("WEBPVP8 ", 8, "latin1");
  b.set([0x9d, 0x01, 0x2a], 23);
  b.writeUInt16LE(w, 26);
  b.writeUInt16LE(h, 28);
  return b;
};

/** Sube el logotipo tal cual (cuerpo binario) con el origen de la app. */
async function putLogo(id: string, body: Buffer | string, cookie = ctx.office, type = "image/png") {
  const r = await fetch(`${ctx.base}/api/companies/${id}/logo`, {
    method: "PUT",
    headers: { Origin: process.env.APP_ORIGIN!, "Content-Type": type, ...(cookie ? { Cookie: cookie } : {}) },
    body: body as BodyInit,
  });
  const json = (r.headers.get("content-type") ?? "").includes("json") ? await r.json() : null;
  return { status: r.status, data: json as Company & { message: string } };
}
const getLogo = (url: string, cookie = "", extra: Record<string, string> = {}) =>
  fetch(ctx.base + url, { headers: { ...(cookie ? { Cookie: cookie } : {}), ...extra } });

test("reconocimiento de imágenes por bytes (EQP-07)", () => {
  assert.deepEqual(sniffImage(PNG_1X1), { mime: "image/png", width: 1, height: 1 });
  assert.deepEqual(sniffImage(pngOf(640, 480)), { mime: "image/png", width: 640, height: 480 });
  assert.deepEqual(sniffImage(jpegOf(800, 600)), { mime: "image/jpeg", width: 800, height: 600 });
  assert.deepEqual(sniffImage(webpXOf(300, 200)), { mime: "image/webp", width: 300, height: 200 });
  assert.deepEqual(sniffImage(webpLOf(120, 90)), { mime: "image/webp", width: 120, height: 90 });
  assert.deepEqual(sniffImage(webpOf(64, 32)), { mime: "image/webp", width: 64, height: 32 });
  assert.equal(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')), null);
  assert.equal(sniffImage(Buffer.from("<html><script>alert(1)</script></html>")), null);
  assert.equal(sniffImage(Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00\x00;")), null);
  assert.equal(sniffImage(Buffer.alloc(0)), null);
  assert.equal(sniffImage(Buffer.from([0xff, 0xd8, 0xff])), null); // JPEG cortado
});

test("logotipo: sube PNG, JPEG y WebP; rechaza SVG, archivos disfrazados y tamaños de más (EQP-07)", async () => {
  const c = await company("Evolta");
  assert.equal(c.logo_url, null);

  assert.equal((await putLogo(c.id, PNG_1X1, "")).status, 401);
  const ok = await putLogo(c.id, PNG_1X1);
  assert.equal(ok.status, 200);
  assert.match(ok.data.logo_url ?? "", new RegExp(`^/api/companies/${c.id}/logo\\?v=[0-9a-f]{12}$`));
  assert.equal(ok.data.version, c.version); // el logotipo no cambia la versión de los datos
  assert.ok((await auditActions("company", c.id)).includes("company.logo"));
  assert.equal((await company("Evolta")).logo_url, ok.data.logo_url);

  // Otras imágenes válidas sustituyen a la anterior y cambian el ?v=
  const jpg = await putLogo(c.id, jpegOf(2048, 2048));
  assert.equal(jpg.status, 200);
  assert.notEqual(jpg.data.logo_url, ok.data.logo_url);
  assert.equal((await putLogo(c.id, webpXOf(200, 100))).status, 200);
  assert.equal((await putLogo(c.id, webpLOf(200, 100))).status, 200);
  assert.equal((await putLogo(c.id, webpOf(200, 100))).status, 200);

  // SVG, aunque diga ser PNG
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
  const rejectedSvg = await putLogo(c.id, svg, ctx.office, "image/svg+xml");
  assert.equal(rejectedSvg.status, 422);
  assert.match(rejectedSvg.data.message, /No se admite SVG/);
  // Archivo disfrazado: el Content-Type dice PNG, el contenido es HTML
  assert.equal((await putLogo(c.id, "<html><body>hola</body></html>", ctx.office, "image/png")).status, 422);
  // Cabecera de PNG sin IHDR
  assert.equal((await putLogo(c.id, Buffer.concat([PNG_1X1.subarray(0, 8), Buffer.alloc(40)]))).status, 422);
  // Vacío
  assert.equal((await putLogo(c.id, Buffer.alloc(0))).status, 422);
  // Tamaño: 2049 px de lado
  const big = await putLogo(c.id, pngOf(2049, 100));
  assert.equal(big.status, 422);
  assert.match(big.data.message, /2049×100/);
  assert.equal((await putLogo(c.id, jpegOf(100, 4000))).status, 422);
  assert.equal((await putLogo(c.id, pngOf(0, 10))).status, 422);
  // Peso: más de 300 KB
  const heavy = await putLogo(c.id, Buffer.concat([PNG_1X1, Buffer.alloc(301 * 1024)]));
  assert.equal(heavy.status, 413);
  assert.match(heavy.data.message, /300 KB/);
  // Empresa que no existe
  assert.equal((await putLogo("00000000-0000-4000-8000-000000000000", PNG_1X1)).status, 404);
  assert.equal((await putLogo("no-es-un-id", PNG_1X1)).status, 404);
  // Los rechazos no tocaron el logotipo guardado
  assert.match((await company("Evolta")).logo_url ?? "", /logo\?v=/);

  const removed = await ctx.request<Company>(`/companies/${c.id}/logo`, "DELETE", undefined, ctx.office);
  assert.equal(removed.status, 200);
  assert.equal(removed.data.logo_url, null);
  assert.equal((await ctx.request(`/companies/${c.id}/logo`, "DELETE")).status, 401);
});

test("logotipo: lo lee cualquier credencial con las cabeceras seguras, y se cachea por ?v= (EQP-07)", async () => {
  const c = await company("Electsun");
  const up = await putLogo(c.id, PNG_1X1);
  const url = up.data.logo_url!;

  // Sin sesión: 401. Con cookies de otra cosa o inventadas: también.
  assert.equal((await getLogo(url)).status, 401);
  assert.equal((await getLogo(url, "planner_m=inventada")).status, 401);
  assert.equal((await getLogo(url, "planner_tv_00000000-0000-4000-8000-000000000000=inventada")).status, 401);

  const asUser = await getLogo(url, ctx.office);
  assert.equal(asUser.status, 200);
  assert.equal(asUser.headers.get("content-type"), "image/png");
  assert.equal(asUser.headers.get("x-content-type-options"), "nosniff");
  assert.equal(asUser.headers.get("content-disposition"), "inline");
  assert.equal(asUser.headers.get("content-security-policy"), "default-src 'none'");
  assert.equal(asUser.headers.get("cache-control"), "private, max-age=31536000, immutable");
  assert.deepEqual(Buffer.from(await asUser.arrayBuffer()), PNG_1X1);
  const etag = asUser.headers.get("etag")!;
  assert.match(etag, /^"[0-9a-f]{64}"$/);
  assert.equal((await getLogo(url, ctx.office, { "If-None-Match": etag })).status, 304);

  // Sin ?v= se revalida con el ETag, no se fija para siempre.
  const bare = await getLogo(url.split("?")[0], ctx.office);
  assert.equal(bare.status, 200);
  assert.equal(bare.headers.get("cache-control"), "private, no-cache");

  // TV
  const tvLink = await ctx.request<{ link: { id: string }; path: string }>("/access-links", "POST", { kind: "tv", name: "TV logos" }, ctx.admin);
  const tvRedeem = await ctx.request("/access/session", "POST", { token: tvLink.data.path.split("#")[1], id: tvLink.data.link.id });
  const tv = cookieFrom(tvRedeem.headers, `planner_tv_${tvLink.data.link.id}`);
  assert.equal((await getLogo(url, tv)).status, 200);

  // Móvil
  const emp = (await get<{ id: string; name: string }[]>("/employees")).find((e) => e.name === "Luis Peña")!;
  const mLink = await ctx.request<{ link: { id: string }; path: string }>("/access-links", "POST", { kind: "mobile", employee_id: emp.id }, ctx.admin);
  const mRedeem = await ctx.request("/access/session", "POST", { token: mLink.data.path.split("#")[1] });
  const mobile = cookieFrom(mRedeem.headers, "planner_m");
  assert.equal((await getLogo(url, mobile)).status, 200);

  // La vista del mural y la del móvil traen el logotipo y el patrón de cada empresa.
  const mural = await get<MuralView>(`/view/mural?link=${tvLink.data.link.id}`, tv);
  assert.equal(mural.companies.find((x) => x.id === c.id)!.logo_url, url);
  assert.equal(mural.companies.find((x) => x.name === "Compusol")!.pattern, "rayas");
  const rowsOfCompany = mural.model.active.rows.filter((r) => r.company.name === "Electsun");
  assert.ok(rowsOfCompany.length > 0);
  assert.ok(rowsOfCompany.every((r) => r.company.logo_url === url && r.company.pattern === "solido" && r.company.color === "#0EA5E9"));
  const movil = await get<MovilView>("/view/movil", mobile);
  const motormax = Object.values(movil.detail).find((d) => d.company.name === "Electsun")!;
  assert.equal(motormax.company.logo_url, url);
  assert.equal(motormax.company.pattern, "solido");

  // Un enlace revocado deja de poder leer el logotipo.
  await ctx.request(`/access-links/${tvLink.data.link.id}/revoke`, "POST", undefined, ctx.admin);
  assert.equal((await getLogo(url, tv)).status, 401);

  // Sin logotipo: 404. Con la empresa borrada, el logotipo se va con ella (ON DELETE CASCADE).
  await ctx.request(`/companies/${c.id}/logo`, "DELETE", undefined, ctx.office);
  assert.equal((await getLogo(url, ctx.office)).status, 404);
  assert.equal((await getLogo(`/api/companies/${c.id}/logo`, ctx.office)).status, 404);
  assert.equal((await getLogo(`/api/companies/no-es-un-id/logo`, ctx.office)).status, 404);

  const temp = await ctx.request<Company>("/companies", "POST", { name: "Temporal", code: "TM", color: "#112233" }, ctx.office);
  await putLogo(temp.data.id, PNG_1X1);
  await pool.query("DELETE FROM companies WHERE id=$1", [temp.data.id]);
  assert.equal((await pool.query("SELECT 1 FROM company_logos WHERE company_id=$1", [temp.data.id])).rowCount, 0);
});

// ---------- PRY-12 · catálogo de preparación ----------

test("catálogo de preparación: lo lee cualquier cuenta, solo el administrador lo cambia (PRY-12)", async () => {
  assert.equal((await ctx.request("/prep-items")).status, 401);
  const list = await get<PrepItem[]>("/prep-items", ctx.office);
  assert.deepEqual(list.map((i) => i.code), ["PL", "MA", "EDE", "PM"]);
  const ede = list.find((i) => i.code === "EDE")!;
  assert.deepEqual([ede.applies_to, ede.default_on, ede.pending_label], ["neta", true, "EDE"]);
  assert.equal(list.find((i) => i.code === "PL")!.project_count, 17); // los 18 proyectos de la demo menos Villa Serena, que no lleva preparación
  const body = { code: "px", name: "Prueba extra", pending_label: "espera prueba", applies_to: "hibrido", default_on: false };
  assert.equal((await ctx.request("/prep-items", "POST", body)).status, 401);
  assert.equal((await ctx.request("/prep-items", "POST", body, ctx.office)).status, 403);
  assert.equal((await ctx.request(`/prep-items/${ede.id}`, "PATCH", { version: ede.version, name: "X" }, ctx.office)).status, 403);
  assert.equal((await ctx.request(`/prep-items/${ede.id}`, "DELETE", { version: ede.version }, ctx.office)).status, 403);
});

test("catálogo de preparación: agregar, renombrar y quitar con validación, historial y cascada (PRY-12)", async () => {
  const events = currentVersion();
  const body = { code: "px", name: "Prueba extra", pending_label: "espera prueba", applies_to: "hibrido", default_on: false };
  const created = await ctx.request<PrepItem>("/prep-items", "POST", body, ctx.admin);
  assert.equal(created.status, 201);
  assert.deepEqual([created.data.code, created.data.sort, created.data.project_count], ["PX", 5, 0]);
  assert.ok(currentVersion() > events);

  // Validaciones
  assert.equal((await ctx.request("/prep-items", "POST", { ...body, code: "CODIGO" }, ctx.admin)).status, 422);
  assert.equal((await ctx.request("/prep-items", "POST", { ...body, code: "a-b" }, ctx.admin)).status, 422);
  assert.equal((await ctx.request("/prep-items", "POST", { ...body, name: "" }, ctx.admin)).status, 422);
  assert.equal((await ctx.request("/prep-items", "POST", { ...body, pending_label: "x".repeat(41) }, ctx.admin)).status, 422);
  assert.equal((await ctx.request("/prep-items", "POST", { ...body, applies_to: "otro" }, ctx.admin)).status, 422);
  const dupCode = await ctx.request<{ message: string }>("/prep-items", "POST", { ...body, name: "Otro nombre" }, ctx.admin);
  assert.equal(dupCode.status, 409);
  assert.match(dupCode.data.message, /código PX/);
  assert.equal((await ctx.request("/prep-items", "POST", { ...body, code: "PY", name: "prueba EXTRA" }, ctx.admin)).status, 409); // nombre repetido

  // Renombrar
  const renamed = await ctx.request<PrepItem>(`/prep-items/${created.data.id}`, "PATCH", { version: created.data.version, name: "Prueba renombrada", pending_label: "falta prueba", applies_to: "todos", default_on: true }, ctx.admin);
  assert.equal(renamed.status, 200);
  assert.deepEqual([renamed.data.name, renamed.data.applies_to, renamed.data.default_on, renamed.data.version], ["Prueba renombrada", "todos", true, 2]);
  assert.equal((await ctx.request(`/prep-items/${created.data.id}`, "PATCH", { version: 1, name: "Viejo" }, ctx.admin)).status, 409);
  assert.equal((await ctx.request(`/prep-items/${created.data.id}`, "PATCH", { version: 2, applies_to: "nada" }, ctx.admin)).status, 422);
  assert.equal((await ctx.request(`/prep-items/no-es-un-id`, "PATCH", { version: 1 }, ctx.admin)).status, 404);

  // Un proyecto nuevo recibe los ítems «por defecto» (ahora también PX), sin hacer
  const fresh = await ctx.request<ProjectResponse>("/projects", "POST", { company_id: (await company("Evolta")).id, name: "Con defaults" }, ctx.office);
  assert.equal(fresh.status, 201);
  const cat = await get<PrepItem[]>("/prep-items");
  assert.deepEqual(fresh.data.prep, cat.filter((i) => i.default_on).map((i) => ({ item_id: i.id, done: false })));
  assert.equal(fresh.data.prep.length, 4);
  assert.equal((await prepByCode("PX")).project_count, 1);

  // Quitarlo: cascada, versión nueva del proyecto, historial y aviso
  const events2 = currentVersion();
  const px = await prepByCode("PX");
  assert.equal((await ctx.request(`/prep-items/${px.id}`, "DELETE", { version: 99 }, ctx.admin)).status, 409);
  const del = await ctx.request<PrepItemDeleted>(`/prep-items/${px.id}`, "DELETE", { version: px.version }, ctx.admin);
  assert.equal(del.status, 200);
  assert.deepEqual(del.data, { deleted_id: px.id, project_count: 1 });
  assert.ok(currentVersion() > events2);
  const after = await project("Con defaults");
  assert.equal(after.prep.length, 3);
  assert.equal(after.version, fresh.data.version + 1);
  const history = await get<{ diff: Record<string, [Record<string, boolean>, Record<string, boolean>]> }[]>(`/projects/${after.id}/history`);
  assert.deepEqual(history[0].diff.prep, [{ PL: false, MA: false, EDE: false, PX: false }, { PL: false, MA: false, EDE: false }]);
  assert.deepEqual((await auditActions("prep_item", px.id)), ["prep_item.create", "prep_item.update", "prep_item.delete"]);
  assert.equal((await pool.query("SELECT 1 FROM project_prep WHERE item_id=$1", [px.id])).rowCount, 0);
  assert.equal((await ctx.request(`/prep-items/${px.id}`, "DELETE", { version: px.version }, ctx.admin)).status, 404);
  await ctx.request(`/projects/${after.id}/archive`, "POST", {}, ctx.office);
});

test("el catálogo tiene un máximo de parámetros (PRY-12)", async () => {
  const made: string[] = [];
  try {
    for (let i = (await get<PrepItem[]>("/prep-items")).length; i < 30; i++) {
      const r = await ctx.request<PrepItem>("/prep-items", "POST", { code: `T${i}`, name: `Tope ${i}`, pending_label: "tope" }, ctx.admin);
      assert.equal(r.status, 201);
      made.push(r.data.id);
    }
    const over = await ctx.request<{ message: string }>("/prep-items", "POST", { code: "ZZ", name: "De más", pending_label: "x" }, ctx.admin);
    assert.equal(over.status, 422);
    assert.match(over.data.message, /30 parámetros/);
  } finally {
    await pool.query("DELETE FROM prep_items WHERE id=ANY($1::uuid[])", [made]);
  }
});

// ---------- PRY-12, VAL-07 · preparación en los proyectos ----------

test("prep en proyectos: reemplazo completo, ítems inválidos, sin preparación y avisos con código (PRY-12, VAL-07)", async () => {
  const items = Object.fromEntries((await get<PrepItem[]>("/prep-items")).map((i) => [i.code, i]));
  const lucia = await project("Lucía Esther Gómez Paredes"); // Programado, material pendiente
  assert.deepEqual(lucia.prep.map((e) => e.item_id), [items.PL.id, items.MA.id, items.EDE.id]); // en el orden del catálogo
  const patch = (p: Project, body: Record<string, unknown>) =>
    ctx.request<ProjectResponse & { message: string }>(`/projects/${p.id}`, "PATCH", { version: p.version, ...body }, ctx.office);

  // Aviso con código mientras falta material
  const same = await patch(lucia, { notes: "x" });
  assert.equal(same.status, 200);
  assert.deepEqual(same.data.coded_warnings.map((w) => w.code), ["prep_pendiente"]);
  assert.deepEqual(same.data.warnings, same.data.coded_warnings.map((w) => w.text));
  assert.match(same.data.warnings[0], /Programado con preparación pendiente: falta material\./);

  // Reemplazo completo: queda solo lo enviado (y en el orden del catálogo, aunque llegue desordenado)
  const replaced = await patch(same.data, { prep: [{ item_id: items.PM.id, done: false }, { item_id: items.PL.id, done: true }] });
  assert.equal(replaced.status, 200);
  assert.deepEqual(replaced.data.prep, [{ item_id: items.PL.id, done: true }, { item_id: items.PM.id, done: false }]);
  // El motivo viene de pending_label: «espera permiso» no repite el verbo
  assert.match(replaced.data.warnings.join(" "), /falta permiso\./);
  // Repetir el mismo orden no cuenta como cambio
  const unchanged = await patch(replaced.data, { prep: [{ item_id: items.PM.id, done: false }, { item_id: items.PL.id, done: true }] });
  assert.equal(unchanged.data.version, replaced.data.version);

  // Marcar el permiso como hecho quita el aviso; los avisos nunca bloquean (VAL-10)
  const done = await patch(replaced.data, { prep: [{ item_id: items.PL.id, done: true }, { item_id: items.PM.id, done: true }] });
  assert.deepEqual(done.data.coded_warnings, []);

  // Sin preparación: lista vacía y nada pendiente
  const none = await patch(done.data, { prep: [] });
  assert.equal(none.status, 200);
  assert.deepEqual(none.data.prep, []);
  assert.deepEqual(none.data.coded_warnings, []);

  // Un parámetro que no aplica al tipo no avisa: EDE pendiente en un proyecto híbrido
  const hib = await patch(none.data, { system_type: "hibrido", prep: [{ item_id: items.EDE.id, done: false }] });
  assert.equal(hib.status, 200);
  assert.deepEqual(hib.data.coded_warnings, []);
  const neta = await patch(hib.data, { system_type: "neta" });
  assert.deepEqual(neta.data.coded_warnings.map((w) => w.code), ["prep_pendiente"]);
  assert.match(neta.data.warnings[0], /falta EDE\./);

  // Inválidos
  const unknown = await patch(neta.data, { prep: [{ item_id: "00000000-0000-4000-8000-000000000000", done: true }] });
  assert.equal(unknown.status, 422);
  assert.match(unknown.data.message, /ya no existe/);
  assert.equal((await patch(neta.data, { prep: [{ item_id: items.PL.id, done: true }, { item_id: items.PL.id, done: false }] })).status, 422); // repetido
  assert.equal((await patch(neta.data, { prep: [{ item_id: "no-es-un-id", done: true }] })).status, 422);
  assert.equal((await patch(neta.data, { prep: [{ item_id: items.PL.id }] })).status, 422);
  assert.equal((await patch(neta.data, { prep_plans: true })).status, 200); // campos viejos: se ignoran (zod los descarta)
  assert.equal((await project("Lucía Esther Gómez Paredes")).prep.length, 1);

  // Historial legible por código
  const history = await get<{ diff: Record<string, unknown> }[]>(`/projects/${lucia.id}/history`);
  const withPrep = history.filter((h) => "prep" in h.diff);
  assert.ok(withPrep.length >= 4);
  assert.deepEqual(withPrep.at(-1)!.diff.prep, [{ PL: true, MA: false, EDE: true }, { PL: true, PM: false }]);
});

test("proyecto nuevo: ítems por defecto o la lista que se envíe; PM no es por defecto (PRY-12)", async () => {
  const items = Object.fromEntries((await get<PrepItem[]>("/prep-items")).map((i) => [i.code, i]));
  const evolta = (await company("Evolta")).id;
  const dflt = await ctx.request<ProjectResponse>("/projects", "POST", { company_id: evolta, name: "Nuevo con defaults" }, ctx.office);
  assert.deepEqual(dflt.data.prep, [items.PL, items.MA, items.EDE].map((i) => ({ item_id: i.id, done: false })));
  const explicit = await ctx.request<ProjectResponse>("/projects", "POST", { company_id: evolta, name: "Nuevo con PM", prep: [{ item_id: items.PM.id, done: true }] }, ctx.office);
  assert.deepEqual(explicit.data.prep, [{ item_id: items.PM.id, done: true }]);
  const empty = await ctx.request<ProjectResponse>("/projects", "POST", { company_id: evolta, name: "Nuevo sin preparación", prep: [] }, ctx.office);
  assert.deepEqual(empty.data.prep, []);
  assert.equal((await ctx.request("/projects", "POST", { company_id: evolta, name: "Malo", prep: [{ item_id: "00000000-0000-4000-8000-000000000000", done: false }] }, ctx.office)).status, 422);
  assert.equal((await project("Malo").catch(() => null)), null);
  const history = await get<{ action: string; diff: Record<string, [unknown, Record<string, boolean>]> }[]>(`/projects/${explicit.data.id}/history`);
  assert.deepEqual(history[0].diff.prep, [null, { PM: true }]);
  for (const p of [dflt.data, explicit.data, empty.data]) await ctx.request(`/projects/${p.id}/archive`, "POST", {}, ctx.office);
});

test("la demo trae proyectos sin preparación y uno con el parámetro extra PM (PRY-12)", async () => {
  const pm = await prepByCode("PM");
  const villa = await project("Villa Serena (Mario Abreu)");
  assert.deepEqual(villa.prep, []);
  const motormax = await project("Taller Motormax");
  assert.ok(motormax.prep.some((e) => e.item_id === pm.id && e.done));
  assert.equal(pm.pending_label, "espera permiso");
  const view = await get<MuralView>("/view/mural");
  assert.equal(view.model.waiting.items.find((i) => i.name === "Villa Serena (Mario Abreu)")!.sub, "Lista para programar");
  // El motivo de espera del mural y del móvil sale de pending_label.
  const w = view.model.waiting.items.find((i) => i.name === "Paola Núñez")!;
  assert.equal(w.sub, "Espera material y EDE");
});

test("mural y móvil usan el catálogo editable para el motivo de espera (CAL-07, MOV-05)", async () => {
  const items = Object.fromEntries((await get<PrepItem[]>("/prep-items")).map((i) => [i.code, i]));
  const paola = await project("Paola Núñez");
  const set = await ctx.request<ProjectResponse>(`/projects/${paola.id}`, "PATCH", { version: paola.version, prep: [{ item_id: items.PL.id, done: true }, { item_id: items.PM.id, done: false }] }, ctx.office);
  assert.equal(set.status, 200);
  const view = await get<MuralView>("/view/mural");
  assert.equal(view.model.waiting.items.find((i) => i.name === "Paola Núñez")!.sub, "Espera permiso");
  // Renombrar el motivo se refleja sin tocar los proyectos
  await ctx.request(`/prep-items/${items.PM.id}`, "PATCH", { version: items.PM.version, pending_label: "falta licencia" }, ctx.admin);
  const again = await get<MuralView>("/view/mural");
  assert.equal(again.model.waiting.items.find((i) => i.name === "Paola Núñez")!.sub, "Espera licencia");
  await ctx.request(`/prep-items/${items.PM.id}`, "PATCH", { version: items.PM.version + 1, pending_label: "espera permiso" }, ctx.admin);
});

// ---------- PRY-10 · archivar en bloque ----------

/** Cuántos avisos `change` recibe una pantalla abierta mientras se ejecuta `run` (API-01). */
async function countChanges(run: () => Promise<void>): Promise<number> {
  const stop = new AbortController();
  const res = await fetch(ctx.base + "/api/events", { headers: { Cookie: ctx.admin }, signal: stop.signal });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const pump = (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value);
      }
    } catch {
      /* cerrado a propósito */
    }
  })();
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  while (!text.includes("event: ready")) await wait(10);
  await run();
  await wait(200);
  stop.abort();
  await pump;
  return (text.match(/event: change/g) ?? []).length;
}

test("archivar en bloque: una transacción, historial por proyecto y un solo aviso (PRY-10)", async () => {
  const names = ["Kevin Almánzar", "Oficina Evolta", "Proyecto Elena Cabrera"];
  const ps = await Promise.all(names.map(project));
  const body = { ids: ps.map((p) => p.id), archived: true };
  assert.equal((await ctx.request("/projects/archive-bulk", "POST", body)).status, 401);
  assert.equal((await ctx.request("/projects/archive-bulk", "POST", { ids: [], archived: true }, ctx.office)).status, 422);
  assert.equal((await ctx.request("/projects/archive-bulk", "POST", { ids: ["no-es-un-id"], archived: true }, ctx.office)).status, 422);
  assert.equal((await ctx.request("/projects/archive-bulk", "POST", { ids: Array.from({ length: 201 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`), archived: true }, ctx.office)).status, 422);
  assert.equal((await ctx.request("/projects/archive-bulk", "POST", { ids: ps.map((p) => p.id), archived: "si" }, ctx.office)).status, 422);

  // Un id que no existe cancela todo el lote
  const missing = await ctx.request("/projects/archive-bulk", "POST", { ids: [...body.ids, "00000000-0000-4000-8000-000000000000"], archived: true }, ctx.office);
  assert.equal(missing.status, 404);
  assert.equal((await projects("")).filter((p) => names.includes(p.name)).length, 3);

  const audits0 = await auditActions("project");
  let r!: { status: number; data: ArchiveBulkResult };
  const changes = await countChanges(async () => {
    r = await ctx.request<ArchiveBulkResult>("/projects/archive-bulk", "POST", body, ctx.office);
  });
  assert.equal(r.status, 200);
  assert.equal(changes, 1, "un solo publishChange");
  assert.equal(r.data.changed, 3);
  assert.deepEqual(r.data.projects.map((p) => p.id), body.ids); // en el orden pedido
  assert.ok(r.data.projects.every((p, i) => p.archived && p.version === ps[i].version + 1));
  const audits1 = await auditActions("project");
  assert.deepEqual(audits1.slice(audits0.length), ["project.archive", "project.archive", "project.archive"]);

  // Listados: sin parámetro no salen; ?archived=only solo los archivados; ?archived=1 todos
  assert.ok(!(await projects("")).some((p) => names.includes(p.name)));
  const mine = async () => (await projects("only")).map((p) => p.name).filter((n) => names.includes(n)).sort();
  assert.deepEqual(await mine(), [...names].sort());
  assert.ok((await projects("only")).every((p) => p.archived));
  assert.equal((await projects("1")).length, (await projects("")).length + (await projects("only")).length);

  // Repetirlo no cambia nada ni avisa; duplicados en la lista se tratan como uno
  let again!: { data: ArchiveBulkResult };
  const quiet = await countChanges(async () => {
    again = await ctx.request<ArchiveBulkResult>("/projects/archive-bulk", "POST", { ids: [...body.ids, body.ids[0]], archived: true }, ctx.office);
  });
  assert.equal(again.data.changed, 0);
  assert.equal(again.data.projects.length, 3);
  assert.equal(quiet, 0);

  const back = await ctx.request<ArchiveBulkResult>("/projects/archive-bulk", "POST", { ids: body.ids.slice(0, 2), archived: false }, ctx.office);
  assert.equal(back.data.changed, 2);
  assert.ok(back.data.projects.every((p) => !p.archived));
  assert.deepEqual(await mine(), ["Proyecto Elena Cabrera"]);
  await ctx.request("/projects/archive-bulk", "POST", { ids: [body.ids[2]], archived: false }, ctx.office);
  assert.deepEqual(await mine(), []);
});

// ---------- XLS · columnas de preparación ----------

async function book(header: string[], rows: unknown[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Hoja1");
  ws.addRow(header);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
async function upload(buf: Buffer, dry: "0" | "1") {
  const form = new FormData();
  form.append("file", new Blob([buf as BlobPart]), "proyectos.xlsx");
  return ctx.request<ImportReport & { message?: string }>(`/projects/import?dry=${dry}`, "POST", form, ctx.office);
}

test("exportar e importar: una columna por parámetro, por nombre o por código (XLS-05, XLS-07)", async () => {
  const items = Object.fromEntries((await get<PrepItem[]>("/prep-items")).map((i) => [i.code, i]));
  const base = ["Contratista", "Proyecto"];

  // Por nombre del catálogo y por código; «N/A» quita el parámetro; vacío no toca nada
  const buf = await book(
    [...base, "Planos y BOM", "MA", "Permiso municipal", "Carta de no objeción"],
    [
      ["Evolta", "Kevin Almánzar", "Sí", "no", "x", null], // PL hecho, MA pendiente, PM hecho; EDE sin cambios
      ["Evolta", "Proyecto Elena Cabrera", "N/A", null, "Falso", "-"], // PL fuera, PM pendiente, EDE fuera
    ],
  );
  const dry = await upload(buf, "1");
  assert.equal(dry.status, 200);
  assert.deepEqual(dry.data.rows.map((r) => r.action), ["update", "update"]);
  const kevinBefore = await project("Kevin Almánzar");
  assert.equal((await project("Kevin Almánzar")).version, kevinBefore.version); // la vista previa no escribió nada
  const applied = await upload(buf, "0");
  assert.equal(applied.data.updated, 2);
  const kevin = await project("Kevin Almánzar");
  assert.deepEqual(kevin.prep, [
    { item_id: items.PL.id, done: true },
    { item_id: items.MA.id, done: false },
    { item_id: items.PM.id, done: true },
  ]);
  const elena = await project("Proyecto Elena Cabrera");
  assert.deepEqual(elena.prep, [{ item_id: items.MA.id, done: false }, { item_id: items.PM.id, done: false }]);
  const history = await get<{ diff: Record<string, unknown> }[]>(`/projects/${kevin.id}/history`);
  assert.deepEqual(history[0].diff.prep, [{ PL: false, MA: false }, { PL: true, MA: false, PM: true }]);

  // Valor que no se entiende → error de fila
  const bad = await upload(await book([...base, "Permiso municipal"], [["Evolta", "Kevin Almánzar", "quizás"]]), "1");
  assert.equal(bad.data.rows[0].action, "error");
  assert.match(bad.data.rows[0].messages.join(" "), /Permiso municipal.*quizás/);

  // Proyecto nuevo: los ítems por defecto + lo que diga el archivo
  const created = await upload(await book([...base, "PM"], [["Evolta", "Importado con permiso", "Sí"]]), "0");
  assert.equal(created.data.created, 1);
  const imported = await project("Importado con permiso");
  assert.deepEqual(imported.prep, [...[items.PL, items.MA, items.EDE].map((i) => ({ item_id: i.id, done: false })), { item_id: items.PM.id, done: true }]);
  const plain = await upload(await book(base, [["Evolta", "Importado sin columnas"]]), "0");
  assert.equal(plain.data.created, 1);
  assert.equal((await project("Importado sin columnas")).prep.length, 3);

  // Exportar → importar sin cambios (todas las columnas del catálogo se leen de vuelta)
  const exported = Buffer.from((await ctx.request("/projects/export", "GET", undefined, ctx.admin)).data as ArrayBuffer);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(exported as unknown as ExcelJS.Buffer);
  const ws = wb.worksheets[0];
  const header = (ws.getRow(1).values as unknown[]).slice(1).map(String);
  assert.deepEqual(header.slice(-4), ["Planos y BOM", "Materiales completos", "Carta de no objeción", "Permiso municipal"]);
  const row = Array.from({ length: ws.rowCount - 1 }, (_, i) => ws.getRow(i + 2)).find((r) => r.getCell(2).value === "Kevin Almánzar")!;
  assert.deepEqual([18, 19, 20, 21].map((n) => row.getCell(n).value ?? ""), ["Sí", "No", "", "Sí"]);
  const again = await upload(exported, "1");
  assert.deepEqual(again.data.rows.filter((r) => r.action === "error"), []);
  assert.equal(again.data.updated, 0);
  assert.equal(again.data.created, 0);

  for (const n of ["Importado con permiso", "Importado sin columnas"]) await ctx.request(`/projects/${(await project(n)).id}/archive`, "POST", {}, ctx.office);
});

test("importar: sigue aceptando las cabeceras antiguas de planos, materiales y EDE (XLS-07)", async () => {
  const items = Object.fromEntries((await get<PrepItem[]>("/prep-items")).map((i) => [i.code, i]));
  const buf = await book(
    ["Contratista", "Proyecto", "Planos", "Materiales", "EDE"],
    [["Evolta", "Héctor Liriano Sosa", "No", "Sí", "Sí"]],
  );
  const r = await upload(buf, "0");
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.rows.map((x) => x.action), ["update"]);
  const hector = await project("Héctor Liriano Sosa");
  assert.deepEqual(hector.prep, [{ item_id: items.PL.id, done: false }, { item_id: items.MA.id, done: true }, { item_id: items.EDE.id, done: true }]);
  // Variantes: «Material», «Planos y BOM» y «Carta de no objeción» (nombres de la v0.1 y de la exportación)
  const r2 = await upload(await book(["Contratista", "Proyecto", "Material", "Carta de no objeción"], [["Evolta", "Héctor Liriano Sosa", "No", "No"]]), "0");
  assert.equal(r2.data.updated, 1);
  assert.deepEqual((await project("Héctor Liriano Sosa")).prep.map((e) => e.done), [false, false, false]);
});

// ---------- Migración 002: los datos de preparación se conservan ----------

test("la migración 002 copia las marcas de preparación al catálogo nuevo y borra las columnas (PRY-12)", async () => {
  const url = new URL(process.env.DATABASE_URL!);
  const admin = new pg.Client({ connectionString: url.toString().replace(url.pathname, "/postgres") });
  const scratch = `${url.pathname.slice(1)}_mig`;
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${scratch}`);
  await admin.query(`CREATE DATABASE ${scratch}`);
  const db = new pg.Client({ connectionString: url.toString().replace(url.pathname, "/" + scratch) });
  try {
    await db.connect();
    const sql = (name: string) => fs.readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");
    await db.query(sql("001_base.sql"));
    const company = (await db.query("INSERT INTO companies(id,name,code,color) VALUES(gen_random_uuid(),'Vieja','VI','#112233') RETURNING id")).rows[0].id;
    const status = (await db.query("SELECT id FROM statuses WHERE kind='por_programar'")).rows[0].id;
    const flags = [[true, true, true], [false, true, false], [true, false, true], [false, false, false]];
    for (const [i, [a, b, c]] of flags.entries())
      await db.query(
        "INSERT INTO projects(id,company_id,name,status_id,system_type,prep_plans,prep_materials,prep_ede) VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7)",
        [company, `Proyecto ${i}`, status, i % 2 ? "hibrido" : "neta", a, b, c],
      );

    await db.query("BEGIN");
    await db.query(sql("002_v03.sql"));
    await db.query("COMMIT");

    const items = (await db.query("SELECT code,name,pending_label,applies_to,default_on,sort FROM prep_items ORDER BY sort")).rows;
    assert.deepEqual(items, [
      { code: "PL", name: "Planos y BOM", pending_label: "planos", applies_to: "todos", default_on: true, sort: 1 },
      { code: "MA", name: "Materiales completos", pending_label: "material", applies_to: "todos", default_on: true, sort: 2 },
      { code: "EDE", name: "Carta de no objeción", pending_label: "EDE", applies_to: "neta", default_on: true, sort: 3 },
    ]);
    const rows = (
      await db.query(
        `SELECT p.name, bool_or(pp.done) FILTER (WHERE i.code='PL') AS pl, bool_or(pp.done) FILTER (WHERE i.code='MA') AS ma,
           bool_or(pp.done) FILTER (WHERE i.code='EDE') AS ede, count(*)::int AS n
         FROM projects p JOIN project_prep pp ON pp.project_id=p.id JOIN prep_items i ON i.id=pp.item_id GROUP BY p.name ORDER BY p.name`,
      )
    ).rows;
    assert.deepEqual(
      rows.map((r) => [r.pl, r.ma, r.ede, r.n]),
      flags.map(([a, b, c]) => [a, b, c, 3]),
    );
    const cols = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='projects' AND column_name LIKE 'prep%'")).rows;
    assert.deepEqual(cols, []);
    assert.deepEqual((await db.query("SELECT pattern FROM companies")).rows, [{ pattern: "solido" }]);
    // Los checks del esquema nuevo
    await assert.rejects(db.query("UPDATE companies SET pattern='estrellas'"), /check/i);
    await assert.rejects(db.query("INSERT INTO prep_items(id,code,name,pending_label) VALUES(gen_random_uuid(),'abc','x','y')"), /check/i);
    await assert.rejects(db.query("INSERT INTO prep_items(id,code,name,pending_label) VALUES(gen_random_uuid(),'PL','x','y')"), /unique|duplicate/i);
  } finally {
    await db.end().catch(() => undefined);
    await admin.query(`DROP DATABASE IF EXISTS ${scratch}`);
    await admin.end();
  }
});

test("la base de pruebas ya aplicó 002_v03.sql una sola vez con su suma de verificación (PRY-12)", async () => {
  const r = await pool.query("SELECT name FROM schema_migrations ORDER BY name");
  assert.deepEqual(r.rows.map((x) => x.name), ["001_base.sql", "002_v03.sql"]);
});

// ---------- Resolución de la revisión de v03-base ----------

test("borrados simultáneos de estados del mismo tipo no dejan el tipo vacío (EST-05, M1)", async () => {
  const terminado = await statusByName("Terminado");
  const a = (await newStatus("Cierre A", "post_obra")).data;
  const meter = await statusByName("Esperando medidor");
  const kindCount = async () => (await pool.query("SELECT count(*)::int AS n FROM statuses WHERE kind='post_obra'")).rows[0].n as number;
  assert.equal(await kindCount(), 2);
  const results = await Promise.all([
    ctx.request(`/statuses/${a.id}`, "DELETE", { version: a.version, replacement_id: terminado.id }, ctx.admin),
    ctx.request(`/statuses/${meter.id}`, "DELETE", { version: meter.version, replacement_id: terminado.id }, ctx.admin),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(await kindCount(), 1);
  // Si el que sobrevive es «Cierre A», la demo conserva su tipo: se deja como está para las pruebas siguientes.
});

test("borrar un estado: el reemplazo que desaparece da un mensaje claro y los archivados pasan sin validar (EST-05, B5, B8)", async () => {
  const spare = (await newStatus("Espera archivada", "por_programar")).data;
  const target = (await newStatus("Destino temporal", "por_programar")).data;
  const kevin = await project("Kevin Almánzar");
  await ctx.request(`/projects/${kevin.id}`, "PATCH", { version: kevin.version, status_id: spare.id }, ctx.office);
  await ctx.request(`/projects/${kevin.id}/archive`, "POST", {}, ctx.office);
  const programado = await statusByName("Programado");
  const spareNow = await statusByName("Espera archivada");
  // Un reemplazo que ya no existe: 422 con mensaje que lo dice
  const gone = await ctx.request<{ message: string }>(`/statuses/${spare.id}`, "DELETE", { version: spareNow.version, replacement_id: "00000000-0000-4000-8000-000000000000" }, ctx.admin);
  assert.equal(gone.status, 422);
  assert.match(gone.data.message, /reemplazo ya no existe/);
  // Archivado sin fechas: pasa a «Programado» sin que la validación lo bloquee
  const ok = await ctx.request<StatusDeleted>(`/statuses/${spare.id}`, "DELETE", { version: spareNow.version, replacement_id: programado.id }, ctx.admin);
  assert.equal(ok.status, 200);
  assert.equal((await project("Kevin Almánzar")).status_id, programado.id);
  await pool.query("UPDATE projects SET status_id=(SELECT id FROM statuses WHERE name='Por programar'), archived=false WHERE id=$1", [kevin.id]);
  await ctx.request(`/statuses/${target.id}`, "DELETE", { version: target.version }, ctx.admin);
});

test("logotipo: immutable solo si ?v= coincide con el hash actual (EQP-07, B1)", async () => {
  const c = await company("Electsun");
  const up = await putLogo(c.id, PNG_1X1);
  const base = up.data.logo_url!.split("?")[0];
  const good = await getLogo(up.data.logo_url!, ctx.office);
  assert.equal(good.headers.get("cache-control"), "private, max-age=31536000, immutable");
  const stale = await getLogo(`${base}?v=000000000000`, ctx.office);
  assert.equal(stale.status, 200);
  assert.equal(stale.headers.get("cache-control"), "private, no-cache");
  await ctx.request(`/companies/${c.id}/logo`, "DELETE", undefined, ctx.office);
});

test("archivar en bloque con versiones: una versión vencida cancela el lote (PRY-10, B7)", async () => {
  const [a, b] = await Promise.all(["Kevin Almánzar", "Oficina Evolta"].map(project));
  const stale = await ctx.request<{ message: string }>("/projects/archive-bulk", "POST", { ids: [a.id, b.id], archived: true, versions: { [a.id]: a.version, [b.id]: b.version + 5 } }, ctx.office);
  assert.equal(stale.status, 409);
  assert.equal((await projects("")).filter((p) => [a.id, b.id].includes(p.id)).length, 2); // nada se archivó
  assert.equal((await ctx.request("/projects/archive-bulk", "POST", { ids: [a.id], archived: true, versions: { [a.id]: 0 } }, ctx.office)).status, 422);
  const ok = await ctx.request<ArchiveBulkResult>("/projects/archive-bulk", "POST", { ids: [a.id, b.id], archived: true, versions: { [a.id]: a.version, [b.id]: b.version } }, ctx.office);
  assert.equal(ok.status, 200);
  assert.equal(ok.data.changed, 2);
  await ctx.request("/projects/archive-bulk", "POST", { ids: [a.id, b.id], archived: false }, ctx.office);
});

test("catálogo de preparación: nombres y códigos que chocan con columnas del Excel se rechazan (XLS-07, M2)", async () => {
  const body = { code: "ZZ", name: "Prueba", pending_label: "espera", applies_to: "todos", default_on: false };
  for (const name of ["Parte", "estado", "Observación", "Fin real", "Planos"]) {
    const r = await ctx.request<{ message: string }>("/prep-items", "POST", { ...body, name }, ctx.admin);
    assert.equal(r.status, 422, name);
    assert.match(r.data.message, /columna del Excel/);
  }
  assert.equal((await ctx.request("/prep-items", "POST", { ...body, code: "FIN" }, ctx.admin)).status, 422);
  const pm = await prepByCode("PM");
  assert.equal((await ctx.request("/prep-items", "POST", { ...body, code: "ZZ", name: "Ok sin choque" }, ctx.admin)).status, 201);
  const renamed = await ctx.request(`/prep-items/${pm.id}`, "PATCH", { version: pm.version, name: "Tipo" }, ctx.admin);
  assert.equal(renamed.status, 422);
  const zz = await prepByCode("ZZ");
  assert.equal((await ctx.request(`/prep-items/${zz.id}`, "PATCH", { version: zz.version, code: "dias" }, ctx.admin)).status, 422);
  // Un parámetro puede conservar sus propias cabeceras antiguas (PL sigue llamándose «Planos y BOM»)
  const pl = await prepByCode("PL");
  assert.equal((await ctx.request(`/prep-items/${pl.id}`, "PATCH", { version: pl.version, name: "Planos" }, ctx.admin)).status, 200);
  const plNow = await prepByCode("PL");
  await ctx.request(`/prep-items/${plNow.id}`, "PATCH", { version: plNow.version, name: "Planos y BOM" }, ctx.admin);
  await ctx.request(`/prep-items/${zz.id}`, "DELETE", { version: zz.version }, ctx.admin);
});

test("Excel: un parámetro heredado cuyo nombre choca con una columna fija se lee y se exporta por su código (XLS-07, M2)", async () => {
  await pool.query("INSERT INTO prep_items(id,code,name,pending_label) VALUES(gen_random_uuid(),'PA','Parte','espera parte')");
  try {
    const pa = await prepByCode("PA");
    const dry = await upload(await book(["Contratista", "Proyecto", "Parte", "PA"], [["Evolta", "Kevin Almánzar", "pieza A", "Sí"]]), "0");
    assert.equal(dry.status, 200);
    const kevin = await project("Kevin Almánzar");
    assert.equal(kevin.part, "pieza A"); // «Parte» sigue siendo la columna fija
    assert.deepEqual(kevin.prep.find((e) => e.item_id === pa.id), { item_id: pa.id, done: true }); // el parámetro, por su código
    const exported = Buffer.from((await ctx.request("/projects/export", "GET", undefined, ctx.admin)).data as ArrayBuffer);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(exported as unknown as ExcelJS.Buffer);
    const header = (wb.worksheets[0].getRow(1).values as unknown[]).slice(1).map(String);
    assert.equal(header.filter((h) => h === "Parte").length, 1, "una sola columna «Parte»");
    assert.ok(header.includes("PA"));
    // Al volver a importar, ninguna fila falla por la cabecera repetida (otros avisos, como nombres duplicados de la demo, no cuentan)
    const again = await upload(exported, "1");
    assert.deepEqual(again.data.rows.filter((r) => r.action === "error" && /Parte|PA/.test(r.messages.join(" ")) && !/más de un proyecto/.test(r.messages.join(" "))), []);
  } finally {
    await pool.query("DELETE FROM prep_items WHERE code='PA'");
  }
});

test("el timeline lleva el patrón de cada empresa, aunque dos compartan color (EQP-08)", async () => {
  const view = await get<MuralView>("/view/mural");
  const rows = view.model.timeline.groups.flatMap((g) => g.rows);
  assert.ok(rows.length > 0);
  const compusol = await company("Compusol");
  const mine = (await projects("")).filter((p) => p.company_id === compusol.id).map((p) => p.id);
  const hit = rows.filter((r) => mine.includes(r.id));
  for (const r of rows) assert.ok(["solido", "rayas", "rayas_finas", "puntos", "cuadricula", "zigzag", "diagonal_cruzada"].includes(r.pattern));
  for (const r of hit) assert.equal(r.pattern, "rayas");
});
