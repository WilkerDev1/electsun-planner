import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { setup, endPool, cookieFrom, pool, PASSWORD, type Ctx } from "./helpers.js";

// F1·A — Cuentas y acceso (AUT-03..09, ACC-01..07, ROL-01..03).
// El límite de intentos (AUT-07) cuenta cada llamada a login/accept/password por IP: mantén el total por debajo de 20.

let ctx: Ctx;
before(async () => {
  ctx = await setup();
});
after(async () => {
  await ctx.close();
  await endPool();
});

const NEW_PASSWORD = "una-clave-larga-123";
const tokenOf = (activationPath: string) => activationPath.split("#")[1];
const auditCount = async (action: string, entityId: string) =>
  Number((await pool.query("SELECT count(*) FROM audit WHERE action=$1 AND entity_id=$2", [action, entityId])).rows[0].count);

/** Abre un flujo SSE y deja leer sus mensajes; `close()` corta la conexión. */
async function openStream(path: string, cookie: string) {
  const ac = new AbortController();
  const r = await fetch(ctx.base + "/api" + path, { headers: cookie ? { Cookie: cookie } : {}, signal: ac.signal });
  const reader = r.body?.getReader();
  const decoder = new TextDecoder();
  let seen = "";
  return {
    status: r.status,
    type: r.headers.get("content-type") ?? "",
    /** Lee hasta que el texto recibido contenga `needle`. */
    async until(needle: string, ms = 3000) {
      const deadline = Date.now() + ms;
      while (!seen.includes(needle) && Date.now() < deadline && reader) {
        const chunk = await Promise.race([reader.read(), new Promise<null>((resolve) => setTimeout(() => resolve(null), 200))]);
        if (chunk && !chunk.done) seen += decoder.decode(chunk.value);
      }
      return seen;
    },
    close() {
      ac.abort();
    },
  };
}

// ---------- Cuentas ----------

let carla = { id: "", email: "carla@example.test", cookie: "" };

