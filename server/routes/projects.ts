import { Router, type Request } from "express";
import multer from "multer";
import { z } from "zod";
import { pool, transaction, httpError } from "../db.js";
import { authenticated } from "../auth.js";
import { publishChange } from "../events.js";
import { listProjects, listStatuses } from "../queries.js";
import { serverToday } from "../today.js";
import { exportProjects, importProjects } from "../xlsx.js";
import {
  blankProject, changedFields, defaultPrep, fieldsOf, insertProject, assertTeamAssignable, lockProject, normalizePrep,
  saveProject, validateAgainstDb, type ProjectFields,
} from "../project-store.js";
import { ArchiveBulk, ProjectCreate, ProjectPatch, type ArchiveBulkResult, type HistoryEntry, type Project, type ProjectResponse } from "../../shared/contracts/projects.js";
import { mergeProject, normalizeDate, parseKwp, type CodedWarning } from "../../shared/domain.js";

// F1·B — Proyectos, validación, historial, Excel (PRY, VAL, XLS, HIS, ROL-03)
export const projects = Router();

const DATE_FIELDS = ["sale_date", "start_date", "end_date", "mural_until"] as const;
const MAX_UPLOAD = 5 * 1024 * 1024;

/** VAL-05: "NA", "N/A", "-" y vacío en fechas (y kWp) se guardan como null antes de validar con zod. */
function prepare(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const out: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  for (const k of DATE_FIELDS) {
    const v = out[k];
    if (typeof v === "string" && normalizeDate(v) === null) out[k] = null;
  }
  if (typeof out.kwp === "string" && parseKwp(out.kwp) === null) out.kwp = null;
  return out;
}

const idParam = (req: Request) => {
  const parsed = z.uuid().safeParse(req.params.id);
  if (!parsed.success) throw httpError(404, "Ese proyecto no existe.");
  return parsed.data;
};

type Parsed = z.infer<typeof ProjectPatch>;
/** Cambios del cuerpo como campos de la tabla (kWp ya normalizado). */
function toFields(body: Omit<Parsed, "version">): Partial<ProjectFields> {
  const { kwp, ...rest } = body;
  const out: Partial<ProjectFields> = { ...rest };
  if (kwp !== undefined) {
    const parsed = parseKwp(kwp);
    if (parsed === undefined) throw httpError(422, "La potencia (kWp) no es válida.");
    out.kwp = parsed;
  }
  return out;
}

async function statusOf(db: Parameters<typeof listStatuses>[0], id: string) {
  const status = (await listStatuses(db)).find((s) => s.id === id);
  if (!status) throw httpError(422, "Ese estado ya no existe.");
  return status;
}

/** El proyecto más sus avisos, con y sin código (VAL-10). */
const response = (project: Project, check: { warnings: string[]; coded: CodedWarning[] }): ProjectResponse => ({
  ...project,
  warnings: check.warnings,
  coded_warnings: check.coded,
});

/** Al desarchivar no se bloquea nada: lo que la validación rechazaría hoy se devuelve como aviso con código `error`, junto a los avisos normales. */
async function checkRestored(c: Parameters<typeof listStatuses>[0], project: Project) {
  const status = await statusOf(c, project.status_id);
  const check = await validateAgainstDb(c, { ...fieldsOf(project), id: project.id }, status, serverToday());
  const coded: CodedWarning[] = [...check.errors.map((text) => ({ code: "error" as const, text })), ...check.coded];
  return { warnings: coded.map((w) => w.text), coded_warnings: coded };
}

function failIfErrors(errors: string[]) {
  if (errors.length) throw httpError(422, errors.join(" "));
}

// ---------- Lecturas ----------

// Sin parámetro: solo los activos. `?archived=1`: todos, activos y archivados. `?archived=only`: solo los archivados.
projects.get("/", authenticated, async (req, res) => {
  const archived = req.query.archived === "only" ? "only" : req.query.archived === "1";
  res.json(await listProjects(pool, { archived }));
});

