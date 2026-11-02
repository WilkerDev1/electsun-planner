import { Router } from "express";
import rateLimit from "express-rate-limit";
import { pool, transaction, httpError } from "../db.js";
import { hash, passwordHash, verifyPassword, cookieOptions, issueSession, authenticated } from "../auth.js";
import { audit } from "../audit.js";
import { serverToday } from "../today.js";
import { AcceptBody, LoginBody, PasswordBody, type Me } from "../../shared/contracts/auth.js";
import { SESSION_COOKIE } from "../../shared/contracts/access.js";

// Portado de Monitor server/accounts.ts (AUT-01, AUT-03, AUT-05, AUT-07).
export const auth = Router();

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Demasiados intentos. Espera 15 minutos." },
});

auth.get("/me", (req, res) => {
  const body: Me = { user: req.user ?? null, today: serverToday() };
  res.json(body);
});

auth.post("/login", authLimiter, async (req, res) => {
  const b = LoginBody.parse(req.body);
  const u = (await pool.query("SELECT id,password_hash FROM users WHERE email=$1 AND active", [b.email.toLowerCase()])).rows[0];
  if (!u?.password_hash || !(await verifyPassword(u.password_hash, b.password)))
    return res.status(401).json({ message: "Correo o contraseña incorrectos." });
  await issueSession(res, u.id);
  res.json({ ok: true });
});

auth.post("/logout", async (req, res) => {
  const t = req.cookies?.[SESSION_COOKIE];
  if (t) await pool.query("DELETE FROM sessions WHERE hash=$1", [hash(t)]);
  res.clearCookie(SESSION_COOKIE, cookieOptions);
  res.json({ ok: true });
});

/** Acepta una invitación o un restablecimiento (`/activar#token`). */
auth.post("/accept", authLimiter, async (req, res) => {
  const b = AcceptBody.parse(req.body);
  const ph = await passwordHash(b.password);
  const uid = await transaction(async (c) => {
    const r = await c.query(
      "SELECT user_id,kind FROM invitations WHERE hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE",
      [hash(b.token)],
    );
    if (!r.rowCount) throw httpError(422, "El enlace expiró o ya fue utilizado. Pide otro a administración.");
    const { user_id, kind } = r.rows[0];
    const u = await c.query("UPDATE users SET password_hash=$1,name=$2 WHERE id=$3 AND active RETURNING id", [ph, b.name, user_id]);
    if (!u.rowCount) throw httpError(403, "La cuenta está desactivada.");
    await c.query("UPDATE invitations SET used_at=now() WHERE user_id=$1 AND used_at IS NULL", [user_id]);
    await c.query("DELETE FROM sessions WHERE user_id=$1", [user_id]);
    await audit(c, user_id, kind === "invite" ? "account.accepted" : "account.reset", "user", user_id);
    return user_id as string;
  });
  await issueSession(res, uid);
  res.json({ ok: true });
});

auth.post("/password", authenticated, authLimiter, async (req, res) => {
  const b = PasswordBody.parse(req.body);
  const u = (await pool.query("SELECT password_hash FROM users WHERE id=$1", [req.user!.id])).rows[0];
  if (!u?.password_hash || !(await verifyPassword(u.password_hash, b.current)))
    return res.status(422).json({ message: "La contraseña actual no coincide." });
  const ph = await passwordHash(b.password);
  await transaction(async (c) => {
    await c.query("UPDATE users SET password_hash=$1 WHERE id=$2", [ph, req.user!.id]);
    await c.query("DELETE FROM sessions WHERE user_id=$1", [req.user!.id]);
    await audit(c, req.user!.id, "account.password", "user", req.user!.id);
  });
  await issueSession(res, req.user!.id);
  res.json({ ok: true });
});
