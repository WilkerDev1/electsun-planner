import crypto from "node:crypto";
import argon2 from "argon2";
import type { Request, Response, NextFunction } from "express";
import { pool } from "./db.js";
import type { User } from "../shared/contracts/auth.js";
import { MOBILE_COOKIE, SESSION_COOKIE, TV_COOKIE_PREFIX, type LinkKind } from "../shared/contracts/access.js";

export type Device = { id: string; kind: LinkKind; employee_id: string | null };

declare global {
  namespace Express {
    interface Request {
      user?: User;
      device?: Device;
    }
  }
}

export const hash = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
export const token = () => crypto.randomBytes(32).toString("base64url");
export const passwordHash = (p: string) =>
  argon2.hash(p, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
export const verifyPassword = (h: string, p: string) => argon2.verify(h, p);

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.COOKIE_SECURE === "true",
  sameSite: "strict" as const,
  path: "/",
};

/** Carga la cuenta de la cookie de sesión (AUT-02). */
export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const t = req.cookies?.[SESSION_COOKIE];
    if (t) {
      const r = await pool.query(
        "SELECT u.id,u.name,u.email,u.role,u.active FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.hash=$1 AND s.expires_at>now() AND u.active",
        [hash(t)],
      );
      req.user = r.rows[0];
    }
    next();
  } catch (e) {
    next(e);
  }
}

export function authenticated(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ message: "Inicia sesión para continuar." });
  next();
}

export function admin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") return res.status(403).json({ message: "Esta acción requiere administración." });
  next();
}

export async function issueSession(res: Response, userId: string) {
  const t = token();
  await pool.query("INSERT INTO sessions(hash,user_id,expires_at) VALUES($1,$2,now()+interval '12 hours')", [hash(t), userId]);
  res.cookie(SESSION_COOKIE, t, { ...cookieOptions, maxAge: 12 * 3600000 });
}

// ---------- Dispositivos: TV y móvil (ACC-04, ACC-05) ----------

export const deviceCookie = (kind: LinkKind, linkId: string) =>
  kind === "tv" ? TV_COOKIE_PREFIX + linkId : MOBILE_COOKIE;

export const DEVICE_DAYS: Record<LinkKind, number> = { tv: 30, mobile: 90 };

export async function issueDeviceSession(res: Response, link: { id: string; kind: LinkKind }) {
  const t = token();
  const days = DEVICE_DAYS[link.kind];
  await pool.query("INSERT INTO device_sessions(hash,link_id,expires_at) VALUES($1,$2,now()+make_interval(days=>$3))", [
    hash(t),
    link.id,
    days,
  ]);
  res.cookie(deviceCookie(link.kind, link.id), t, { ...cookieOptions, maxAge: days * 86400000 });
}

/**
 * Busca la sesión de dispositivo. Para la TV hace falta el id del enlace (`/tv/:id`, `?link=`),
 * porque una misma pantalla puede tener varias cookies. Actualiza `last_seen_at` como mucho cada minuto.
 */
export async function findDevice(req: Request, kind: LinkKind, linkId?: string): Promise<Device | null> {
  if (kind === "tv" && !linkId) return null;
  const t = req.cookies?.[kind === "tv" ? TV_COOKIE_PREFIX + linkId : MOBILE_COOKIE];
  if (!t) return null;
  const r = await pool.query(
    `SELECT l.id,l.kind,l.employee_id FROM access_links l JOIN device_sessions s ON s.link_id=l.id
     WHERE s.hash=$1 AND s.expires_at>now() AND l.active AND l.kind=$2 ${kind === "tv" ? "AND l.id=$3" : ""}`,
    kind === "tv" ? [hash(t), kind, linkId] : [hash(t), kind],
  );
  const device = r.rows[0] as Device | undefined;
  if (!device) return null;
  await pool.query(
    "UPDATE access_links SET last_seen_at=now() WHERE id=$1 AND (last_seen_at IS NULL OR last_seen_at<now()-interval '1 minute')",
    [device.id],
  );
  return device;
}

/** Middleware: exige un dispositivo del tipo indicado. La TV toma el id de `req.params.id` o `req.query.link`. */
export function device(kind: LinkKind) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const linkId = String(req.params.id ?? req.query.link ?? "") || undefined;
      const d = await findDevice(req, kind, linkId);
      if (!d) return res.status(403).json({ message: "Este enlace fue desactivado. Pide uno nuevo en la oficina." });
      req.device = d;
      next();
    } catch (e) {
      next(e);
    }
  };
}
