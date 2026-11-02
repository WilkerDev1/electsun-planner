import type { Request, Response } from "express";
import { pool } from "./db.js";
import { findDevice, hash } from "./auth.js";
import { SESSION_COOKIE } from "../shared/contracts/access.js";

// Bus de cambios en memoria (API-01). Un solo proceso de API, así que no hace falta LISTEN/NOTIFY.
const clients = new Set<Response>();
let version = Date.now();

/** Avisa a todos los murales y móviles conectados de que hay datos nuevos. Llamar tras confirmar la transacción. */
export function publishChange(reason = "change") {
  version = Math.max(version + 1, Date.now());
  const msg = `event: change\ndata: ${JSON.stringify({ version, reason })}\n\n`;
  for (const res of clients) res.write(msg);
}

export const currentVersion = () => version;

async function stillAllowed(req: Request): Promise<boolean> {
  const t = req.cookies?.[SESSION_COOKIE];
  if (t) {
    const r = await pool.query(
      "SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=$1 AND s.expires_at>now() AND u.active",
      [hash(t)],
    );
    if (r.rowCount) return true;
  }
  const link = typeof req.query.link === "string" ? req.query.link : undefined;
  return !!(link ? await findDevice(req, "tv", link) : await findDevice(req, "mobile"));
}

/** GET /api/events (API-02): cuenta, TV (`?link=:id`) o móvil. Revisa el permiso cada 60 s. */
export async function eventsHandler(req: Request, res: Response) {
  if (!(await stillAllowed(req))) return res.status(401).json({ message: "Sin acceso a las actualizaciones." });
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write(`event: ready\ndata: ${JSON.stringify({ version })}\n\n`);
  clients.add(res);
  let ticks = 0;
  const timer = setInterval(async () => {
    ticks++;
    if (ticks % 2 === 0) {
      try {
        if (!(await stillAllowed(req))) {
          res.write("event: revoked\ndata: {}\n\n");
          return res.end();
        }
      } catch {
        return res.end();
      }
    }
    res.write(": heartbeat\n\n");
  }, 30000);
  req.on("close", () => {
    clearInterval(timer);
    clients.delete(res);
  });
}
