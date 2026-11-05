import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { setup, endPool, pool, type Ctx } from "./helpers.js";
import { currentVersion } from "../server/events.js";

let ctx: Ctx;
before(async () => {
  ctx = await setup();
});
after(async () => {
  await ctx.close();
  await endPool();
});

type Emp = { id: string; name: string; level: string; team_id: string | null; state: string; version: number; mobile_access: string; phone: string; job: string };
type Team = { id: string; code: string; name: string; lead_employee_id: string | null; active: boolean; version: number; member_ids: string[] };
type Company = { id: string; name: string; code: string; color: string; active: boolean; version: number; project_count: number; warnings: string[] };

const employees = async () => (await ctx.request<Emp[]>("/employees", "GET", undefined, ctx.office)).data;
const teams = async () => (await ctx.request<Team[]>("/teams", "GET", undefined, ctx.office)).data;
const companies = async () => (await ctx.request<Company[]>("/companies", "GET", undefined, ctx.office)).data;
const byName = <T extends { name: string }>(rows: T[], name: string) => rows.find((r) => r.name === name)!;
const audits = async (entity: string, id: string) =>
  (await pool.query("SELECT action,actor_id,diff FROM audit WHERE entity=$1 AND entity_id=$2 ORDER BY id", [entity, id])).rows;

async function changed(fn: () => Promise<unknown>) {
  const v = currentVersion();
  await fn();
  return currentVersion() > v;
}

// ---------- Permisos ----------

test("las escrituras de equipo exigen cuenta y origen (ROL-02)", async () => {
  const emp = byName(await employees(), "Luis Peña");
  for (const [path, method, body] of [
    ["/employees", "POST", { name: "X", level: "Técnico" }],
    [`/employees/${emp.id}`, "PATCH", { version: emp.version, phone: "809" }],
    ["/teams", "POST", { code: "E9", name: "Equipo 9" }],
    [`/teams/${emp.id}`, "PATCH", { version: 1, name: "X" }],
    ["/companies", "POST", { name: "Nueva", code: "NU", color: "#112233" }],
    [`/companies/${emp.id}`, "PATCH", { version: 1, name: "X" }],
  ] as const) {
    assert.equal((await ctx.request(path, method, body)).status, 401, `${method} ${path} sin sesión`);
    assert.equal((await ctx.request(path, method, body, ctx.office, { Origin: "https://evil.example" })).status, 403, `${method} ${path} otro origen`);
  }
  // Un dispositivo móvil no puede escribir: su cookie no es una sesión de cuenta.
  assert.equal((await ctx.request("/employees", "POST", { name: "X", level: "Técnico" }, "planner_m=abc")).status, 401);
});

// ---------- Empleados (EQP-01, EQP-02, EQP-04, ACC-06) ----------

