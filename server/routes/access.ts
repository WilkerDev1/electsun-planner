import crypto from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { pool } from "../db.js";
import { hash, issueDeviceSession } from "../auth.js";
import { RedeemBody, type RedeemResult } from "../../shared/contracts/access.js";
import { z } from "zod";

// F1·A — Canje de enlace: POST /session (ACC-04). Público, con límite de intentos como el login (AUT-07).
export const access = Router();

const redeemLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Demasiados intentos. Espera 15 minutos." },
});

const INVALID = "Este enlace no es válido o fue desactivado. Pide uno nuevo en la oficina.";
const uuid = z.uuid();

/** Separa `<id>.<token>` (móvil) o toma `id` aparte (TV). Devuelve null si el formato no sirve. */
function parseSecret(b: { token: string; id?: string }): { id: string; token: string } | null {
  if (b.id) return { id: b.id, token: b.token };
  const dot = b.token.indexOf(".");
  if (dot < 0) return null;
  const id = b.token.slice(0, dot);
  return uuid.safeParse(id).success ? { id, token: b.token.slice(dot + 1) } : null;
}

access.post("/session", redeemLimiter, async (req, res) => {
  const b = RedeemBody.parse(req.body);
  const secret = parseSecret(b);
  const link = secret
    ? ((await pool.query("SELECT id,kind,active,token_hash FROM access_links WHERE id=$1", [secret.id])).rows[0] as
        | { id: string; kind: "tv" | "mobile"; active: boolean; token_hash: string | null }
        | undefined)
    : undefined;
  const valid =
    !!secret &&
    !!link?.active &&
    !!link.token_hash &&
    crypto.timingSafeEqual(Buffer.from(hash(secret.token)), Buffer.from(link.token_hash));
  if (!link || !valid) return res.status(401).json({ message: INVALID });
  await issueDeviceSession(res, link);
  const body: RedeemResult = { kind: link.kind, id: link.id, redirect: link.kind === "tv" ? `/tv/${link.id}` : "/m" };
  res.json(body);
});