test("invitar y aceptar; el enlace no se puede usar dos veces (AUT-03)", async () => {
  assert.equal((await ctx.request("/accounts")).status, 401);

  const bad = await ctx.request("/accounts", "POST", { name: "Carla", email: "no-es-correo", role: "office" }, ctx.admin);
  assert.equal(bad.status, 422);
  const badRole = await ctx.request("/accounts", "POST", { name: "Carla", email: carla.email, role: "root" }, ctx.admin);
  assert.equal(badRole.status, 422);

  const invite = await ctx.request("/accounts", "POST", { name: "Carla Ficticia", email: "Carla@Example.test", role: "office" }, ctx.admin);
  assert.equal(invite.status, 201);
  assert.match(invite.data.activationPath, /^\/activar#[A-Za-z0-9_-]{40,}$/);
  carla.id = invite.data.id;

  const dup = await ctx.request("/accounts", "POST", { name: "Otra", email: carla.email, role: "office" }, ctx.admin);
  assert.equal(dup.status, 409);

  const list = await ctx.request("/accounts", "GET", undefined, ctx.admin);
  assert.equal(list.status, 200);
  const row = list.data.find((a: { id: string }) => a.id === carla.id);
  assert.deepEqual(
    { name: row.name, email: row.email, role: row.role, active: row.active, registered: row.registered },
    { name: "Carla Ficticia", email: carla.email, role: "office", active: true, registered: false },
  );
  assert.equal(JSON.stringify(list.data).includes("password"), false);
  // Sin contraseña no se puede entrar.
  assert.equal((await ctx.request("/auth/login", "POST", { email: carla.email, password: PASSWORD })).status, 401);

  // La invitación dura 48 h y solo se guarda su hash.
  const inv = (await pool.query("SELECT kind,expires_at-now() < interval '48 hours' AS under, expires_at-now() > interval '47 hours' AS over, hash FROM invitations WHERE user_id=$1", [carla.id])).rows;
  assert.equal(inv.length, 1);
  assert.deepEqual([inv[0].kind, inv[0].under, inv[0].over], ["invite", true, true]);
  assert.notEqual(inv[0].hash, tokenOf(invite.data.activationPath));

  const token = tokenOf(invite.data.activationPath);
  assert.equal((await ctx.request("/auth/accept", "POST", { token, name: "Carla", password: "corta" })).status, 422);
  const ok = await ctx.request("/auth/accept", "POST", { token, name: "Carla Gómez", password: NEW_PASSWORD });
  assert.equal(ok.status, 200);
  carla.cookie = cookieFrom(ok.headers, "planner_session");
  const me = await ctx.request("/auth/me", "GET", undefined, carla.cookie);
  assert.deepEqual([me.data.user.name, me.data.user.role], ["Carla Gómez", "office"]);

  const again = await ctx.request("/auth/accept", "POST", { token, name: "Intruso", password: NEW_PASSWORD });
  assert.equal(again.status, 422);
  assert.match(again.data.message, /expir|utiliz/);
  const reg = (await ctx.request("/accounts", "GET", undefined, ctx.admin)).data.find((a: { id: string }) => a.id === carla.id);
  assert.deepEqual([reg.name, reg.registered], ["Carla Gómez", true]);

  assert.equal(await auditCount("account.invite", carla.id), 1);
});

test("una invitación vencida no sirve (AUT-03)", async () => {
  const invite = await ctx.request("/accounts", "POST", { name: "Vencida", email: "vencida@example.test", role: "office" }, ctx.admin);
  await pool.query("UPDATE invitations SET expires_at=now()-interval '1 minute' WHERE user_id=$1", [invite.data.id]);
  const r = await ctx.request("/auth/accept", "POST", { token: tokenOf(invite.data.activationPath), name: "Vencida", password: NEW_PASSWORD });
  assert.equal(r.status, 422);
  await pool.query("DELETE FROM users WHERE id=$1", [invite.data.id]);
});

test("restablecer genera un enlace de 2 h que invalida el anterior (AUT-04)", async () => {
  const one = await ctx.request(`/accounts/${carla.id}/reset`, "POST", {}, ctx.admin);
  assert.equal(one.status, 200);
  assert.equal(one.data.id, carla.id);
  assert.match(one.data.activationPath, /^\/activar#/);
  const two = await ctx.request(`/accounts/${carla.id}/reset`, "POST", {}, ctx.admin);
  assert.notEqual(tokenOf(one.data.activationPath), tokenOf(two.data.activationPath));

  const pending = (await pool.query("SELECT kind,expires_at-now() < interval '2 hours' AS under FROM invitations WHERE user_id=$1 AND used_at IS NULL", [carla.id])).rows;
  assert.deepEqual(pending, [{ kind: "reset", under: true }]);

  const old = await ctx.request("/auth/accept", "POST", { token: tokenOf(one.data.activationPath), name: "Carla", password: NEW_PASSWORD });
  assert.equal(old.status, 422);
  const fresh = await ctx.request("/auth/accept", "POST", { token: tokenOf(two.data.activationPath), name: "Carla Gómez", password: "otra-clave-larga-456" });
  assert.equal(fresh.status, 200);
  assert.equal((await ctx.request("/auth/me", "GET", undefined, carla.cookie)).data.user, null, "aceptar el restablecimiento cierra las sesiones previas");
  carla.cookie = cookieFrom(fresh.headers, "planner_session");

  // Una invitación pendiente también queda anulada por un restablecimiento.
  const inv = await ctx.request("/accounts", "POST", { name: "Pendiente", email: "pendiente@example.test", role: "office" }, ctx.admin);
  await ctx.request(`/accounts/${inv.data.id}/reset`, "POST", {}, ctx.admin);
  const dead = await ctx.request("/auth/accept", "POST", { token: tokenOf(inv.data.activationPath), name: "Pendiente", password: NEW_PASSWORD });
  assert.equal(dead.status, 422);

  assert.equal((await ctx.request(`/accounts/${crypto.randomUUID()}/reset`, "POST", {}, ctx.admin)).status, 404);
  assert.equal((await ctx.request("/accounts/no-es-un-id/reset", "POST", {}, ctx.admin)).status, 422);
  assert.equal(await auditCount("account.reset_link", carla.id), 2);
});

test("la oficina recibe 403 en cuentas y enlaces (ROL-02)", async () => {
  const some = crypto.randomUUID();
  const calls: [string, string, unknown?][] = [
    ["/accounts", "GET"],
    ["/accounts", "POST", { name: "X", email: "x@example.test", role: "office" }],
    [`/accounts/${some}`, "PATCH", { active: false }],
    [`/accounts/${some}/reset`, "POST", {}],
    ["/access-links", "GET"],
    ["/access-links", "POST", { kind: "tv", name: "TV" }],
    [`/access-links/${some}/rotate`, "POST", {}],
    [`/access-links/${some}/revoke`, "POST", {}],
  ];
  for (const [path, method, body] of calls) {
    const r = await ctx.request(path, method, body, ctx.office);
    assert.equal(r.status, 403, `${method} ${path}`);
    const anon = await ctx.request(path, method, body);
    assert.equal(anon.status, 401, `${method} ${path} sin sesión`);
  }
});

test("cambiar rol o desactivar cierra las sesiones (AUT-06)", async () => {
  assert.equal((await ctx.request("/auth/me", "GET", undefined, carla.cookie)).data.user.role, "office");

  const role = await ctx.request(`/accounts/${carla.id}`, "PATCH", { role: "admin" }, ctx.admin);
  assert.equal(role.status, 200);
  assert.equal(role.data.role, "admin");
  assert.equal((await ctx.request("/auth/me", "GET", undefined, carla.cookie)).data.user, null, "el cambio de rol cierra la sesión");
  assert.equal((await ctx.request("/accounts", "GET", undefined, carla.cookie)).status, 401);

  const login = await ctx.login(carla.email, "otra-clave-larga-456");
  const off = await ctx.request(`/accounts/${carla.id}`, "PATCH", { active: false, role: "office" }, ctx.admin);
  assert.equal(off.status, 200);
  assert.deepEqual([off.data.active, off.data.role], [false, "office"]);
  assert.equal((await ctx.request("/auth/me", "GET", undefined, login)).data.user, null, "desactivar cierra la sesión");
  assert.equal((await ctx.request("/auth/login", "POST", { email: carla.email, password: "otra-clave-larga-456" })).status, 401);
  assert.equal((await ctx.request(`/accounts/${carla.id}/reset`, "POST", {}, ctx.admin)).status, 422, "no se restablece una cuenta desactivada");

  const on = await ctx.request(`/accounts/${carla.id}`, "PATCH", { active: true }, ctx.admin);
  assert.equal(on.data.active, true);
  assert.equal(await auditCount("account.update", carla.id), 3);
  const diff = (await pool.query("SELECT diff FROM audit WHERE action='account.update' AND entity_id=$1 ORDER BY id LIMIT 1", [carla.id])).rows[0].diff;
  assert.deepEqual(diff, { role: ["office", "admin"] });

  // Sin cambios reales no se audita ni se cierran sesiones.
  const same = await ctx.request(`/accounts/${carla.id}`, "PATCH", { active: true }, ctx.admin);
  assert.equal(same.status, 200);
  assert.equal(await auditCount("account.update", carla.id), 3);

  assert.equal((await ctx.request(`/accounts/${crypto.randomUUID()}`, "PATCH", { active: false }, ctx.admin)).status, 404);
  assert.equal((await ctx.request(`/accounts/${carla.id}`, "PATCH", {}, ctx.admin)).status, 422);
  assert.equal((await ctx.request(`/accounts/${carla.id}`, "PATCH", { role: "dios" }, ctx.admin)).status, 422);
});

test("un administrador no puede quitarse su propio acceso (AUT-06)", async () => {
  const demote = await ctx.request(`/accounts/${ctx.adminId}`, "PATCH", { role: "office" }, ctx.admin);
  assert.equal(demote.status, 422);
  const off = await ctx.request(`/accounts/${ctx.adminId}`, "PATCH", { active: false }, ctx.admin);
  assert.equal(off.status, 422);
  const both = await ctx.request(`/accounts/${ctx.adminId}`, "PATCH", { role: "office", active: false }, ctx.admin);
  assert.equal(both.status, 422);
  const me = await ctx.request("/auth/me", "GET", undefined, ctx.admin);
  assert.deepEqual([me.data.user.role, me.data.user.active], ["admin", true]);
  // Mantener el mismo estado sí es válido.
  assert.equal((await ctx.request(`/accounts/${ctx.adminId}`, "PATCH", { role: "admin", active: true }, ctx.admin)).status, 200);
});

// ---------- Enlaces de TV ----------

let tv = { id: "", token: "", cookie: "" };

test("crear un enlace de TV, canjearlo y abrir el flujo SSE (ACC-01, ACC-02, ACC-04)", async () => {
  assert.equal((await ctx.request("/access-links", "POST", { kind: "tv", name: "" }, ctx.admin)).status, 422);
  assert.equal((await ctx.request("/access-links", "POST", { kind: "otro", name: "TV" }, ctx.admin)).status, 422);
  assert.equal((await ctx.request("/access-links?kind=otro", "GET", undefined, ctx.admin)).status, 422);

  const made = await ctx.request("/access-links", "POST", { kind: "tv", name: "TV de la oficina" }, ctx.admin);
  assert.equal(made.status, 201);
  tv.id = made.data.link.id;
  const m = made.data.path.match(/^\/tv\/([0-9a-f-]{36})#([A-Za-z0-9_-]{43})$/);
  assert.ok(m, made.data.path);
  assert.equal(m[1], tv.id);
  tv.token = m[2];
  assert.deepEqual(
    { kind: made.data.link.kind, name: made.data.link.name, employee_id: made.data.link.employee_id, employee_name: made.data.link.employee_name, active: made.data.link.active, last_seen_at: made.data.link.last_seen_at },
    { kind: "tv", name: "TV de la oficina", employee_id: null, employee_name: null, active: true, last_seen_at: null },
  );

  // Solo se guarda el hash del token.
  const row = (await pool.query("SELECT token_hash FROM access_links WHERE id=$1", [tv.id])).rows[0];
  assert.match(row.token_hash, /^[0-9a-f]{64}$/);
  assert.notEqual(row.token_hash, tv.token);

  const list = await ctx.request("/access-links?kind=tv", "GET", undefined, ctx.admin);
  assert.deepEqual(list.data.map((l: { id: string }) => l.id), [tv.id]);
  assert.equal(JSON.stringify(list.data).includes("token"), false);
  assert.equal((await ctx.request("/access-links?kind=mobile", "GET", undefined, ctx.admin)).data.length, 0);

  // Sin el token correcto no se entra.
  assert.equal((await ctx.request("/access/session", "POST", { id: tv.id, token: "x".repeat(43) })).status, 401);
  assert.equal((await ctx.request("/access/session", "POST", { id: crypto.randomUUID(), token: tv.token })).status, 401);
  assert.equal((await ctx.request("/access/session", "POST", { token: tv.token })).status, 401, "la TV necesita el id");
  assert.equal((await ctx.request("/access/session", "POST", { token: "corto" })).status, 422);

  const redeem = await ctx.request("/access/session", "POST", { id: tv.id, token: tv.token });
  assert.equal(redeem.status, 200);
  assert.deepEqual(redeem.data, { kind: "tv", id: tv.id, redirect: `/tv/${tv.id}` });
  tv.cookie = cookieFrom(redeem.headers, `planner_tv_${tv.id}`);
  assert.ok(tv.cookie);
  const setCookie = redeem.headers.getSetCookie().find((c) => c.startsWith("planner_tv_"))!;
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  assert.match(setCookie, /Max-Age=2592000/);

  const stream = await openStream(`/events?link=${tv.id}`, tv.cookie);
  assert.equal(stream.status, 200);
  assert.match(stream.type, /^text\/event-stream/);
  assert.match(await stream.until("event: ready"), /event: ready/);
  stream.close();

  assert.equal(await auditCount("link.create", tv.id), 1);
});

test("rotar invalida la cookie y el token anteriores (ACC-02)", async () => {
  const rotated = await ctx.request(`/access-links/${tv.id}/rotate`, "POST", {}, ctx.admin);
  assert.equal(rotated.status, 200);
  const m = rotated.data.path.match(/^\/tv\/([0-9a-f-]{36})#([A-Za-z0-9_-]{43})$/);
  assert.ok(m);
  assert.equal(m[1], tv.id);
  assert.notEqual(m[2], tv.token);
  assert.equal((await pool.query("SELECT count(*) FROM device_sessions WHERE link_id=$1", [tv.id])).rows[0].count, "0");

  assert.equal((await ctx.request("/access/session", "POST", { id: tv.id, token: tv.token })).status, 401, "el token viejo ya no canjea");
  const stale = await openStream(`/events?link=${tv.id}`, tv.cookie);
  assert.equal(stale.status, 401, "la cookie vieja ya no sirve");
  stale.close();

  const fresh = await ctx.request("/access/session", "POST", { id: tv.id, token: m[2] });
  assert.equal(fresh.status, 200);
  tv = { id: tv.id, token: m[2], cookie: cookieFrom(fresh.headers, `planner_tv_${tv.id}`) };
  const ok = await openStream(`/events?link=${tv.id}`, tv.cookie);
  assert.equal(ok.status, 200);
  ok.close();

  assert.equal((await ctx.request(`/access-links/${crypto.randomUUID()}/rotate`, "POST", {}, ctx.admin)).status, 404);
  assert.equal(await auditCount("link.rotate", tv.id), 1);
});

test("revocar corta el canje y el flujo SSE, y avisa a los conectados (ACC-03, API-01)", async () => {
  const live = await openStream(`/events?link=${tv.id}`, tv.cookie);
  assert.equal(live.status, 200);
  await live.until("event: ready");

  const revoked = await ctx.request(`/access-links/${tv.id}/revoke`, "POST", {}, ctx.admin);
  assert.equal(revoked.status, 200);
  assert.equal(revoked.data.active, false);
  const row = (await pool.query("SELECT active,token_hash,(SELECT count(*) FROM device_sessions WHERE link_id=$1)::int AS sessions FROM access_links WHERE id=$1", [tv.id])).rows[0];
  assert.deepEqual(row, { active: false, token_hash: null, sessions: 0 });

  assert.match(await live.until("event: change"), /event: change/, "los dispositivos conectados reciben el aviso");
  live.close();

  assert.equal((await ctx.request("/access/session", "POST", { id: tv.id, token: tv.token })).status, 401);
  const again = await openStream(`/events?link=${tv.id}`, tv.cookie);
  assert.ok([401, 403].includes(again.status), String(again.status));
  again.close();

  assert.equal((await ctx.request(`/access-links/${crypto.randomUUID()}/revoke`, "POST", {}, ctx.admin)).status, 404);
  assert.equal(await auditCount("link.revoke", tv.id), 1);

  // Rotar un enlace revocado lo vuelve a activar.
  const back = await ctx.request(`/access-links/${tv.id}/rotate`, "POST", {}, ctx.admin);
  assert.equal(back.data.link.active, true);
  const t = back.data.path.split("#")[1];
  assert.equal((await ctx.request("/access/session", "POST", { id: tv.id, token: t })).status, 200);
});

// ---------- Enlaces móviles ----------

const employeeByName = async (name: string): Promise<string> => (await pool.query("SELECT id FROM employees WHERE name=$1", [name])).rows[0].id;
const employeeRow = async (id: string) => (await ctx.request("/employees", "GET", undefined, ctx.admin)).data.find((e: { id: string }) => e.id === id);

test("el enlace móvil exige un empleado activo (ACC-06)", async () => {
  const baja = await employeeByName("Manuel Vargas");
  await pool.query("UPDATE employees SET state='De baja' WHERE id=$1", [baja]);
  const r = await ctx.request("/access-links", "POST", { kind: "mobile", employee_id: baja }, ctx.admin);
  assert.equal(r.status, 422);
  assert.equal((await pool.query("SELECT count(*) FROM access_links WHERE employee_id=$1", [baja])).rows[0].count, "0");
  assert.equal((await ctx.request("/access-links", "POST", { kind: "mobile", employee_id: crypto.randomUUID() }, ctx.admin)).status, 404);
  assert.equal((await ctx.request("/access-links", "POST", { kind: "mobile" }, ctx.admin)).status, 422);
  assert.equal((await ctx.request("/access-links", "POST", { kind: "mobile", employee_id: "no-es-id" }, ctx.admin)).status, 422);
  await pool.query("UPDATE employees SET state='Activo' WHERE id=$1", [baja]);
});

test("crear, canjear, rotar y revocar el enlace móvil de un empleado (ACC-02, ACC-04, ACC-06)", async () => {
  const luis = await employeeByName("Luis Peña");
  assert.equal((await employeeRow(luis)).mobile_access, "none");

  const made = await ctx.request("/access-links", "POST", { kind: "mobile", employee_id: luis }, ctx.admin);
  assert.equal(made.status, 201);
  assert.equal(made.data.link.name, "Luis Peña", "el nombre toma por defecto el del empleado");
  assert.equal(made.data.link.employee_name, "Luis Peña");
  const linkId = made.data.link.id;
  const m = made.data.path.match(/^\/m\/activar#([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/);
  assert.ok(m, made.data.path);
  assert.equal(m[1], linkId);
  assert.deepEqual([(await employeeRow(luis)).mobile_access, (await employeeRow(luis)).mobile_link_id], ["active", linkId]);

  const mobiles = await ctx.request("/access-links?kind=mobile", "GET", undefined, ctx.admin);
  assert.deepEqual(mobiles.data.map((l: { employee_name: string }) => l.employee_name), ["Luis Peña"]);

  assert.equal((await ctx.request("/access/session", "POST", { token: `${linkId}.${"x".repeat(43)}` })).status, 401);
  assert.equal((await ctx.request("/access/session", "POST", { token: m[2] + "." + m[2] })).status, 401, "formato sin id válido");
  const redeem = await ctx.request("/access/session", "POST", { token: `${m[1]}.${m[2]}` });
  assert.equal(redeem.status, 200);
  assert.deepEqual(redeem.data, { kind: "mobile", id: linkId, redirect: "/m" });
  const cookie = cookieFrom(redeem.headers, "planner_m");
  assert.ok(cookie);
  assert.match(redeem.headers.getSetCookie().find((c) => c.startsWith("planner_m="))!, /Max-Age=7776000/);
  const stream = await openStream("/events", cookie);
  assert.equal(stream.status, 200);
  stream.close();

  // Crear de nuevo rota el mismo enlace: no hay dos por empleado.
  const again = await ctx.request("/access-links", "POST", { kind: "mobile", employee_id: luis, name: "Teléfono de Luis" }, ctx.admin);
  assert.equal(again.status, 200);
  assert.equal(again.data.link.id, linkId);
  assert.equal(again.data.link.name, "Teléfono de Luis");
  assert.equal((await pool.query("SELECT count(*) FROM access_links WHERE employee_id=$1", [luis])).rows[0].count, "1");
  const old = await openStream("/events", cookie);
  assert.equal(old.status, 401, "rotar cierra la sesión del teléfono");
  old.close();
  assert.equal((await ctx.request("/access/session", "POST", { token: `${m[1]}.${m[2]}` })).status, 401);
  const second = again.data.path.match(/^\/m\/activar#([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/);
  assert.ok(second);
  assert.equal((await ctx.request("/access/session", "POST", { token: `${second[1]}.${second[2]}` })).status, 200);

  // Rotar por id y revocar.
  const rot = await ctx.request(`/access-links/${linkId}/rotate`, "POST", {}, ctx.admin);
  assert.match(rot.data.path, /^\/m\/activar#/);
  const revoked = await ctx.request(`/access-links/${linkId}/revoke`, "POST", {}, ctx.admin);
  assert.equal(revoked.data.active, false);
  assert.equal((await employeeRow(luis)).mobile_access, "revoked");
  const rotatedToken = rot.data.path.split("#")[1];
  assert.equal((await ctx.request("/access/session", "POST", { token: rotatedToken })).status, 401);

  // Un empleado que pasa a "De baja" no puede recuperar el enlace.
  await pool.query("UPDATE employees SET state='De baja' WHERE id=$1", [luis]);
  assert.equal((await ctx.request(`/access-links/${linkId}/rotate`, "POST", {}, ctx.admin)).status, 422);
  assert.equal((await ctx.request("/access-links", "POST", { kind: "mobile", employee_id: luis }, ctx.admin)).status, 422);
  await pool.query("UPDATE employees SET state='Activo' WHERE id=$1", [luis]);

  assert.equal(await auditCount("link.create", linkId), 1);
  assert.equal(await auditCount("link.rotate", linkId), 2);
  assert.equal(await auditCount("link.revoke", linkId), 1);
});