test("empleados: alta, edición, versión y validación", async () => {
  assert.equal((await ctx.request("/employees", "POST", { name: "", level: "Técnico" }, ctx.office)).status, 422);
  assert.equal((await ctx.request("/employees", "POST", { name: "Ana", level: "Jefe" }, ctx.office)).status, 422);
  assert.equal((await ctx.request("/employees", "POST", { name: "Ana", level: "Técnico", phone: "llamar" }, ctx.office)).status, 422);

  const e1 = byName(await teams(), "Equipo 1");
  const wrote = await changed(async () => {
    const r = await ctx.request<Emp>("/employees", "POST", { name: "Nuevo Técnico", job: "Instalador", level: "Técnico", team_id: e1.id, phone: "809-555-0199" }, ctx.office);
    assert.equal(r.status, 201);
    assert.equal(r.data.state, "Activo");
    assert.equal(r.data.team_id, e1.id);
    assert.equal(r.data.mobile_access, "none");
    assert.equal(r.data.version, 1);
  });
  assert.ok(wrote, "publishChange tras crear");

  const created = byName(await employees(), "Nuevo Técnico");
  assert.equal((await ctx.request("/employees", "POST", { name: "Sin equipo", level: "Ayudante", team_id: crypto.randomUUID() }, ctx.office)).status, 422);

  // PATCH parcial: lo que no se envía no cambia (ni job ni estado).
  const wrotePatch = await changed(async () => {
    const r = await ctx.request<Emp>(`/employees/${created.id}`, "PATCH", { version: created.version, level: "Ayudante" }, ctx.admin);
    assert.equal(r.status, 200);
    assert.equal(r.data.level, "Ayudante");
    assert.equal(r.data.job, "Instalador");
    assert.equal(r.data.phone, "809-555-0199");
    assert.equal(r.data.version, 2);
  });
  assert.ok(wrotePatch, "publishChange tras editar");

  // Versión vieja: 409 y nada cambia.
  const stale = await ctx.request(`/employees/${created.id}`, "PATCH", { version: created.version, phone: "809-000-0000" }, ctx.office);
  assert.equal(stale.status, 409);
  assert.equal(byName(await employees(), "Nuevo Técnico").phone, "809-555-0199");

  assert.equal((await ctx.request(`/employees/${created.id}`, "PATCH", { phone: "1" }, ctx.office)).status, 422, "falta version");
  assert.equal((await ctx.request(`/employees/${crypto.randomUUID()}`, "PATCH", { version: 1, phone: "1" }, ctx.office)).status, 404);
  assert.equal((await ctx.request(`/employees/${created.id}`, "PATCH", { version: 2, state: "Jubilado" }, ctx.office)).status, 422);

  // Auditoría (HIS-01).
  const log = await audits("employee", created.id);
  assert.deepEqual(log.map((x) => x.action), ["employee.create", "employee.update"]);
  assert.equal(log[0].actor_id, ctx.officeId);
  assert.equal(log[1].actor_id, ctx.adminId);
  assert.deepEqual(log[1].diff, { level: ["Técnico", "Ayudante"] });
});

test("empleados: cambiar de equipo lo mueve (EQP-04)", async () => {
  const [e1, e2] = [byName(await teams(), "Equipo 1"), byName(await teams(), "Equipo 2")];
  const luis = byName(await employees(), "Luis Peña");
  assert.equal(luis.team_id, e1.id);
  const moved = await ctx.request<Emp>(`/employees/${luis.id}`, "PATCH", { version: luis.version, team_id: e2.id }, ctx.office);
  assert.equal(moved.status, 200);
  assert.equal(moved.data.team_id, e2.id);
  const all = await teams();
  assert.ok(all.find((t) => t.id === e2.id)!.member_ids.includes(luis.id));
  assert.ok(!all.find((t) => t.id === e1.id)!.member_ids.includes(luis.id));
  assert.deepEqual((await audits("employee", luis.id)).at(-1)!.diff, { team_id: [e1.id, e2.id] });

  const none = await ctx.request<Emp>(`/employees/${luis.id}`, "PATCH", { version: moved.data.version, team_id: null }, ctx.office);
  assert.equal(none.data.team_id, null);
  assert.equal((await ctx.request(`/employees/${luis.id}`, "PATCH", { version: none.data.version, team_id: crypto.randomUUID() }, ctx.office)).status, 422);
});

test("empleados: no se puede bajar de nivel a un encargado de equipo", async () => {
  const ramon = byName(await employees(), "Ramón Tejada");
  const r = await ctx.request(`/employees/${ramon.id}`, "PATCH", { version: ramon.version, level: "Técnico" }, ctx.office);
  assert.equal(r.status, 422);
  assert.match(r.data.message, /encargado de Equipo 1/);
  assert.equal(byName(await employees(), "Ramón Tejada").level, "Encargado");
});

