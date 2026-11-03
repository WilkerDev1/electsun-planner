import { z } from "zod";
import { EMPLOYEE_STATES, LEVELS, type EmployeeState, type Level } from "../domain.js";
import { COMPANY_PATTERNS, type CompanyPattern } from "../pattern.js";
import { color, id, version } from "./common.js";

export type Company = {
  id: string;
  name: string;
  code: string;
  color: string;
  /** Patrón del color (EQP-08). */
  pattern: CompanyPattern;
  /** `/api/companies/:id/logo?v=<hash corto>`, o null si no tiene logotipo (EQP-07). El `?v=` cambia con cada logotipo nuevo. */
  logo_url: string | null;
  active: boolean;
  version: number;
  project_count: number;
};
export const CompanyCreate = z.object({
  name: z.string().trim().min(1).max(80),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2}$/, "Sigla de 2 letras."),
  color,
  pattern: z.enum(COMPANY_PATTERNS).optional(),
});
export const CompanyPatch = CompanyCreate.partial().extend({ version, active: z.boolean().optional() });

export type Team = {
  id: string;
  code: string;
  name: string;
  lead_employee_id: string | null;
  color: string | null;
  active: boolean;
  version: number;
  member_ids: string[];
};
export const TeamCreate = z.object({
  code: z.string().trim().toUpperCase().regex(/^E[1-9][0-9]?$/, "Código E1…E99."),
  name: z.string().trim().min(1).max(80),
  lead_employee_id: id.nullable().optional(),
  color: color.nullable().optional(),
});
export const TeamPatch = TeamCreate.partial().extend({ version, active: z.boolean().optional(), member_ids: z.array(id).max(50).optional() });

export type Employee = {
  id: string;
  name: string;
  job: string;
  level: Level;
  team_id: string | null;
  state: EmployeeState;
  phone: string;
  version: number;
  /** Estado del enlace móvil personal (ACC-06). */
  mobile_access: "none" | "active" | "revoked";
  mobile_link_id: string | null;
};
const employeeFields = {
  name: z.string().trim().min(1).max(120),
  job: z.string().trim().max(80),
  level: z.enum(LEVELS),
  team_id: id.nullable(),
  state: z.enum(EMPLOYEE_STATES),
  phone: z.string().trim().max(30).regex(/^[0-9+()\s-]*$/, "Solo números y + ( ) -"),
};
export const EmployeeCreate = z.object({
  ...employeeFields,
  job: employeeFields.job.default(""),
  team_id: employeeFields.team_id.optional(),
  state: employeeFields.state.default("Activo"),
  phone: employeeFields.phone.default(""),
});
// Sin valores por defecto: un PATCH parcial no debe pisar los campos que no envía.
export const EmployeePatch = z.object(employeeFields).partial().extend({ version });
