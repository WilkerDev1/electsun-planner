import { useState, type FormEvent } from "react";
import { api, ApiError } from "../../ui/api";
import { Banner, Button, Empty, Field, initials } from "../../ui/components";
import { EMPLOYEE_STATES, fold, shortDate, type EmployeeState, type ISODate, type Level } from "../../../shared/domain";
import type { Employee, EmployeeRoleInput } from "../../../shared/contracts/equipo";
import { MobileAccessCell } from "../cuentas/MobileAccessCell";
import { ICON, STATE_STYLE, isSimple, levelStyle, roleHint, rolesOf, whereToday, type EquipoData, type TabProps } from "./model";
import { Avatar, IconButton, SelectChip, Svg, inputCls } from "./ui";
import { Modal } from "../../ui/Modal";

const GRID = "grid items-center grid-cols-[minmax(240px,1.4fr)_185px_150px_minmax(190px,1fr)_130px_140px_170px_52px]";

export function EmpleadosTab({ data, today, query, save, done, reload }: TabProps) {
  const [levelFilter, setLevelFilter] = useState<"Todos" | string>("Todos");
  const [editing, setEditing] = useState<Employee | "new" | null>(null);
  const q = fold(query);
  const activeLevels = data.levels.filter((l) => l.active);

  const effMap = new Map(data.employees.map((e) => [e.id, rolesOf(e, data, today)]));
  const matchesSearch = (e: Employee) => !q || fold(`${e.name} ${e.job} ${e.phone}`).includes(q);
  // Al filtrar por un nivel, aparecen todas las personas que lo tengan vigente hoy (aunque su nivel principal sea otro).
  const matchesFilter = (e: Employee) => {
    if (levelFilter === "Todos") return true;
    const eff = effMap.get(e.id)!;
    return eff.current.some((r) => r.level.id === levelFilter) || eff.display?.id === levelFilter;
  };

  // En la tabla cada persona aparece UNA vez, en el grupo de su nivel de mayor jerarquía (display).
  const groups = data.levels
    .map((l) => ({
      level: l,
      rows: data.employees.filter((e) => effMap.get(e.id)?.display?.id === l.id && matchesSearch(e) && matchesFilter(e)),
    }))
    .filter((g) => g.rows.length > 0);

  const teamsFor = (e: Employee) => data.teams.filter((t) => t.active || t.id === e.team_id);

  const patch = (e: Employee, body: Partial<Pick<Employee, "level" | "team_id" | "state">>, ok: string) =>
    save(() => api<Employee>(`/employees/${e.id}`, { method: "PATCH", body: { version: e.version, ...body } }), ok);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 pb-3">
        <div role="group" aria-label="Filtrar por nivel" className="flex flex-wrap gap-1.5">
          <button
            type="button"
            aria-pressed={levelFilter === "Todos"}
            onClick={() => setLevelFilter("Todos")}
            className={`h-8 rounded-lg border px-2.5 text-[13px] font-semibold ${levelFilter === "Todos" ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2 hover:bg-fill-2"}`}
          >
            Todos
          </button>
          {activeLevels.map((l) => (
            <button
              key={l.id}
              type="button"
              aria-pressed={levelFilter === l.id}
              onClick={() => setLevelFilter(l.id)}
              className={`h-8 rounded-lg border px-2.5 text-[13px] font-semibold ${levelFilter === l.id ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2 hover:bg-fill-2"}`}
            >
              {l.name}
            </button>
          ))}
        </div>
        <Button variant="primary" className="h-9 rounded-lg" onClick={() => setEditing("new")}>
          <Svg d={ICON.plus} stroke={2.4} /> Nuevo empleado
        </Button>
      </div>

      <div className="overflow-x-auto border-t border-line">
        <div role="table" aria-label="Empleados" className="min-w-[1300px]">
          {groups.length === 0 && (
            <Empty title={data.employees.length ? "Nadie coincide con la búsqueda" : "Todavía no hay empleados"}>
              {data.employees.length ? "Prueba con otro nombre o quita el filtro de nivel." : "Agrega al primero con «Nuevo empleado»."}
            </Empty>
          )}
          {groups.map((g) => {
            const L = levelStyle(g.level);
            return (
              <div key={g.level.id} role="rowgroup">
                <div role="row" className={`${GRID} h-10 border-b border-line bg-fill-2 text-[13px] font-semibold text-muted`}>
                  <span role="columnheader" className="flex items-center gap-2 px-4">
                    <Svg d={L.icon} />
                    <span className="font-bold text-ink">{L.group}</span>
                    <span className="rounded-md bg-line px-[7px] py-px text-xs font-bold text-muted">{g.rows.length}</span>
                  </span>
                  <span role="columnheader" className="px-3">Nivel</span>
                  <span role="columnheader" className="px-3">Equipo</span>
                  <span role="columnheader" className="px-3">Dónde está hoy</span>
                  <span role="columnheader" className="px-3">Estado</span>
                  <span role="columnheader" className="px-3">Teléfono</span>
                  <span role="columnheader" className="px-3">Acceso móvil</span>
                  <span role="columnheader" aria-label="Acciones" />
                </div>
                {g.rows.map((e) => {
                  const S = STATE_STYLE[e.state];
                  const eff = effMap.get(e.id)!;
                  const empStyle = levelStyle(eff.display ?? g.level);
                  const simple = isSimple(eff) && !!eff.display?.active;
                  const extraCount = Math.max(0, eff.current.filter((r) => r.level.active).length - 1);
                  const hint = roleHint(eff, data.teams);
                  const now = whereToday(e, data, today);
                  const team = data.teams.find((t) => t.id === e.team_id);
                  const levelOptions = activeLevels.some((l) => l.name === e.level)
                    ? activeLevels
                    : [...activeLevels, ...(eff.display ? [eff.display] : [])];
                  return (
                    <div key={e.id} role="row" className={`${GRID} h-[60px] border-b border-line text-sm`}>
                      <span role="cell" className="flex min-w-0 items-center gap-3 px-4">
                        <Avatar text={initials(e.name)} bg={empStyle.avBg} fg={empStyle.avFg} presence={S.presence} />
                        <span className="flex min-w-0 flex-col leading-snug">
                          <span className="truncate font-semibold">{e.name}</span>
                          <span className="truncate text-xs text-subtle">{e.job || "Sin oficio"}</span>
                        </span>
                      </span>
                      <span role="cell" className="flex flex-col items-start justify-center gap-0.5 px-3">
                        {simple ? (
                          <SelectChip
                            aria-label={`Nivel de ${e.name}`}
                            value={e.level}
                            fg={empStyle.fg}
                            bg={empStyle.bg}
                            border={empStyle.border}
                            icon={empStyle.icon}
                            onChange={(ev) => void patch(e, { level: ev.target.value as Level }, "Nivel guardado")}
                          >
                            {levelOptions.map((l) => (
                              <option key={l.id} value={l.name}>
                                {l.name}
                              </option>
                            ))}
                          </SelectChip>
                        ) : (
                          <button
                            type="button"
                            aria-label={`${e.level}${extraCount > 0 ? ` +${extraCount}` : ""} · Roles de ${e.name}${hint ? `, ${hint}` : ""}`}
                            onClick={() => setEditing(e)}
                            className="inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-bold hover:opacity-90"
                            style={{ color: empStyle.fg, background: empStyle.bg, border: `1px solid ${empStyle.border}` }}
                          >
                            <Svg d={empStyle.icon} />
                            <span>{e.level}</span>
                            {extraCount > 0 && (
                              <span className="rounded bg-ink/10 px-1 py-px text-[11px] font-extrabold">+{extraCount}</span>
                            )}
                          </button>
                        )}
                        {hint && (
                          <button
                            type="button"
                            onClick={() => setEditing(e)}
                            className="cursor-pointer border-0 bg-transparent p-0 text-left text-[11px] font-semibold text-subtle hover:text-ink hover:underline"
                          >
                            {hint}
                          </button>
                        )}
                      </span>
                      <span role="cell" className="px-3">
                        <SelectChip
                          aria-label={`Equipo de ${e.name}`}
                          value={e.team_id ?? ""}
                          fg={team ? "#1F2A3D" : "#667085"}
                          bg={team ? "#E8ECF2" : "#F2F4F7"}
                          height={28}
                          onChange={(ev) => void patch(e, { team_id: ev.target.value || null }, "Equipo guardado")}
                        >
                          <option value="">Sin equipo</option>
                          {teamsFor(e).map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.code} · {t.name}
                            </option>
                          ))}
                        </SelectChip>
                      </span>
                      <span role="cell" className="flex min-w-0 flex-col px-3 leading-snug">
                        <span className="truncate font-semibold" style={{ color: now.fg }}>
                          {now.text}
                        </span>
                        <span className="truncate text-xs text-subtle">{now.sub}</span>
                      </span>
                      <span role="cell" className="px-3">
                        <SelectChip
                          aria-label={`Estado de ${e.name}`}
                          value={e.state}
                          fg={S.fg}
                          bg={S.bg}
                          height={28}
                          onChange={(ev) =>
                            void patch(
                              e,
                              { state: ev.target.value as EmployeeState },
                              ev.target.value === "De baja" ? "De baja: se revocó su acceso móvil" : "Estado guardado",
                            )
                          }
                        >
                          {EMPLOYEE_STATES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </SelectChip>
                      </span>
                      <span role="cell" className="truncate px-3 text-[13px] text-ink-2">
                        {e.phone ? (
                          <a href={`tel:${e.phone.replace(/[^\d+]/g, "")}`} className="text-ink-2 no-underline hover:underline">
                            {e.phone}
                          </a>
                        ) : (
                          <span className="text-faint">Sin teléfono</span>
                        )}
                      </span>
                      <span role="cell" className="px-3">
                        <MobileAccessCell employee={e} onChanged={() => void reload()} />
                      </span>
                      <span role="cell" className="flex justify-center">
                        <IconButton label={`Editar a ${e.name}`} onClick={() => setEditing(e)}>
                          <Svg d={ICON.pencil} size={16} />
                        </IconButton>
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <p className="m-0 border-t border-line px-4 py-3 text-[13px] text-muted">
        Quien pasa a «De baja» pierde el acceso móvil al instante. En vacaciones sigue en su equipo pero no cuenta para la obra.
      </p>
      {editing && (
        <EmployeeDialog
          employee={editing === "new" ? null : editing}
          data={data}
          today={today}
          onClose={() => setEditing(null)}
          onSaved={async (msg) => {
            setEditing(null);
            await done(msg);
          }}
        />
      )}
    </>
  );
}

type RoleDraft = {
  key: string;
  id?: string;
  level_id: string;
  team_id: string;
  starts_on: string;
  ends_on: string;
  note: string;
};

function EmployeeDialog({
  employee,
  data,
  today,
  onClose,
  onSaved,
}: {
  employee: Employee | null;
  data: EquipoData;
  today: ISODate;
  onClose: () => void;
  onSaved: (msg: string) => Promise<void>;
}) {
  const activeLevels = data.levels.filter((l) => l.active);
  const defaultLevel = activeLevels.find((l) => fold(l.name) === "tecnico") ?? activeLevels[0] ?? data.levels[0];

  const editableRoles = employee ? employee.roles.filter((r) => r.ends_on === null || r.ends_on >= today) : [];
  const pastRoles = employee ? employee.roles.filter((r) => r.ends_on !== null && r.ends_on < today) : [];

  const [name, setName] = useState(employee?.name ?? "");
  const [job, setJob] = useState(employee?.job ?? "");
  const [phone, setPhone] = useState(employee?.phone ?? "");
  const [team, setTeam] = useState(employee?.team_id ?? "");
  const [state, setState] = useState<EmployeeState>(employee?.state ?? "Activo");
  const [roles, setRoles] = useState<RoleDraft[]>(() =>
    editableRoles.length
      ? editableRoles.map((r) => ({
          key: r.id,
          id: r.id,
          level_id: r.level_id,
          team_id: r.team_id ?? "",
          starts_on: r.starts_on,
          ends_on: r.ends_on ?? "",
          note: r.note,
        }))
      : [
          {
            key: "new-0",
            level_id: defaultLevel?.id ?? "",
            team_id: "",
            starts_on: today,
            ends_on: "",
            note: "",
          },
        ],
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const updateRole = (idx: number, patch: Partial<RoleDraft>) =>
    setRoles((prev) =>
      prev.map((r, i) => {
        if (i !== idx) return r;
        const next = { ...r, ...patch };
        const lvl = data.levelsById.get(next.level_id);
        if (lvl && !lvl.can_lead_team) next.team_id = "";
        return next;
      }),
    );

  const addRole = () =>
    setRoles((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}-${prev.length}`,
        level_id: defaultLevel?.id ?? "",
        team_id: "",
        starts_on: today,
        ends_on: "",
        note: "",
      },
    ]);

  const removeRole = (idx: number) => setRoles((prev) => prev.filter((_, i) => i !== idx));

  const teamLabel = (id: string | null) => {
    if (!id) return null;
    const t = data.teams.find((x) => x.id === id);
    return t ? `${t.code} · ${t.name}` : null;
  };

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payloadRoles: EmployeeRoleInput[] = roles.map((r) => ({
        ...(r.id ? { id: r.id } : {}),
        level_id: r.level_id,
        team_id: data.levelsById.get(r.level_id)?.can_lead_team && r.team_id ? r.team_id : null,
        starts_on: r.starts_on,
        ends_on: r.ends_on || null,
        note: r.note,
      }));
      const body = { name, job, phone, state, team_id: team || null, roles: payloadRoles };
      if (employee) await api(`/employees/${employee.id}`, { method: "PATCH", body: { ...body, version: employee.version } });
      else await api("/employees", { method: "POST", body });
      await onSaved(employee ? "Empleado guardado" : "Empleado agregado");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar.");
      setSaving(false);
    }
  }

  const cellInput = "h-9 rounded-lg border border-line-2 bg-white px-2 text-sm text-ink";

  return (
    <Modal title={employee ? "Editar empleado" : "Nuevo empleado"} onClose={onClose} wide>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Nombre">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} data-autofocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Oficio">
            <input className={inputCls} value={job} onChange={(e) => setJob(e.target.value)} maxLength={80} placeholder="Electricista, instalador…" />
          </Field>
          <Field label="Teléfono">
            <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} inputMode="tel" placeholder="809-555-0100" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Equipo">
            <select className={inputCls} value={team} onChange={(e) => setTeam(e.target.value)}>
              <option value="">Sin equipo</option>
              {data.teams
                .filter((t) => t.active || t.id === employee?.team_id)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} · {t.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Estado">
            <select className={inputCls} value={state} onChange={(e) => setState(e.target.value as EmployeeState)}>
              {EMPLOYEE_STATES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>

        <fieldset className="m-0 flex flex-col gap-2.5 rounded-xl border border-line p-3">
          <legend className="px-1 text-[12px] font-bold uppercase tracking-wide text-subtle">Roles y vigencias</legend>
          {roles.map((r, i) => {
            const lvl = data.levelsById.get(r.level_id);
            const canLead = !!lvl?.can_lead_team;
            const opts = activeLevels.some((l) => l.id === r.level_id) ? activeLevels : [...activeLevels, ...(lvl ? [lvl] : [])];
            return (
              <div key={r.key} className="flex flex-col gap-2 rounded-xl border border-line bg-fill-2 p-2.5">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex min-w-[140px] flex-1 flex-col gap-0.5 text-[11px] font-semibold text-muted">
                    Nivel
                    <select
                      aria-label={`Nivel del rol ${i + 1}`}
                      className={cellInput}
                      value={r.level_id}
                      onChange={(e) => updateRole(i, { level_id: e.target.value })}
                    >
                      {opts.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {canLead && (
                    <label className="flex min-w-[140px] flex-1 flex-col gap-0.5 text-[11px] font-semibold text-muted">
                      Equipo que lidera
                      <select
                        aria-label={`Equipo que lidera en el rol ${i + 1}`}
                        className={cellInput}
                        value={r.team_id}
                        onChange={(e) => updateRole(i, { team_id: e.target.value })}
                      >
                        <option value="">Ninguno</option>
                        {data.teams
                          .filter((t) => t.active || t.id === r.team_id)
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.code} · {t.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  {roles.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Quitar rol ${i + 1}`}
                      onClick={() => removeRole(i)}
                      className="h-9 rounded-lg border border-line bg-white px-2.5 text-xs font-bold text-danger hover:bg-danger-soft"
                    >
                      Quitar
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-0.5 text-[11px] font-semibold text-muted">
                    Desde
                    <input
                      type="date"
                      aria-label={`Desde del rol ${i + 1}`}
                      className={cellInput}
                      value={r.starts_on}
                      required
                      onChange={(e) => updateRole(i, { starts_on: e.target.value })}
                    />
                  </label>
                  <label className="flex flex-col gap-0.5 text-[11px] font-semibold text-muted">
                    Hasta (opcional)
                    <input
                      type="date"
                      aria-label={`Hasta del rol ${i + 1}`}
                      className={cellInput}
                      value={r.ends_on}
                      min={r.starts_on}
                      onChange={(e) => updateRole(i, { ends_on: e.target.value })}
                    />
                  </label>
                </div>
              </div>
            );
          })}
          {roles.length < 10 && (
            <button
              type="button"
              onClick={addRole}
              className="self-start rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-bold text-ink-2 hover:bg-fill-2"
            >
              + Agregar otro rol
            </button>
          )}
        </fieldset>

        {pastRoles.length > 0 && (
          <details className="rounded-xl border border-line bg-fill-2 px-3 py-2 text-xs text-muted">
            <summary className="cursor-pointer font-bold text-ink-2">Historial de roles ({pastRoles.length})</summary>
            <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
              {pastRoles.map((r) => {
                const tl = teamLabel(r.team_id);
                return (
                  <li key={r.id} className="flex items-center justify-between gap-2 border-t border-line pt-1.5">
                    <span className="font-semibold text-ink">
                      {r.level}
                      {tl ? ` · ${tl}` : ""}
                    </span>
                    <span>
                      {shortDate(r.starts_on)} – {r.ends_on ? shortDate(r.ends_on) : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </details>
        )}

        {state === "De baja" && employee?.state !== "De baja" && (
          <Banner tone="warn">Al guardar se revoca su enlace de acceso móvil.</Banner>
        )}
        {error && <Banner tone="danger">{error}</Banner>}
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={saving || !name.trim()}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