test("empleados: pasar a De baja revoca el enlace móvil y los dispositivos (ACC-06)", async () => {
  const starlin = byName(await employees(), "Starlin Reyes");
  const other = byName(await employees(), "Wander Ortiz");
  const insertLink = async (employeeId: string) => {
    const linkId = crypto.randomUUID();
    await pool.query("INSERT INTO access_links(id,kind,name,employee_id,active,token_hash) VALUES($1,'mobile','Móvil',$2,true,$3)", [linkId, employeeId, "hash-" + linkId]);
    await pool.query("INSERT INTO device_sessions(hash,link_id,expires_at) VALUES($1,$2,now()+interval '1 day')", ["dev-" + linkId, linkId]);
    return linkId;
  };
  const link = await insertLink(starlin.id);
  const otherLink = await insertLink(other.id);
  assert.equal(byName(await employees(), "Starlin Reyes").mobile_access, "active");

  const wrote = await changed(async () => {
    const r = await ctx.request<Emp>(`/employees/${starlin.id}`, "PATCH", { version: starlin.version, state: "De baja" }, ctx.office);
    assert.equal(r.status, 200);
    assert.equal(r.data.state, "De baja");
    assert.equal(r.data.mobile_access, "revoked");
  });
  assert.ok(wrote);

  const row = (await pool.query("SELECT active,token_hash FROM access_links WHERE id=$1", [link])).rows[0];
  assert.equal(row.active, false);
  assert.equal(row.token_hash, null);
  assert.equal((await pool.query("SELECT 1 FROM device_sessions WHERE link_id=$1", [link])).rowCount, 0);
  // El enlace de otra persona no se toca.
  assert.equal((await pool.query("SELECT active FROM access_links WHERE id=$1", [otherLink])).rows[0].active, true);
  assert.equal((await pool.query("SELECT 1 FROM device_sessions WHERE link_id=$1", [otherLink])).rowCount, 1);

  const log = await audits("access_link", link);
  assert.deepEqual(log.map((x) => x.action), ["access_link.revoke"]);
  assert.equal(log[0].actor_id, ctx.officeId);

  // Vacaciones no revoca.
  const w = byName(await employees(), "Wander Ortiz");
  assert.equal((await ctx.request(`/employees/${w.id}`, "PATCH", { version: w.version, state: "Vacaciones" }, ctx.office)).status, 200);
  assert.equal((await pool.query("SELECT active FROM access_links WHERE id=$1", [otherLink])).rows[0].active, true);
});

// ---------- Equipos (EQP-03, EQP-04, EQP-06) ----------

test("equipos: alta, código único y validación", async () => {
  assert.equal((await ctx.request("/teams", "POST", { code: "X1", name: "Mal" }, ctx.office)).status, 422);
  assert.equal((await ctx.request("/teams", "POST", { code: "E1", name: "Repetido" }, ctx.office)).status, 409);
  const wrote = await changed(async () => {
    const r = await ctx.request<Team>("/teams", "POST", { code: "e4", name: "Equipo 4", color: "#0EA5E9" }, ctx.office);
    assert.equal(r.status, 201);
    assert.equal(r.data.code, "E4");
    assert.deepEqual(r.data.member_ids, []);
    assert.equal(r.data.active, true);
  });
  assert.ok(wrote);
  const e4 = byName(await teams(), "Equipo 4");
  assert.deepEqual((await audits("team", e4.id)).map((x) => x.action), ["team.create"]);

  const ana = byName(await employees(), "Ana Guzmán");
  assert.equal((await ctx.request("/teams", "POST", { code: "E5", name: "Equipo 5", lead_employee_id: ana.id }, ctx.office)).status, 422);
});

