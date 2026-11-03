import { z } from "zod";
import { isoDate } from "./common.js";
import type { MuralModel } from "../mural-model.js";
import type { CompanyPattern } from "../pattern.js";

export const MuralSettings = z.object({
  design: z.enum(["principal", "timeline"]),
  weeks: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  upcoming_order: z.enum(["fecha", "prioridad"]),
  show_waiting: z.boolean(),
  show_notes: z.boolean(),
  show_priority: z.boolean(),
  show_clock: z.boolean(),
  show_kwp: z.boolean(),
});
export type MuralSettings = z.infer<typeof MuralSettings>;

export type Notice = { id: string; text: string; starts_on: string; expires_on: string; sort: number };
export const NoticeBody = z
  .object({ text: z.string().trim().min(1).max(140), starts_on: isoDate, expires_on: isoDate, sort: z.number().int().min(0).max(99).default(0) })
  .refine((n) => n.expires_on >= n.starts_on, "La caducidad es anterior al inicio.");

/**
 * Respuesta de GET /api/view/mural (CAL-08): el modelo ya calculado con los ajustes guardados.
 * Una cuenta puede añadir los ajustes como parámetros (`?weeks=3&show_kwp=1`…) para la vista previa de Configuración.
 */
export type MuralView = {
  today: string;
  generatedAt: string;
  settings: MuralSettings;
  model: MuralModel;
  companies: { id: string; name: string; code: string; color: string; pattern: CompanyPattern; logo_url: string | null }[];
  teams: { id: string; code: string; name: string; color: string | null }[];
};

export type { MuralModel } from "../mural-model.js";
