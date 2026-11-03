import { useState, type FormEvent } from "react";
import { api, ApiError } from "../../ui/api";
import { Banner, Button, Empty, Field, initials } from "../../ui/components";
import { EMPLOYEE_STATES, LEVELS, fold, type EmployeeState, type Level } from "../../../shared/domain";
import type { Employee } from "../../../shared/contracts/equipo";
import { MobileAccessCell } from "../cuentas/MobileAccessCell";
import { LEVEL_STYLE, STATE_STYLE, whereToday, type TabProps } from "./model";
import { Avatar, IconButton, SelectChip, Svg, inputCls } from "./ui";
import { Modal } from "../../ui/Modal";
import { ICON } from "./model";

const GRID = "grid items-center grid-cols-[minmax(240px,1.4fr)_170px_150px_minmax(190px,1fr)_130px_140px_170px_52px]";

export function EmpleadosTab({ data, today, query, save, done, reload }: TabProps) {
  const [level, setLevel] = useState<"Todos" | Level>("Todos");
  const [editing, setEditing] = useState<Employee | "new" | null>(null);
  const q = fold(query);
  const matches = (e: Employee) => !q || fold(`${e.name} ${e.job} ${e.phone}`).includes(q);
  const groups = LEVELS.filter((l) => level === "Todos" || level === l)
    .map((l) => ({ level: l, rows: data.employees.filter((e) => e.level === l && matches(e)) }))
    .filter((g) => g.rows.length);
  const teamsFor = (e: Employee) => data.teams.filter((t) => t.active || t.id === e.team_id);

  const patch = (e: Employee, body: Partial<Pick<Employee, "level" | "team_id" | "state">>, ok: string) =>
    save(() => api<Employee>(`/employees/${e.id}`, { method: "PATCH", body: { version: e.version, ...body } }), ok);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 pb-3">
        <div role="group" aria-label="Filtrar por nivel" className="flex flex-wrap gap-1.5">
          {(["Todos", ...LEVELS] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={level === l}
              onClick={() => setLevel(l)}
              className={`h-8 rounded-lg border px-2.5 text-[13px] font-semibold ${level === l ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2 hover:bg-fill-2"}`}
            >
              {l}
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
            const L = LEVEL_STYLE[g.level];
            return (
              <div key={g.level} role="rowgroup">
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
                  const now = whereToday(e, data, today);
                  const team = data.teams.find((t) => t.id === e.team_id);
                  return (
                    <div key={e.id} role="row" className={`${GRID} h-[60px] border-b border-line text-sm`}>
                      <span role="cell" className="flex min-w-0 items-center gap-3 px-4">
                        <Avatar text={initials(e.name)} bg={L.avBg} fg={L.avFg} presence={S.presence} />
                        <span className="flex min-w-0 flex-col leading-snug">
                          <span className="truncate font-semibold">{e.name}</span>
                          <span className="truncate text-xs text-subtle">{e.job || "Sin oficio"}</span>
                        </span>
                      </span>
                      <span role="cell" className="px-3">
                        <SelectChip
                          aria-label={`Nivel de ${e.name}`}
                          value={e.level}
                          fg={L.fg}
                          bg={L.bg}
                          border={L.border}
                          icon={L.icon}
                         
                          onChange={(ev) => void patch(e, { level: ev.target.value as Level }, "Nivel guardado")}
                        >
                          {LEVELS.map((l) => (
                            <option key={l} value={l}>{l}</option>
                          ))}
                        </SelectChip>
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
                            <option key={t.id} value={t.id}>{t.code} · {t.name}</option>
                          ))}
                        </SelectChip>
                      </span>
                      <span role="cell" className="flex min-w-0 flex-col px-3 leading-snug">
                        <span className="truncate font-semibold" style={{ color: now.fg }}>{now.text}</span>
                        <span className="truncate text-xs text-subtle">{now.sub}</span>
                      </span>
                      <span role="cell" className="px-3">
                        <SelectChip
                          aria-label={`Estado de ${e.name}`}
                          value={e.state}
                          fg={S.fg}
                          bg={S.bg}
                          height={28}
                          onChange={(ev) => void patch(e, { state: ev.target.value as EmployeeState }, ev.target.value === "De baja" ? "De baja: se revocó su acceso móvil" : "Estado guardado")}
                        >
                          {EMPLOYEE_STATES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </SelectChip>
                      </span>
                      <span role="cell" className="truncate px-3 text-[13px] text-ink-2">
                        {e.phone ? <a href={`tel:${e.phone.replace(/[^\d+]/g, "")}`} className="text-ink-2 no-underline hover:underline">{e.phone}</a> : <span className="text-faint">Sin teléfono</span>}
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

function EmployeeDialog({ employee, data, onClose, onSaved }: { employee: Employee | null; data: TabProps["data"]; onClose: () => void; onSaved: (msg: string) => Promise<void> }) {
  const [name, setName] = useState(employee?.name ?? "");
  const [job, setJob] = useState(employee?.job ?? "");
  const [phone, setPhone] = useState(employee?.phone ?? "");
  const [level, setLevel] = useState<Level>(employee?.level ?? "Técnico");
  const [team, setTeam] = useState(employee?.team_id ?? "");
  const [state, setState] = useState<EmployeeState>(employee?.state ?? "Activo");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = { name, job, phone, level, state, team_id: team || null };
      if (employee) await api(`/employees/${employee.id}`, { method: "PATCH", body: { ...body, version: employee.version } });
      else await api("/employees", { method: "POST", body });
      await onSaved(employee ? "Empleado guardado" : "Empleado agregado");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar.");
      setSaving(false);
    }
  }

  return (
    <Modal title={employee ? "Editar empleado" : "Nuevo empleado"} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Nombre">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} data-autofocus />
        </Field>
        <Field label="Oficio">
          <input className={inputCls} value={job} onChange={(e) => setJob(e.target.value)} maxLength={80} placeholder="Electricista, instalador…" />
        </Field>
        <Field label="Teléfono">
          <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} inputMode="tel" placeholder="809-555-0100" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nivel">
            <select className={inputCls} value={level} onChange={(e) => setLevel(e.target.value as Level)}>
              {LEVELS.map((l) => <option key={l}>{l}</option>)}
            </select>
          </Field>
          <Field label="Estado">
            <select className={inputCls} value={state} onChange={(e) => setState(e.target.value as EmployeeState)}>
              {EMPLOYEE_STATES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Equipo">
          <select className={inputCls} value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">Sin equipo</option>
            {data.teams.filter((t) => t.active || t.id === employee?.team_id).map((t) => (
              <option key={t.id} value={t.id}>{t.code} · {t.name}</option>
            ))}
          </select>
        </Field>
        {state === "De baja" && employee?.state !== "De baja" && <Banner tone="warn">Al guardar se revoca su enlace de acceso móvil.</Banner>}
        {error && <Banner tone="danger">{error}</Banner>}
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={saving || !name.trim()}>{saving ? "Guardando…" : "Guardar"}</Button>
        </div>
      </form>
    </Modal>
  );
}