test("equipos: member_ids fija exactamente los integrantes y mueve desde otro equipo (EQP-04)", async () => {
  const t = await teams();
  const e3 = byName(t, "Equipo 3");
  const e2 = byName(t, "Equipo 2");
  const emps = await employees();
  const starlin = byName(emps, "Starlin Reyes");
  const manuel = byName(emps, "Manuel Vargas");
  const pedro = byName(emps, "Pedro Almonte");
  const felix = byName(emps, "Félix Santana");
  assert.deepEqual(new Set(e3.member_ids), new Set([starlin.id, manuel.id, pedro.id]));

  // E3 queda con Pedro, Manuel y Félix (viene de E2); Starlin sale.
  const wrote = await changed(async () => {
    const r = await ctx.request<Team>(`/teams/${e3.id}`, "PATCH", { version: e3.version, member_ids: [pedro.id, manuel.id, felix.id] }, ctx.office);
    assert.equal(r.status, 200);
    assert.deepEqual(new Set(r.data.member_ids), new Set([pedro.id, manuel.id, felix.id]));
    assert.equal(r.data.version, e3.version + 1);
  });
  assert.ok(wrote);
  const after = await employees();
  assert.equal(byName(after, "Starlin Reyes").team_id, null);
  assert.equal(byName(after, "Félix Santana").team_id, e3.id);
  assert.ok(!(await teams()).find((x) => x.id === e2.id)!.member_ids.includes(felix.id));

  const log = await audits("team", e3.id);
  assert.equal(log.at(-1)!.action, "team.update");
  assert.deepEqual(new Set(log.at(-1)!.diff.member_ids[1]), new Set([pedro.id, manuel.id, felix.id]));
  assert.deepEqual((await audits("employee", felix.id)).at(-1)!.diff, { team_id: [e2.id, e3.id] });

  // Versión vieja, integrante inexistente y vaciar el equipo.
  assert.equal((await ctx.request(`/teams/${e3.id}`, "PATCH", { version: e3.version, name: "Otro" }, ctx.office)).status, 409);
  const fresh = byName(await teams(), "Equipo 3");
  assert.equal((await ctx.request(`/teams/${e3.id}`, "PATCH", { version: fresh.version, member_ids: [crypto.randomUUID()] }, ctx.office)).status, 422);
  const empty = await ctx.request<Team>(`/teams/${e3.id}`, "PATCH", { version: fresh.version, member_ids: [] }, ctx.office);
  assert.deepEqual(empty.data.member_ids, []);
  assert.equal(byName(await employees(), "Pedro Almonte").team_id, null);
  // Devolvemos a Starlin y Manuel a E3 para no afectar otras pruebas.
  const back = await ctx.request<Team>(`/teams/${e3.id}`, "PATCH", { version: empty.data.version, member_ids: [starlin.id, manuel.id, pedro.id] }, ctx.office);
  assert.equal(back.data.member_ids.length, 3);
});

test("equipos: el encargado debe ser Encargado o Supervisor", async () => {
  const e1 = byName(await teams(), "Equipo 1");
  const emps = await employees();
  const bad = await ctx.request(`/teams/${e1.id}`, "PATCH", { version: e1.version, lead_employee_id: byName(emps, "Luis Peña").id }, ctx.office);
  assert.equal(bad.status, 422);
  assert.match(bad.data.message, /pueda liderar equipos \(Supervisor y Encargado\)/);
  assert.equal((await ctx.request(`/teams/${e1.id}`, "PATCH", { version: e1.version, lead_employee_id: crypto.randomUUID() }, ctx.office)).status, 422);
  assert.equal(byName(await teams(), "Equipo 1").lead_employee_id, byName(emps, "Ramón Tejada").id);

  const sup = byName(emps, "Miguel Fermín");
  const ok = await ctx.request<Team>(`/teams/${e1.id}`, "PATCH", { version: e1.version, lead_employee_id: sup.id }, ctx.office);
  assert.equal(ok.status, 200);
  assert.equal(ok.data.lead_employee_id, sup.id);
  const none = await ctx.request<Team>(`/teams/${e1.id}`, "PATCH", { version: ok.data.version, lead_employee_id: byName(emps, "Ramón Tejada").id }, ctx.office);
  assert.equal(none.status, 200);
});

