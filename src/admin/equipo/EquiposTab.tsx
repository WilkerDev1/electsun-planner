import { useState, type FormEvent } from "react";
import { api, ApiError } from "../../ui/api";
import { Banner, Button, Empty, Field, Toggle, initials } from "../../ui/components";
import { fold, plural } from "../../../shared/domain";
import type { Employee, Team } from "../../../shared/contracts/equipo";
import { ICON, STATE_STYLE, teamAgenda, type EquipoData, type TabProps } from "./model";
import { Avatar, IconButton, Svg, inputCls } from "./ui";
import { Modal } from "../../ui/Modal";

const GRID = "grid items-center grid-cols-[210px_210px_minmax(240px,1fr)_230px_190px_52px]";
const LEAD_LEVELS = ["Encargado", "Supervisor"];

export function EquiposTab({ data, today, query, done }: TabProps) {
  const [editing, setEditing] = useState<Team | "new" | null>(null);
  const q = fold(query);
  const emp = (id: string | null) => data.employees.find((e) => e.id === id);
  const rows = data.teams.filter((t) => !q || fold(`${t.code} ${t.name} ${emp(t.lead_employee_id)?.name ?? ""}`).includes(q));
  const supervisor = data.employees.find((e) => e.level === "Supervisor");

  return (
    <>
      <div className="flex justify-end px-4 pb-3">
        <Button variant="primary" className="h-9 rounded-lg" onClick={() => setEditing("new")}>
          <Svg d={ICON.plus} stroke={2.4} /> Nuevo equipo
        </Button>
      </div>
      <div className="overflow-x-auto border-t border-line">
        <div role="table" aria-label="Equipos de obra" className="min-w-[1040px]">
          <div role="row" className={`${GRID} h-10 border-b border-line bg-fill-2 text-[13px] font-semibold text-muted`}>
            <span role="columnheader" className="px-4">Equipo</span>
            <span role="columnheader" className="px-3">Encargado</span>
            <span role="columnheader" className="px-3">Integrantes</span>
            <span role="columnheader" className="px-3">Hoy</span>
            <span role="columnheader" className="px-3">Próximo</span>
            <span role="columnheader" aria-label="Acciones" />
          </div>
          {rows.length === 0 && (
            <Empty title={data.teams.length ? "Ningún equipo coincide" : "Todavía no hay equipos"}>
              {data.teams.length ? "Prueba con otra búsqueda." : "Crea el primero con «Nuevo equipo»."}
            </Empty>
          )}
          {rows.map((t) => {
            const lead = emp(t.lead_employee_id);
            const crew = t.member_ids.map(emp).filter((e): e is Employee => !!e);
            const others = crew.filter((e) => e.id !== t.lead_employee_id);
            const away = crew.filter((e) => e.state !== "Activo").length;
            const agenda = teamAgenda(t.id, data.projects, today);
            return (
              <div key={t.id} role="row" className={`${GRID} h-[72px] border-b border-line text-sm ${t.active ? "" : "bg-fill-2 opacity-70"}`}>
                <span role="cell" className="flex items-center gap-3 px-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-navy text-[15px] font-extrabold text-white">{t.code}</span>
                  <span className="flex flex-col leading-snug">
                    <span className="font-bold">{t.name}{!t.active && <span className="ml-2 rounded-md bg-fill px-1.5 py-px text-[11px] font-bold text-muted">Inactivo</span>}</span>
                    <span className="text-xs text-subtle">{plural(crew.length, "persona", "personas")}{away ? ` · ${away} ausente${away === 1 ? "" : "s"}` : ""}</span>
                  </span>
                </span>
                <span role="cell" className="flex min-w-0 items-center gap-2.5 px-3">
                  <Avatar size={30} text={lead ? initials(lead.name) : "—"} bg="#EEF0FE" fg="#3538CD" />
                  <span className="flex min-w-0 flex-col leading-snug">
                    <span className="truncate font-semibold">{lead?.name ?? "Sin encargado"}</span>
                    <span className="text-xs text-subtle">Encargado</span>
                  </span>
                </span>
                <span role="cell" className="flex min-w-0 items-center gap-2.5 px-3">
                  <span className="flex shrink-0 pr-2">
                    {others.slice(0, 6).map((m) => (
                      <span key={m.id} title={m.name} className="-mr-2 flex size-[30px] items-center justify-center rounded-full border-2 border-white bg-fill text-[11px] font-extrabold text-ink-2" style={m.state === "Activo" ? undefined : { boxShadow: `0 0 0 2px ${STATE_STYLE[m.state].presence}` }}>
                        {initials(m.name)}
                      </span>
                    ))}
                  </span>
                  <span className="ml-2 truncate text-[13px] text-muted">
                    {others.map((m) => m.name.split(" ")[0] + (m.state === "Vacaciones" ? " (vac.)" : m.state === "De baja" ? " (baja)" : "")).join(", ") || "Sin integrantes"}
                  </span>
                </span>
                <span role="cell" className="flex min-w-0 flex-col items-start gap-1 px-3">
                  {!agenda ? (
                    <span className="text-xs text-subtle">Obra no disponible</span>
                  ) : agenda.now ? (
                    <>
                      <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-md bg-[#E0F4EF] px-2 py-[3px] text-xs font-bold text-[#095C4F]">
                        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[#095C4F]" />
                        <span className="truncate">En obra · {agenda.now.name}</span>
                      </span>
                      <span className={`text-xs ${agenda.now.late ? "font-semibold text-warn" : "text-subtle"}`}>{agenda.now.sub}</span>
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-fill px-2 py-[3px] text-xs font-bold text-muted">
                      <span aria-hidden className="size-1.5 rounded-full bg-faint" />
                      Sin obra hoy
                    </span>
                  )}
                </span>
                <span role="cell" className="flex min-w-0 flex-col px-3 leading-snug">
                  {agenda?.next ? (
                    <>
                      <span className="truncate font-semibold">{agenda.next.name}</span>
                      <span className="text-xs font-semibold text-[#3538CD]">{agenda.next.when}</span>
                    </>
                  ) : (
                    <span className="text-subtle">{agenda ? "Sin programar" : "—"}</span>
                  )}
                </span>
                <span role="cell" className="flex justify-center">
                  <IconButton label={`Editar ${t.name}`} onClick={() => setEditing(t)}>
                    <Svg d={ICON.pencil} size={16} />
                  </IconButton>
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="m-0 border-t border-line px-4 py-3 text-[13px] text-muted">
        Cada empleado está en un solo equipo: al elegir a alguien de otro equipo, se mueve.
        {supervisor ? ` El supervisor (${supervisor.name}) ve todos los equipos.` : ""}
      </p>
      {editing && (
        <TeamDialog
          team={editing === "new" ? null : editing}
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

function TeamDialog({ team, data, onClose, onSaved }: { team: Team | null; data: EquipoData; onClose: () => void; onSaved: (msg: string) => Promise<void> }) {
  const nextCode = () => {
    const used = new Set(data.teams.map((t) => t.code));
    for (let i = 1; i < 100; i++) if (!used.has(`E${i}`)) return `E${i}`;
    return "";
  };
  const [code, setCode] = useState(team?.code ?? nextCode());
  const [name, setName] = useState(team?.name ?? "");
  const [lead, setLead] = useState(team?.lead_employee_id ?? "");
  const [members, setMembers] = useState<string[]>(team?.member_ids ?? []);
  const [active, setActive] = useState(team?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const leads = data.employees.filter((e) => LEAD_LEVELS.includes(e.level));
  const teamName = (id: string | null) => data.teams.find((t) => t.id === id)?.code;
  const toggle = (id: string) => setMembers((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
      if (team) {
        await api(`/teams/${team.id}`, {
          method: "PATCH",
          body: {
            version: team.version,
            code,
            name,
            lead_employee_id: lead || null,
            active,
            ...(same(members, team.member_ids) ? {} : { member_ids: members }),
          },
        });
      } else {
        const created = await api<Team>("/teams", { method: "POST", body: { code, name, lead_employee_id: lead || null } });
        if (members.length) await api(`/teams/${created.id}`, { method: "PATCH", body: { version: created.version, member_ids: members } });
      }
      await onSaved(team ? "Equipo guardado" : "Equipo creado");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar.");
      setSaving(false);
    }
  }

  return (
    <Modal title={team ? `Editar ${team.name}` : "Nuevo equipo"} onClose={onClose} wide>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="grid grid-cols-[110px_1fr] gap-3">
          <Field label="Código">
            <input className={inputCls} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required pattern="E[1-9][0-9]?" title="E1 a E99" maxLength={3} data-autofocus={!team || undefined} />
          </Field>
          <Field label="Nombre">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} placeholder="Equipo 4" />
          </Field>
        </div>
        <Field label="Encargado" hint="Solo empleados de nivel Encargado o Supervisor.">
          <select className={inputCls} value={lead} onChange={(e) => setLead(e.target.value)}>
            <option value="">Sin encargado</option>
            {leads.map((e) => <option key={e.id} value={e.id}>{e.name} · {e.level}</option>)}
          </select>
        </Field>
        <fieldset className="m-0 rounded-xl border border-line p-0">
          <legend className="ml-3 px-1 text-[12px] font-bold uppercase tracking-wide text-subtle">Integrantes ({members.length})</legend>
          <ul className="m-0 grid max-h-56 list-none gap-px overflow-y-auto p-1">
            {data.employees.map((e) => {
              const elsewhere = e.team_id && e.team_id !== team?.id ? teamName(e.team_id) : null;
              return (
                <li key={e.id}>
                  <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-fill-2">
                    <input type="checkbox" className="size-4 accent-[#1F2A3D]" checked={members.includes(e.id)} onChange={() => toggle(e.id)} />
                    <span className="flex-1 text-sm font-semibold">{e.name}</span>
                    <span className="text-xs text-subtle">
                      {e.level}
                      {e.state !== "Activo" ? ` · ${e.state}` : ""}
                      {elsewhere && !members.includes(e.id) ? ` · en ${elsewhere}` : ""}
                      {elsewhere && members.includes(e.id) ? ` · pasa de ${elsewhere}` : ""}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
        {team && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2">
            <span className="flex flex-col">
              <span className="text-sm font-bold">Equipo activo</span>
              <span className="text-xs text-subtle">Un equipo con obras programadas o en curso no se puede desactivar.</span>
            </span>
            <Toggle on={active} onChange={setActive} label="Equipo activo" />
          </div>
        )}
        {error && <Banner tone="danger">{error}</Banner>}
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={saving || !name.trim() || !code}>{saving ? "Guardando…" : "Guardar"}</Button>
        </div>
      </form>
    </Modal>
  );
}
