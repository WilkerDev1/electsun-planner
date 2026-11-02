import { z } from "zod";

export const LINK_KINDS = ["tv", "mobile"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export const CreateLinkBody = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tv"), name: z.string().trim().min(1).max(80) }),
  z.object({ kind: z.literal("mobile"), name: z.string().trim().min(1).max(80).optional(), employee_id: z.uuid() }),
]);
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