test("equipos: no se desactiva con obras activas (EQP-06)", async () => {
  const e1 = byName(await teams(), "Equipo 1");
  const blocked = await ctx.request(`/teams/${e1.id}`, "PATCH", { version: e1.version, active: false }, ctx.office);
  assert.equal(blocked.status, 422);
  assert.match(blocked.data.message, /Colegio Arcoíris/);
  assert.equal(byName(await teams(), "Equipo 1").active, true);

  // Un equipo sin obras sí se desactiva y se reactiva.
  const e4 = byName(await teams(), "Equipo 4");
  const off = await ctx.request<Team>(`/teams/${e4.id}`, "PATCH", { version: e4.version, active: false }, ctx.office);
  assert.equal(off.status, 200);
  assert.equal(off.data.active, false);
  const on = await ctx.request<Team>(`/teams/${e4.id}`, "PATCH", { version: off.data.version, active: true, name: "Equipo Cuatro" }, ctx.office);
  assert.equal(on.data.name, "Equipo Cuatro");
  assert.deepEqual((await audits("team", e4.id)).map((x) => x.action), ["team.create", "team.update", "team.update"]);

  // Una obra archivada o terminada no cuenta: E2 tiene "Lácteos del Valle" terminada y obras activas; archivamos las activas.
  const e2 = byName(await teams(), "Equipo 2");
  await pool.query(
    "UPDATE projects SET archived=true WHERE team_id=$1 AND status_id IN (SELECT id FROM statuses WHERE kind IN ('programado','en_obra'))",
    [e2.id],
  );
  assert.equal((await ctx.request(`/teams/${e2.id}`, "PATCH", { version: e2.version, active: false }, ctx.office)).status, 200);
  await pool.query("UPDATE projects SET archived=false WHERE team_id=$1", [e2.id]);
  await pool.query("UPDATE teams SET active=true WHERE id=$1", [e2.id]);
});

// ---------- Empresas (EQP-05, EQP-06) ----------

test("empresas: alta, avisos de color y sigla única (EQP-05)", async () => {
  assert.equal((await ctx.request("/companies", "POST", { name: "Mal", code: "ABC", color: "#112233" }, ctx.office)).status, 422);
  assert.equal((await ctx.request("/companies", "POST", { name: "Mal", code: "MA", color: "rojo" }, ctx.office)).status, 422);

  // Sin avisos con un color lejano.
  const wrote = await changed(async () => {
    const r = await ctx.request<Company>("/companies", "POST", { name: "Solaris", code: "so", color: "#0F172A" }, ctx.office);
    assert.equal(r.status, 201);
    assert.equal(r.data.code, "SO");
    assert.deepEqual(r.data.warnings, []);
    assert.equal(r.data.project_count, 0);
  });
  assert.ok(wrote);

  // Cerca del naranja de la marca #EA6A1F: avisa pero guarda.
  const near = await ctx.request<Company>("/companies", "POST", { name: "Naranjas", code: "NA", color: "#E86B20" }, ctx.office);
  assert.equal(near.status, 201);
  assert.ok(near.data.warnings.length >= 1);
  assert.match(near.data.warnings[0], /naranja de la marca/);

  // Cerca de otra empresa (Electsun #0EA5E9).
  const clash = await ctx.request<Company>("/companies", "POST", { name: "Celestes", code: "CE", color: "#10A6EA" }, ctx.office);
  assert.equal(clash.status, 201);
  assert.match(clash.data.warnings.join(" "), /Electsun/);

  // Sigla y nombre duplicados.
  const dupCode = await ctx.request("/companies", "POST", { name: "Otra", code: "EL", color: "#334455" }, ctx.office);
  assert.equal(dupCode.status, 409);
  assert.match(dupCode.data.message, /Electsun/);
  assert.equal((await ctx.request("/companies", "POST", { name: "solaris", code: "ZZ", color: "#334455" }, ctx.office)).status, 409);

  assert.deepEqual((await audits("company", near.data.id)).map((x) => x.action), ["company.create"]);
});

