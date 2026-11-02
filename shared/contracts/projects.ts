import { z } from "zod";
import { SYSTEM_TYPES, type SystemType, type StatusKind } from "../domain.js";
import { id, optionalDate, version } from "./common.js";

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
  prep_plans: boolean;
  prep_materials: boolean;
  prep_ede: boolean;
  archived: boolean;
  version: number;
  created_at: string;
  updated_at: string;
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
  prep_plans: z.boolean(),
  prep_materials: z.boolean(),
  prep_ede: z.boolean(),
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
  rows: ImportRow[];
};
