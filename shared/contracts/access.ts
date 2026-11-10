import { z } from "zod";
import { MuralSettings } from "./mural.js";

export const LINK_KINDS = ["tv", "mobile"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

/** Ajustes propios de una TV (ACC-08): lo que falte se hereda de la configuración general del mural. */
export const TvMuralOverrides = MuralSettings.partial().strict();
export type TvMuralOverrides = z.infer<typeof TvMuralOverrides>;
/** Título que se ve en la cabecera del mural; vacío equivale a "sin título". */
const tvTitle = z.string().trim().max(60).transform((v) => v || null);

export const CreateLinkBody = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tv"), name: z.string().trim().min(1).max(80), title: tvTitle.nullish(), mural: TvMuralOverrides.optional() }),
  z.object({ kind: z.literal("mobile"), name: z.string().trim().min(1).max(80).optional(), employee_id: z.uuid() }),
]);
/** PATCH /api/access-links/:id (solo TV, ACC-08). `title: null` quita el título; `mural` reemplaza todo el objeto de ajustes propios. */
export const PatchTvLinkBody = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    title: tvTitle.nullable().optional(),
    mural: TvMuralOverrides.optional(),
    paused: z.boolean().optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, "No hay nada que cambiar.");
export type PatchTvLinkBody = z.infer<typeof PatchTvLinkBody>;

/**
 * Canje de un enlace (ACC-04). Dos formatos:
 * - móvil: `token` = `<id>.<token>` (el fragmento de `/m/activar#...`), sin `id`;
 * - TV: `token` = el fragmento de `/tv/:id#...` e `id` = el `:id` de la ruta.
 */
export const RedeemBody = z.object({ token: z.string().min(20).max(300), id: z.uuid().optional() });

export type AccessLink = {
  id: string;
  kind: LinkKind;
  name: string;
  employee_id: string | null;
  employee_name: string | null;
  active: boolean;
  /** Solo TV (ACC-08): título de la cabecera, ajustes propios y pausa reversible. */
  title: string | null;
  mural: TvMuralOverrides;
  paused: boolean;
  last_seen_at: string | null;
  created_at: string;
};
/** Al crear o rotar: TV `/tv/:id#token`, móvil `/m/activar#<id>.<token>`. Solo se muestra una vez. */
export type LinkSecret = { link: AccessLink; path: string };
/** POST /api/access/session */
export type RedeemResult = { kind: LinkKind; id: string; redirect: string };

export const TV_COOKIE_PREFIX = "planner_tv_";
export const MOBILE_COOKIE = "planner_m";
export const SESSION_COOKIE = "planner_session";