test("empresas: edición, versión, color y sigla en PATCH", async () => {
  const solaris = byName(await companies(), "Solaris");
  const colored = await ctx.request<Company>(`/companies/${solaris.id}`, "PATCH", { version: solaris.version, color: "#eb6b20" }, ctx.admin);
  assert.equal(colored.status, 200);
  assert.equal(colored.data.color, "#EB6B20");
  assert.match(colored.data.warnings[0], /naranja de la marca/);

  const renamed = await ctx.request<Company>(`/companies/${solaris.id}`, "PATCH", { version: colored.data.version, name: "Solaris RD", color: "#0F172A" }, ctx.office);
  assert.deepEqual(renamed.data.warnings, []);
  assert.equal(renamed.data.name, "Solaris RD");

  assert.equal((await ctx.request(`/companies/${solaris.id}`, "PATCH", { version: solaris.version, name: "Vieja" }, ctx.office)).status, 409);
  assert.equal((await ctx.request(`/companies/${solaris.id}`, "PATCH", { version: renamed.data.version, code: "CO" }, ctx.office)).status, 409);
  assert.equal((await ctx.request(`/companies/${solaris.id}`, "PATCH", { version: renamed.data.version, code: "S1" }, ctx.office)).status, 200);
  assert.equal((await ctx.request(`/companies/${crypto.randomUUID()}`, "PATCH", { version: 1, name: "X" }, ctx.office)).status, 404);

  const log = await audits("company", solaris.id);
  assert.deepEqual(log.map((x) => x.action), ["company.create", "company.update", "company.update", "company.update"]);
  assert.deepEqual(log[1].diff, { color: ["#0F172A", "#EB6B20"] });
});

test("empresas: no se desactiva con proyectos sin archivar (EQP-06)", async () => {
  const compusol = byName(await companies(), "Compusol");
  assert.ok(compusol.project_count > 0);
  const blocked = await ctx.request(`/companies/${compusol.id}`, "PATCH", { version: compusol.version, active: false }, ctx.office);
  assert.equal(blocked.status, 422);
  assert.match(blocked.data.message, /sin archivar/);
  assert.equal(byName(await companies(), "Compusol").active, true);

  // Sin proyectos sí; con todos archivados también.
  const solaris = byName(await companies(), "Solaris RD");
  const off = await ctx.request<Company>(`/companies/${solaris.id}`, "PATCH", { version: solaris.version, active: false }, ctx.office);
  assert.equal(off.status, 200);
  assert.equal(off.data.active, false);

  await pool.query("UPDATE projects SET archived=true WHERE company_id=$1", [compusol.id]);
  const archived = byName(await companies(), "Compusol");
  assert.equal(archived.project_count, 0);
  assert.equal((await ctx.request(`/companies/${compusol.id}`, "PATCH", { version: archived.version, active: false }, ctx.office)).status, 200);
  await pool.query("UPDATE projects SET archived=false WHERE company_id=$1", [compusol.id]);
  await pool.query("UPDATE companies SET active=true WHERE id=$1", [compusol.id]);
});

// ---------- Niveles y roles con vigencia (NIV-01, EQP-01b, EQP-03b, ACC-06) ----------

type LevelRow = {
  id: string;
  code: string;
  name: string;
  group_label: string;
  sort: number;
  can_lead_team: boolean;
  is_supervisor: boolean;
  can_use_mobile: boolean;
  is_field: boolean;
  active: boolean;
  version: number;
  person_count: number;
};
type EmpFull = Emp & {
  roles: { id: string; level_id: string; level: string; team_id: string | null; starts_on: string; ends_on: string | null; note: string }[];
};

const levels = async () => (await ctx.request<LevelRow[]>("/levels", "GET", undefined, ctx.office)).data;
const fullEmployees = async () => (await ctx.request<EmpFull[]>("/employees", "GET", undefined, ctx.office)).data;

