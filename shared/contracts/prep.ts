import { z } from "zod";
import { PREP_APPLIES, type PrepAppliesTo } from "../domain.js";
import { version } from "./common.js";

/** Parámetro del catálogo de preparación (PRY-12). */
export type PrepItem = {
  id: string;
  /** 1 a 4 letras o números en mayúsculas ("PL", "EDE"). */
  code: string;
  name: string;
  /** Motivo de espera que se ve en el mural y el móvil ("planos", "espera permiso"). */
  pending_label: string;
  applies_to: PrepAppliesTo;
  /** Se marca solo en los proyectos nuevos. */
  default_on: boolean;
  sort: number;
  version: number;
  /** Proyectos que lo tienen, archivados incluidos: la interfaz avisa antes de quitarlo. */
  project_count: number;
};

/** Máximo de parámetros en el catálogo. */
export const MAX_PREP_ITEMS = 30;

const fields = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,4}$/, "Código de 1 a 4 letras o números."),
  name: z.string().trim().min(1).max(60),
  pending_label: z.string().trim().min(1).max(40),
  applies_to: z.enum(PREP_APPLIES),
  default_on: z.boolean(),
  sort: z.number().int().min(0).max(99),
};
export const PrepItemCreate = z.object({
  code: fields.code,
  name: fields.name,
  pending_label: fields.pending_label,
  applies_to: fields.applies_to.default("todos"),
  default_on: fields.default_on.default(false),
});
export const PrepItemPatch = z.object(fields).partial().extend({ version });
export const PrepItemDelete = z.object({ version });
export type PrepItemDeleted = { deleted_id: string; project_count: number };

/** Lista de preparación de un proyecto: reemplazo completo en POST y PATCH. Sin repetidos. */
export const ProjectPrepBody = z
  .array(z.object({ item_id: z.uuid(), done: z.boolean() }))
  .max(MAX_PREP_ITEMS)
  .refine((list) => new Set(list.map((e) => e.item_id)).size === list.length, "Hay parámetros de preparación repetidos.");
