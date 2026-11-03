import { z } from "zod";
import { isISODate } from "../domain.js";

export const id = z.uuid();
export const isoDate = z.string().refine(isISODate, "Fecha inválida (aaaa-mm-dd).");
export const optionalDate = isoDate.nullable();
export const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Color #rrggbb.");
export const version = z.number().int().positive();