test("niveles: CRUD en /api/levels, 403 para office, bloqueo de Oficina y sincronización de nombre (NIV-01, ROL-02)", async () => {
  const initial = await levels();
  assert.equal(initial.length, 5);
  assert.ok(initial.some((l) => l.code === "tecnico" && l.person_count > 0));

  // Office puede leer pero recibe 403 al escribir.
  assert.equal((await ctx.request("/levels", "POST", { name: "Jefe de obra" }, ctx.office)).status, 403);
  assert.equal((await ctx.request(`/levels/${initial[0].id}`, "PATCH", { version: initial[0].version, name: "Otro" }, ctx.office)).status, 403);

  // Admin crea un nivel nuevo; código automático y unicidad por nombre sin distinguir mayúsculas.
  const created = await ctx.request<LevelRow>(
    "/levels",
    "POST",
    { name: "Jefe de obra", group_label: "Jefes de obra", icon: "flag", can_lead_team: true, can_use_mobile: true, is_field: true },
    ctx.admin,
  );
  assert.equal(created.status, 201);
  assert.equal(created.data.code, "jefe_de_obra");
  assert.equal(created.data.can_lead_team, true);
  assert.equal((await ctx.request("/levels", "POST", { name: "jefe de obra" }, ctx.admin)).status, 409);

  // El nivel «Oficina» solo permite cambiar `sort`, no nombre ni permisos ni desactivarlo.
  const oficina = byName(await levels(), "Oficina");
  assert.equal((await ctx.request(`/levels/${oficina.id}`, "PATCH", { version: oficina.version, name: "Administración" }, ctx.admin)).status, 422);
  assert.equal((await ctx.request(`/levels/${oficina.id}`, "PATCH", { version: oficina.version, active: false }, ctx.admin)).status, 422);

  // Renombrar un nivel actualiza `employees.level` en los empleados que lo tienen como principal.
  const ayudante = byName(await levels(), "Ayudante");
  const ren = await ctx.request<LevelRow>(`/levels/${ayudante.id}`, "PATCH", { version: ayudante.version, name: "Auxiliar" }, ctx.admin);
  assert.equal(ren.status, 200);
  assert.equal(byName(await employees(), "Manuel Vargas").level, "Auxiliar");
  const back = await ctx.request<LevelRow>(`/levels/${ayudante.id}`, "PATCH", { version: ren.data.version, name: "Ayudante" }, ctx.admin);
  assert.equal(back.status, 200);
  assert.equal(byName(await employees(), "Manuel Vargas").level, "Ayudante");
});

test("niveles: no desactivar nivel en uso ni dejar un equipo activo sin encargado (NIV-01)", async () => {
  const tecnico = byName(await levels(), "Técnico");
  const offUsed = await ctx.request(`/levels/${tecnico.id}`, "PATCH", { version: tecnico.version, active: false }, ctx.admin);
  assert.equal(offUsed.status, 422);
  assert.match(offUsed.data.message, /único nivel vigente/);

  const encargado = byName(await levels(), "Encargado");
  const noLead = await ctx.request(`/levels/${encargado.id}`, "PATCH", { version: encargado.version, can_lead_team: false }, ctx.admin);
  assert.equal(noLead.status, 422);
  assert.match(noLead.data.message, /se quedaría sin encargado/);
});

