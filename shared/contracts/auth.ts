import { z } from "zod";

export const ROLES = ["admin", "office"] as const;
export type Role = (typeof ROLES)[number];

export const password = z.string().min(12, "Usa al menos 12 caracteres.").max(128);

export const LoginBody = z.object({ email: z.email(), password: z.string().max(128) });
export const AcceptBody = z.object({ token: z.string().min(20).max(200), name: z.string().trim().min(1).max(160), password });
export const PasswordBody = z.object({ current: z.string().max(128), password });

export type User = { id: string; name: string; email: string; role: Role; active: boolean };
/** GET /api/auth/me. `today` es el "hoy" del servidor (America/Santo_Domingo o PLANNER_TODAY). */
export type Me = { user: User | null; today: string };

export const CreateAccountBody = z.object({ name: z.string().trim().min(1).max(160), email: z.email(), role: z.enum(ROLES) });
export const PatchAccountBody = z.object({ role: z.enum(ROLES), active: z.boolean() });

export type Account = User & { registered: boolean; created_at: string };
/** La ruta con el token solo se devuelve una vez (invitación 48 h, restablecimiento 2 h). */
export type ActivationLink = { id: string; activationPath: string };
