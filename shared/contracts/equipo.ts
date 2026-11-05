import { z } from "zod";
import { EMPLOYEE_STATES, LEVEL_ICONS, type EmployeeState, type Level, type LevelDef } from "../domain.js";
import { COMPANY_PATTERNS, type CompanyPattern } from "../pattern.js";
import { color, id, isoDate, optionalDate, version } from "./common.js";

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

// ---------- Niveles (NIV-01) ----------

/** Nivel del catálogo tal como lo devuelve la API: con su versión y cuántas personas lo tienen vigente hoy. */
export type LevelItem = LevelDef & { version: number; person_count: number };

/** Máximo de niveles en el catálogo. */
export const MAX_LEVELS = 20;

const levelFields = {
  name: z.string().trim().min(1).max(40),
  group_label: z.string().trim().min(1).max(60),
  fg: color,
  bg: color,
  border: color,
  icon: z.enum(LEVEL_ICONS),
  can_lead_team: z.boolean(),
  is_supervisor: z.boolean(),
  can_use_mobile: z.boolean(),
  is_field: z.boolean(),
  active: z.boolean(),
  sort: z.number().int().min(0).max(99),
};
/** `code` es opcional: si falta, el servidor lo saca del nombre. Después no cambia. */
export const LevelCreate = z.object({
  code: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{2,24}$/, "Código de 2 a 24 letras minúsculas, números o _.").optional(),
  name: levelFields.name,
  group_label: levelFields.group_label.optional(),
  fg: levelFields.fg.default("#344054"),
  bg: levelFields.bg.default("#FFFFFF"),
  border: levelFields.border.default("#EAECF0"),
  icon: levelFields.icon.default("user"),
  can_lead_team: levelFields.can_lead_team.default(false),
  is_supervisor: levelFields.is_supervisor.default(false),
  can_use_mobile: levelFields.can_use_mobile.default(false),
  is_field: levelFields.is_field.default(false),
});
export const LevelPatch = z.object(levelFields).partial().extend({ version });

// ---------- Roles con vigencia (EQP-01b) ----------

export type EmployeeRole = {
  id: string;
  level_id: string;
  /** Nombre del nivel. */
  level: Level;
  /** Equipo que lidera durante la vigencia; solo con un nivel que puede liderar. */
  team_id: string | null;
  starts_on: string;
  ends_on: string | null;
  note: string;
};
const roleFields = {
  level_id: id,
  team_id: id.nullable().optional(),
  starts_on: isoDate,
  ends_on: optionalDate.optional(),
  note: z.string().trim().max(120).default(""),
};
/** Un rol al guardar. Con `id` edita uno existente; sin `id` crea uno nuevo. */
export const EmployeeRoleInput = z
  .object({ id: id.optional(), ...roleFields })
  .refine((r) => !r.ends_on || r.ends_on >= r.starts_on, { message: "El rol no puede terminar antes de empezar.", path: ["ends_on"] });
export type EmployeeRoleInput = z.infer<typeof EmployeeRoleInput>;

export type Employee = {
  id: string;
  name: string;
  job: string;
  /** Nombre del nivel principal vigente hoy (el de mayor jerarquía). */
  level: Level;
  /** Todos los roles, vigentes, próximos y vencidos, el más reciente primero (historial incluido). */
  roles: EmployeeRole[];
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
  /** Atajo de edición en celda: cambia el nivel principal (cierra el anterior y abre el nuevo). */
  level: z.string().trim().min(1).max(40),
  /** Edición completa de los roles vigentes y próximos; los vencidos no se tocan. */
  roles: z.array(EmployeeRoleInput).min(1).max(10),
  team_id: id.nullable(),
  state: z.enum(EMPLOYEE_STATES),
  phone: z.string().trim().max(30).regex(/^[0-9+()\s-]*$/, "Solo números y + ( ) -"),
};
const eitherLevelOrRoles = { message: "Indica el nivel o los roles, no ambos." };
export const EmployeeCreate = z
  .object({
    name: employeeFields.name,
    job: employeeFields.job.default(""),
    level: employeeFields.level.optional(),
    roles: employeeFields.roles.optional(),
    team_id: employeeFields.team_id.optional(),
    state: employeeFields.state.default("Activo"),
    phone: employeeFields.phone.default(""),
  })
  .refine((b) => (b.level === undefined) !== (b.roles === undefined), eitherLevelOrRoles);
// Sin valores por defecto: un PATCH parcial no debe pisar los campos que no envía.
export const EmployeePatch = z
  .object({ ...employeeFields, level: employeeFields.level.optional(), roles: employeeFields.roles.optional() })
  .partial()
  .extend({ version })
  .refine((b) => b.level === undefined || b.roles === undefined, eitherLevelOrRoles);