test("roles múltiples y vigencia: Técnico + Encargado puede liderar y la vigencia resuelve el encargado de hoy (EQP-01b, EQP-03b)", async () => {
  const lvls = await levels();
  const tecLvl = byName(lvls, "Técnico");
  const encLvl = byName(lvls, "Encargado");
  const e4 = byName(await teams(), "Equipo Cuatro");
  const luis = byName(await fullEmployees(), "Luis Peña");

  // Luis Peña recibe dos roles simultáneos hoy: Técnico + Encargado de E4 con vigencia, y un encargo futuro tras vencer el primero.
  const patch = await ctx.request<EmpFull>(
    `/employees/${luis.id}`,
    "PATCH",
    {
      version: luis.version,
      roles: [
        { id: luis.roles[0].id, level_id: tecLvl.id, team_id: null, starts_on: "2026-07-01", ends_on: null, note: "" },
        { level_id: encLvl.id, team_id: e4.id, starts_on: "2026-10-20", ends_on: "2026-11-15", note: "Suplencia" },
      ],
    },
    ctx.office,
  );
  assert.equal(patch.status, 200);
  // Su nivel principal pasa a ser el de mayor jerarquía (Encargado) y E4 lo resuelve como encargado hoy.
  assert.equal(patch.data.level, "Encargado");
  assert.equal(byName(await teams(), "Equipo Cuatro").lead_employee_id, luis.id);

  // Otro empleado no puede solapar encargo del mismo equipo en las mismas fechas.
  const kelvin = byName(await fullEmployees(), "Kelvin Rosario");
  const overlap = await ctx.request(
    `/employees/${kelvin.id}`,
    "PATCH",
    {
      version: kelvin.version,
      roles: [
        { id: kelvin.roles[0].id, level_id: tecLvl.id, team_id: null, starts_on: "2026-07-01", ends_on: null, note: "" },
        { level_id: encLvl.id, team_id: e4.id, starts_on: "2026-11-01", ends_on: "2026-11-20", note: "" },
      ],
    },
    ctx.office,
  );
  assert.equal(overlap.status, 422);
  assert.match(overlap.data.message, /ya tiene a Luis Peña como encargado/);

  // Si empieza después del 15 nov (sin cruce), sí se guarda; hoy el encargado sigue siendo Luis Peña.
  const futureLead = await ctx.request<EmpFull>(
    `/employees/${kelvin.id}`,
    "PATCH",
    {
      version: kelvin.version,
      roles: [
        { id: kelvin.roles[0].id, level_id: tecLvl.id, team_id: null, starts_on: "2026-07-01", ends_on: null, note: "" },
        { level_id: encLvl.id, team_id: e4.id, starts_on: "2026-11-16", ends_on: null, note: "Relevo" },
      ],
    },
    ctx.office,
  );
  assert.equal(futureLead.status, 200);
  assert.equal(byName(await teams(), "Equipo Cuatro").lead_employee_id, luis.id);
});

test("quitar can_use_mobile o pasar a un nivel sin móvil revoca el enlace móvil (NIV-01, ACC-06)", async () => {
  // No se puede crear enlace móvil para un empleado de Oficina (can_use_mobile = false).
  const ana = byName(await fullEmployees(), "Ana Guzmán");
  const denied = await ctx.request("/access-links", "POST", { kind: "mobile", employee_id: ana.id }, ctx.admin);
  assert.equal(denied.status, 422);
  assert.match(denied.data.message, /no tiene acceso móvil/);

  // Creamos un empleado con el nivel «Jefe de obra» (tiene can_use_mobile = true), le damos enlace móvil y luego quitamos can_use_mobile al nivel.
  const jefeLvl = byName(await levels(), "Jefe de obra");
  const emp = (await ctx.request<EmpFull>("/employees", "POST", { name: "Dario Móvil", level: "Jefe de obra" }, ctx.office)).data;
  const link = await ctx.request<{ link: { id: string } }>("/access-links", "POST", { kind: "mobile", employee_id: emp.id }, ctx.admin);
  assert.equal(link.status, 201);
  assert.equal(byName(await employees(), "Dario Móvil").mobile_access, "active");

  const offMobile = await ctx.request<LevelRow>(
    `/levels/${jefeLvl.id}`,
    "PATCH",
    { version: jefeLvl.version, can_use_mobile: false },
    ctx.admin,
  );
  assert.equal(offMobile.status, 200);
  assert.equal(byName(await employees(), "Dario Móvil").mobile_access, "revoked");
});

