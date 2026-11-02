import { Router } from "express";
import { pool, transaction, httpError } from "../db.js";
import { admin, authenticated, hash, token } from "../auth.js";
import { audit, diffOf } from "../audit.js";
import { id } from "../../shared/contracts/common.js";
import { CreateAccountBody, PatchAccountBody, type Account, type ActivationLink } from "../../shared/contracts/auth.js";

// F1·A — Cuentas (AUT-03..08). Solo administración (ROL-02).
export const accounts = Router();
accounts.use(authenticated, admin);

const INVITE_HOURS = 48;
const RESET_HOURS = 2;

const ACCOUNT_COLUMNS = "id,name,email,role,active,(password_hash IS NOT NULL) AS registered,created_at";

accounts.get("/", async (_req, res) => {
  const r = await pool.query(`SELECT ${ACCOUNT_COLUMNS} FROM users ORDER BY created_at, name`);
  res.json(r.rows as Account[]);
});

/** Invita: crea la cuenta sin contraseña y un enlace de 48 h (AUT-03). */
accounts.post("/", async (req, res) => {
  const b = CreateAccountBody.parse(req.body);
  const email = b.email.toLowerCase();
  const t = token();
  const userId = await transaction(async (c) => {
    const dup = await c.query("SELECT 1 FROM users WHERE email=$1", [email]);
    if (dup.rowCount) throw httpError(409, "Ya existe una cuenta con ese correo.");
    const u = await c.query("INSERT INTO users(id,name,email,role) VALUES(gen_random_uuid(),$1,$2,$3) RETURNING id", [
      b.name,
      email,
      b.role,
    ]);
    const uid = u.rows[0].id as string;
    await c.query(
      "INSERT INTO invitations(hash,user_id,kind,expires_at) VALUES($1,$2,'invite',now()+make_interval(hours=>$3))",
      [hash(t), uid, INVITE_HOURS],
    );
    await audit(c, req.user!.id, "account.invite", "user", uid, { name: [null, b.name], email: [null, email], role: [null, b.role] });
    return uid;
  });
  const body: ActivationLink = { id: userId, activationPath: `/activar#${t}` };
  res.status(201).json(body);
});

/** Cambia el rol o activa/desactiva. Cierra las sesiones de esa cuenta (AUT-06). */
accounts.patch("/:id", async (req, res) => {
  const userId = id.parse(req.params.id);
  const b = PatchAccountBody.partial().parse(req.body);
  if (b.role === undefined && b.active === undefined) throw httpError(422, "No hay cambios que aplicar.");
  const self = userId === req.user!.id;
  if (self && ((b.role !== undefined && b.role !== "admin") || b.active === false))
    throw httpError(422, "No puedes quitarte tu propio acceso de administración ni desactivar tu cuenta.");
  const out = await transaction(async (c) => {
    const before = (await c.query(`SELECT ${ACCOUNT_COLUMNS} FROM users WHERE id=$1 FOR UPDATE`, [userId])).rows[0];
    if (!before) throw httpError(404, "La cuenta no existe.");
    const next = { role: b.role ?? before.role, active: b.active ?? before.active };
    const diff = diffOf(before, next, ["role", "active"]);
    if (Object.keys(diff).length) {
      await c.query("UPDATE users SET role=$1,active=$2 WHERE id=$3", [next.role, next.active, userId]);
      await c.query("DELETE FROM sessions WHERE user_id=$1", [userId]);
      await audit(c, req.user!.id, "account.update", "user", userId, diff);
    }
    return (await c.query(`SELECT ${ACCOUNT_COLUMNS} FROM users WHERE id=$1`, [userId])).rows[0] as Account;
  });
  res.json(out);
});

/** Genera un enlace de restablecimiento de 2 h y anula las invitaciones pendientes (AUT-04). */
accounts.post("/:id/reset", async (req, res) => {
  const userId = id.parse(req.params.id);
  const t = token();
  await transaction(async (c) => {
    const u = (await c.query("SELECT active FROM users WHERE id=$1 FOR UPDATE", [userId])).rows[0];
    if (!u) throw httpError(404, "La cuenta no existe.");
    if (!u.active) throw httpError(422, "La cuenta está desactivada. Actívala antes de restablecerla.");
    await c.query("UPDATE invitations SET used_at=now() WHERE user_id=$1 AND used_at IS NULL", [userId]);
    await c.query(
      "INSERT INTO invitations(hash,user_id,kind,expires_at) VALUES($1,$2,'reset',now()+make_interval(hours=>$3))",
      [hash(t), userId, RESET_HOURS],
    );
    await audit(c, req.user!.id, "account.reset_link", "user", userId);
  });
  const body: ActivationLink = { id: userId, activationPath: `/activar#${t}` };
  res.json(body);
});