// XLS-05. Antes de /:id para que "export" no se tome como id.
projects.get("/export", authenticated, async (req, res) => {
  const status = z.uuid().safeParse(req.query.status);
  const q = typeof req.query.q === "string" ? req.query.q.slice(0, 120) : undefined;
  const file = await exportProjects(pool, { status: status.success ? status.data : undefined, q });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="proyectos-${serverToday()}.xlsx"`);
  res.send(file);
});

projects.get("/:id", authenticated, async (req, res) => {
  const [project] = await listProjects(pool, { id: idParam(req) });
  if (!project) throw httpError(404, "Ese proyecto no existe.");
  res.json(project);
});

// HIS-02, HIS-03: solo lectura.
projects.get("/:id/history", authenticated, async (req, res) => {
  const id = idParam(req);
  const r = await pool.query(
    `SELECT a.id::text AS id,u.name AS actor_name,a.action,a.diff,a.created_at
     FROM audit a LEFT JOIN users u ON u.id=a.actor_id
     WHERE a.entity='project' AND a.entity_id=$1 ORDER BY a.id DESC LIMIT 200`,
    [id],
  );
  const history: HistoryEntry[] = r.rows;
  res.json(history);
});

// ---------- Escrituras ----------

// PRY-05
projects.post("/", authenticated, async (req, res) => {
  // ROL-03 también al crear: la prioridad solo la fija el administrador.
  if (req.user!.role !== "admin" && req.body && typeof req.body === "object" && "priority" in req.body)
    throw httpError(403, "Solo el administrador puede cambiar la prioridad.");
  const body = ProjectCreate.parse(prepare(req.body));
  const today = serverToday();
  const out = await transaction(async (c) => {
    const statuses = await listStatuses(c);
    const status = body.status_id
      ? await statusOf(c, body.status_id)
      : statuses.find((s) => s.kind === "por_programar") ?? statuses[0];
    const { company_id, name, ...rest } = body;
    const base = blankProject(company_id, name, status.id);
    // Sin `prep` explícito, el proyecto lleva los parámetros marcados como «por defecto», sin hacer (PRY-12).
    if (rest.prep === undefined) base.prep = await defaultPrep(c);
    const merged = mergeProject(base, toFields(rest), status.kind, today);
    merged.prep = await normalizePrep(c, merged.prep);
    if (merged.estimated_days !== null && merged.estimated_days > 120)
      throw httpError(422, "La obra no puede pasar de 120 días laborables.");
    await assertTeamAssignable(c, merged.team_id);
    const check = await validateAgainstDb(c, { ...merged, id: "" }, status, today);
    failIfErrors(check.errors);
    return { project: await insertProject(c, merged, req.user!.id), check };
  });
  publishChange("project");
  res.status(201).json(response(out.project, out.check));
});

// PRY-03, PRY-11, VAL, ROL-03
projects.patch("/:id", authenticated, async (req, res) => {
  const id = idParam(req);
  // ROL-03: antes de leer nada ni aplicar ningún cambio del cuerpo.
  if (req.user!.role !== "admin" && req.body && typeof req.body === "object" && "priority" in req.body)
    throw httpError(403, "Solo el administrador puede cambiar la prioridad.");
  const { version, ...body } = ProjectPatch.parse(prepare(req.body));
  const patch = toFields(body);
  const today = serverToday();

  const out = await transaction(async (c) => {
    const before = await lockProject(c, id);
    if (!before) throw httpError(404, "Ese proyecto no existe.");
    if (before.version !== version) throw httpError(409, "Otra persona cambió este proyecto. Se cargó la versión más reciente.");
    const status = await statusOf(c, patch.status_id ?? before.status_id);
    const merged = mergeProject(fieldsOf(before), patch, status.kind, today);
    if (patch.prep !== undefined) merged.prep = await normalizePrep(c, merged.prep);
    if (merged.estimated_days !== null && merged.estimated_days > 120)
      throw httpError(422, "La obra no puede pasar de 120 días laborables.");
    await assertTeamAssignable(c, merged.team_id, before.team_id);
    const check = await validateAgainstDb(c, { ...merged, id }, status, today);
    failIfErrors(check.errors);
    const changes = changedFields(fieldsOf(before), merged);
    if (!Object.keys(changes).length) return { project: before, check, changed: false };
    return { project: await saveProject(c, before, changes, req.user!.id), check, changed: true };
  });
  if (out.changed) publishChange("project");
  res.json(response(out.project, out.check));
});

// PRY-10: archivar y desarchivar (no hay borrado). Cuerpo opcional con `version`.
for (const [path, archived] of [["archive", true], ["unarchive", false]] as const)
  projects.post(`/:id/${path}`, authenticated, async (req, res) => {
    const id = idParam(req);
    const { version } = z.object({ version: z.number().int().positive().optional() }).parse(req.body ?? {});
    const out = await transaction(async (c) => {
      const before = await lockProject(c, id);
      if (!before) throw httpError(404, "Ese proyecto no existe.");
      if (version !== undefined && before.version !== version)
        throw httpError(409, "Otra persona cambió este proyecto. Se cargó la versión más reciente.");
      if (before.archived === archived) return { project: before, changed: false, check: undefined };
      const project = await saveProject(c, before, { archived }, req.user!.id, archived ? "project.archive" : "project.unarchive");
      return { project, changed: true, check: archived ? undefined : await checkRestored(c, project) };
    });
    if (out.changed) publishChange("project");
    res.json({ ...out.project, ...(out.check ?? { warnings: [], coded_warnings: [] }) } satisfies ProjectResponse);
  });

// PRY-10: archivar o desarchivar varios a la vez. Una transacción, un historial por proyecto y un solo aviso a las pantallas.
projects.post("/archive-bulk", authenticated, async (req, res) => {
  const { ids: requested, archived, versions } = ArchiveBulk.parse(req.body);
  const ids = [...new Set(requested)];
  const out = await transaction(async (c): Promise<ArchiveBulkResult> => {
    // Se bloquean en orden de id para que dos archivados en bloque a la vez no se esperen en círculo.
    const locked = (await c.query("SELECT id FROM projects WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE", [ids])).rows;
    if (locked.length !== ids.length) throw httpError(404, "Alguno de los proyectos ya no existe. Recarga la lista.");
    let changed = 0;
    const warnings: NonNullable<ArchiveBulkResult["warnings"]> = {};
    const restored: Project[] = [];
    for (const { id } of locked) {
      const before = (await lockProject(c, id))!;
      if (versions?.[id] !== undefined && versions[id] !== before.version)
        throw httpError(409, `«${before.name}» cambió mientras lo elegías. Recarga la lista y vuelve a intentarlo.`);
      if (before.archived === archived) continue;
      restored.push(await saveProject(c, before, { archived }, req.user!.id, archived ? "project.archive" : "project.unarchive"));
      changed++;
    }
    // Se valida después de guardar todos, para que los choques entre proyectos restaurados juntos salgan en ambos.
    if (!archived)
      for (const saved of restored) {
        const check = await checkRestored(c, saved);
        if (check.warnings.length) warnings[saved.id] = check;
      }
    const byId = new Map((await listProjects(c, { ids })).map((p) => [p.id, p]));
    return { projects: ids.map((id) => byId.get(id)!), changed, ...(archived ? {} : { warnings }) };
  });
  if (out.changed) publishChange("project");
  res.json(out);
});

// XLS-01..04, XLS-06: el archivo vive solo en memoria.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD, files: 1 },
  fileFilter: (_req, file, cb) =>
    /\.xlsx$/i.test(file.originalname) ? cb(null, true) : cb(httpError(422, "Sube un archivo de Excel con extensión .xlsx.")),
});

projects.post("/import", authenticated, upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) throw httpError(422, "Elige un archivo .xlsx para importar.");
  if (file.buffer.length < 4 || file.buffer[0] !== 0x50 || file.buffer[1] !== 0x4b)
    throw httpError(422, "El archivo no parece un Excel (.xlsx) válido.");
  const dry = req.query.dry !== "0"; // sin parámetro, solo vista previa
  const report = await transaction((c) =>
    importProjects(c, file.buffer, { dry, actorId: req.user!.id, today: serverToday() }),
  );
  if (!dry && report.created + report.updated > 0) publishChange("project");
  res.json(report);
});

