import { z } from "zod";
import { isISODate } from "../domain.js";

export const id = z.uuid();
export const isoDate = z.string().refine(isISODate, "Fecha inválida (aaaa-mm-dd).");
export const optionalDate = isoDate.nullable();
export const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Color #rrggbb.");
export const version = z.number().int().positive();

/** Respuesta de error de la API: `{ message }` con 401, 403, 404, 409 o 422. */
export type ApiErrorBody = { message: string };

/** Escritura con avisos no bloqueantes (VAL-10). */
export type WithWarnings<T> = T & { warnings: string[] };
