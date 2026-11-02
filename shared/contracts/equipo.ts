import { z } from "zod";
import { EMPLOYEE_STATES, LEVELS, type EmployeeState, type Level } from "../domain.js";
import { color, id, version } from "./common.js";

export type Company = { id: string; name: string; code: string; color: string; active: boolean; version: number; project_count: number };
export const CompanyCreate = z.object({
  name: z.string().trim().min(1).max(80),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2}$/, "Sigla de 2 letras."),
  color,
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
export const EmployeeCreate = z.object({
  name: z.string().trim().min(1).max(120),
  job: z.string().trim().max(80).default(""),
  level: z.enum(LEVELS),
  team_id: id.nullable().optional(),
  state: z.enum(EMPLOYEE_STATES).default("Activo"),
  phone: z.string().trim().max(30).regex(/^[0-9+()\s-]*$/, "Solo números y + ( ) -").default(""),
});
export const EmployeePatch = EmployeeCreate.partial().extend({ version });
