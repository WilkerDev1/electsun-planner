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
const dummyHash = passwordHash("planner-sin-cuenta-" + Math.random());

// Las pruebas de extremo a extremo (NODE_ENV=e2e) inician sesión muchas veces desde la misma IP: ahí el tope sube.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === "e2e" ? 200 : 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Demasiados intentos. Espera 15 minutos." },
});

auth.get("/me", (req, res) => {
  const body: Me = { user: req.user ?? null, today: serverToday() };
  res.json(body);
});

/** Tope por cuenta, además del de IP: rotar IPs no sirve para probar contraseñas de una misma cuenta. */
const accountLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => "acct:" + String(req.body?.email ?? "").toLowerCase().slice(0, 200),
  message: { message: "Demasiados intentos para esta cuenta. Espera una hora o pide un restablecimiento." },
});

auth.post("/login", authLimiter, accountLimiter, async (req, res) => {
  const b = LoginBody.parse(req.body);
  const u = (await pool.query("SELECT id,password_hash FROM users WHERE email=$1 AND active", [b.email.toLowerCase()])).rows[0];
  // Sin cuenta también se verifica contra un hash, para no delatar por tiempo qué correos existen (AUT-01).
  const ok = await verifyPassword(u?.password_hash ?? (await dummyHash), b.password);
  if (!u?.password_hash || !ok)
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
  // Comprobar el token antes de calcular argon2: un token falso no debe costar CPU.
  const pending = await pool.query("SELECT 1 FROM invitations WHERE hash=$1 AND used_at IS NULL AND expires_at>now()", [hash(b.token)]);
  if (!pending.rowCount) throw httpError(422, "El enlace expiró o ya fue utilizado. Pide otro a administración.");
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
