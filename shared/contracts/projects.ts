import { z } from "zod";
import { SYSTEM_TYPES, type CodedWarning, type PrepEntry, type SystemType, type StatusKind } from "../domain.js";
import { id, optionalDate, version } from "./common.js";
import { ProjectPrepBody } from "./prep.js";

/** Proyecto tal como lo devuelve la API (REQUISITOS PRY-01). Fechas "aaaa-mm-dd" o null. */
export type Project = {
  id: string;
  company_id: string;
  name: string;
  kwp: string | null;
  sale_date: string | null;
  place: string;
  lead_employee_id: string | null;
  team_id: string | null;
  start_date: string | null;
  estimated_days: number | null;
  end_date: string | null;
  actual_end: string | null;
  status_id: string;
  status_kind: StatusKind;
  pause_reason: string;
  notes: string;
  show_on_mural: boolean;
  mural_until: string | null;
  priority: boolean;
  part: string;
  system_type: SystemType;
  /** Parámetros de preparación elegidos para este proyecto, en el orden del catálogo (PRY-12). Sin elegidos, la lista es vacía. */
  prep: PrepEntry[];
  archived: boolean;
  version: number;
  created_at: string;
  updated_at: string;
};

/** Respuesta del POST, el PATCH y el archivado: el proyecto más los avisos de validación (VAL-10). */
export type ProjectResponse = Project & {
  warnings: string[];
  /** Los mismos avisos, en el mismo orden, con un código estable. */
  coded_warnings: CodedWarning[];
};

const fields = {
  company_id: id,
  name: z.string().trim().min(1).max(160),
  kwp: z.union([z.number().min(0).max(999999), z.string().regex(/^\d+([.,]\d{1,2})?$/)]).nullable(),
  sale_date: optionalDate,
  place: z.string().trim().max(120),
  lead_employee_id: id.nullable(),
  team_id: id.nullable(),
  start_date: optionalDate,
  estimated_days: z.number().int().min(1).max(120).nullable(),
  end_date: optionalDate,
  status_id: id,
  pause_reason: z.string().trim().max(200),
  notes: z.string().trim().max(500),
  show_on_mural: z.boolean(),
  mural_until: optionalDate,
  priority: z.boolean(),
  part: z.string().trim().max(40),
  system_type: z.enum(SYSTEM_TYPES),
  prep: ProjectPrepBody,
  archived: z.boolean(),
};

export const ProjectCreate = z.object({ ...fields }).partial().required({ company_id: true, name: true });
/** PATCH con control optimista: si `version` no coincide, 409. `priority` solo admin (ROL-03). */
export const ProjectPatch = z.object({ ...fields }).partial().extend({ version });

export type HistoryEntry = {
  id: string;
  actor_name: string | null;
  action: string;
  diff: Record<string, [unknown, unknown]>;
  created_at: string;
};

export type ImportRow = {
  row: number;
  action: "create" | "update" | "error";
  name: string;
  messages: string[];
};
export type ImportReport = {
  dry: boolean;
  created: number;
  updated: number;
  errors: number;
  /** Filas del archivo que ya coinciden con el proyecto y no cambian nada. */
  unchanged?: number;
  rows: ImportRow[];
};

/** Archivar o desarchivar varios proyectos de una vez (PRY-10). */
export const ArchiveBulk = z.object({ ids: z.array(id).min(1).max(200), archived: z.boolean() });
export type ArchiveBulkResult = {
  /** Los proyectos pedidos, en su estado final y en el orden pedido. */
  projects: Project[];
  /** Cuántos cambiaron de verdad (los que ya estaban así no se tocan). */
  changed: number;
};
