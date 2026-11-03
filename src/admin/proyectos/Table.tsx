import { memo, type ReactNode } from "react";
import type { Project } from "../../../shared/contracts/projects";
import type { Status } from "../../../shared/contracts/statuses";
import type { Team } from "../../../shared/contracts/equipo";
import { lateDays, missingPrep, waitReason } from "../../../shared/domain";
import { AutoDate, AutoText } from "./inputs";
import { datesShort, monoColors, teamLabel, type EditPatch, type Lookup } from "./model";

// Tabla tipo Excel (PRY-02, PRY-03) y lista compacta cuando el panel de edición está abierto (V4Proyectos).

export const COLUMNS = "44px 44px 160px minmax(210px, 1fr) 76px 104px 132px 150px 96px 134px 134px 196px 220px 44px";
const cell = "flex items-center border-r border-line";

const Chevron = ({ color = "#475467", right = 6 }: { color?: string; right?: number }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="pointer-events-none absolute" style={{ right }}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export function Monogram({ code, color, size = 24 }: { code: string; color?: string; size?: number }) {
  const m = monoColors(color);
  return (
    <span aria-hidden className="flex shrink-0 items-center justify-center rounded-md font-extrabold" style={{ width: size, height: size, background: m.bg, color: m.fg, fontSize: size > 30 ? 14 : 10, borderRadius: size > 30 ? 10 : 6 }}>
      {code}
    </span>
  );
}

export function Header() {
  const head = "flex items-center border-r border-line px-3";
  return (
    <div role="row" className="sticky top-0 z-[2] grid h-[42px] border-b border-line bg-fill-2 text-[13px] font-semibold text-muted" style={{ gridTemplateColumns: COLUMNS }}>
      <span role="columnheader" className={`${cell} sticky left-0 z-[3] justify-center bg-fill-2`}>#</span>
      <span role="columnheader" className={`${cell} justify-center`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Prioridad"><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></svg>
      </span>
      <span role="columnheader" className={head}>Empresa</span>
      <span role="columnheader" className={head}>Proyecto</span>
      <span role="columnheader" className={`${head} justify-end`}>kWp</span>
      <span role="columnheader" className={head}>Tipo</span>
      <span role="columnheader" className={head}>Preparación</span>
      <span role="columnheader" className={head}>Lugar</span>
      <span role="columnheader" className={head}>Equipo</span>
      <span role="columnheader" className={head}>Inicio</span>
      <span role="columnheader" className={head}>Fin previsto</span>
      <span role="columnheader" className={head}>Estado</span>
      <span role="columnheader" className={head}>Observación</span>
      <span role="columnheader" aria-label="Editar" />
    </div>
  );
}

const PREP = [
  { key: "prep_plans", short: "PL", title: "Planos y BOM" },
  { key: "prep_materials", short: "MA", title: "Materiales completos" },
  { key: "prep_ede", short: "EDE", title: "Carta de no objeción" },
] as const;

type RowProps = {
  p: Project;
  index: number;
  selected: boolean;
  /** Avisos de validación unidos con " · " (cadena para que `memo` compare por valor). */
  warn: string;
  today: string;
  isAdmin: boolean;
  statuses: Status[];
  teams: Team[];
  lk: Lookup;
  onPatch: (id: string, fields: EditPatch) => void;
  onOpen: (id: string) => void;
  onPickStatus: (p: Project, statusId: string) => void;
};

export const Row = memo(function Row({ p, index, selected, warn, today, isAdmin, statuses, teams, lk, onPatch, onOpen, onPickStatus }: RowProps) {
  const status = lk.statusById.get(p.status_id);
  const company = lk.companyById.get(p.company_id);
  const late = lateDays(p.status_kind, p.end_date, today);
  const paused = p.status_kind === "en_pausa";
  const bg = paused ? "#FFF8FA" : selected ? "#FFF6EF" : p.archived ? "#F9FAFB" : "#FFFFFF";
  const dateBorder = warn ? "border-[#FDB022]" : "border-transparent";
  const obsText = paused && p.pause_reason ? `Pausa: ${p.pause_reason}` : p.notes || "—";
  const team = p.team_id ? lk.teamById.get(p.team_id) : undefined;
  const teamOptions = team && !team.active ? [...teams, team] : teams;
  const miss = missingPrep(p);
  return (
    <>
      <div
        role="row"
        className={`grid h-[46px] border-b border-line text-sm ${p.archived ? "opacity-70" : ""}`}
        style={{ gridTemplateColumns: COLUMNS, background: bg, contentVisibility: "auto", containIntrinsicSize: "auto 46px" }}
      >
        <span role="cell" className={`${cell} sticky left-0 z-[1] justify-center text-[13px] text-subtle`} style={{ background: bg }}>{index + 1}</span>
        <span role="cell" className={`${cell} justify-center`}>
          <button
            type="button"
            aria-pressed={p.priority}
            aria-label={`Prioridad de ${p.name}`}
            title={isAdmin ? "Prioridad: sale primero y con bandera en el mural" : "Solo el administrador cambia la prioridad"}
            disabled={!isAdmin}
            onClick={() => onPatch(p.id, { priority: !p.priority })}
            className={`flex size-7 items-center justify-center rounded-[7px] border-0 ${p.priority ? "bg-navy" : "bg-transparent"} ${isAdmin ? "cursor-pointer" : "cursor-default"}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill={p.priority ? "#FFFFFF" : "none"} stroke={p.priority ? "#FFFFFF" : "#667085"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></svg>
          </button>
        </span>
        <span role="cell" className={`${cell} min-w-0 gap-2 px-3`}>
          <Monogram code={company?.code ?? "··"} color={company?.color} />
          <span className="truncate text-sm font-medium text-ink" title={company?.name}>{company?.name ?? "—"}</span>
        </span>
        <span role="cell" className={`${cell} min-w-0 px-1.5`}>
          <AutoText
            aria-label={`Nombre: ${p.name}`}
            value={p.name}
            valid={(v) => v.trim().length > 0}
            onCommit={(v) => onPatch(p.id, { name: v.trim() })}
            maxLength={160}
            className="w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-[5px] text-sm font-semibold text-ink hover:border-line focus:border-brand"
          />
        </span>
        <span role="cell" className={`${cell} justify-end px-3 tabular-nums text-ink`}>{p.kwp ?? "—"}</span>
        <span role="cell" className={`${cell} px-2.5`}>
          <span className="relative inline-flex items-center">
            <select
              value={p.system_type}
              aria-label={`Tipo de sistema de ${p.name}`}
              onChange={(e) => onPatch(p.id, { system_type: e.target.value as Project["system_type"] })}
              className="h-[26px] cursor-pointer appearance-none rounded-md border border-line bg-white pl-2 pr-[22px] text-xs font-bold text-ink-2"
            >
              <option value="neta">Neta</option>
              <option value="hibrido">Híbrido</option>
            </select>
            <Chevron />
          </span>
        </span>
        <span role="cell" className={`${cell} gap-1 px-2.5`}>
          {PREP.map((c) => {
            const na = c.key === "prep_ede" && p.system_type !== "neta";
            const ok = !na && p[c.key];
            const title = na ? `${c.title} (no aplica)` : ok ? `${c.title}: listo` : `${c.title}: falta`;
            return (
              <button
                key={c.key}
                type="button"
                disabled={na}
                aria-pressed={ok}
                aria-label={`${c.short} · ${title} · ${p.name}`}
                title={title}
                onClick={() => onPatch(p.id, { [c.key]: !p[c.key] })}
                className="flex h-[26px] min-w-[34px] items-center justify-center gap-0.5 rounded-md px-1.5 text-[11px] font-extrabold"
                style={{
                  background: na ? "#F9FAFB" : ok ? "#E7F7EE" : "#FFFFFF",
                  color: na ? "#98A2B3" : ok ? "#157F3D" : "#B54708",
                  border: `1px ${ok || na ? "solid" : "dashed"} ${na ? "#EAECF0" : ok ? "#BFE6CC" : "#F7C97E"}`,
                  cursor: na ? "default" : "pointer",
                }}
              >
                {c.short}
                {ok && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" aria-hidden><path d="m5 12 5 5 9-10" /></svg>}
              </button>
            );
          })}
          <span className="sr-only">{miss.length ? waitReason(p) : "Preparación completa"}</span>
        </span>
        <span role="cell" className={`${cell} min-w-0 px-3`}><span className="truncate text-ink-2" title={p.place}>{p.place}</span></span>
        <span role="cell" className={`${cell} px-2.5`}>
          <span className="relative inline-flex items-center">
            <select
              value={p.team_id ?? ""}
              aria-label={`Equipo de ${p.name}`}
              onChange={(e) => onPatch(p.id, { team_id: e.target.value || null })}
              className="h-[26px] cursor-pointer appearance-none rounded-md border-0 pl-2 pr-6 text-xs font-bold"
              style={{ background: p.team_id ? "#E8ECF2" : "#F2F4F7", color: p.team_id ? "#1F2A3D" : "#667085" }}
            >
              <option value="">Sin equipo</option>
              {teamOptions.map((t) => <option key={t.id} value={t.id}>{t.code}</option>)}
            </select>
            <Chevron color={p.team_id ? "#1F2A3D" : "#667085"} right={7} />
          </span>
        </span>
        <span role="cell" className={`${cell} min-w-0 px-1.5`}>
          <AutoDate aria-label={`Inicio de ${p.name}`} title={warn || undefined} value={p.start_date} onCommit={(v) => onPatch(p.id, { start_date: v })} className={`w-full min-w-0 rounded-md border bg-transparent px-1.5 py-1 text-[13px] ${dateBorder} ${p.start_date ? "text-ink-2" : "text-faint"}`} />
        </span>
        <span role="cell" className={`${cell} min-w-0 px-1.5`}>
          <AutoDate aria-label={`Fin previsto de ${p.name}`} title={warn || undefined} value={p.end_date} onCommit={(v) => onPatch(p.id, { end_date: v })} className={`w-full min-w-0 rounded-md border bg-transparent px-1.5 py-1 text-[13px] ${dateBorder} ${p.end_date ? "text-ink-2" : "text-faint"}`} />
        </span>
        <span role="cell" className={`${cell} px-2.5`}>
          <span className="relative inline-flex items-center">
            <select
              value={p.status_id}
              aria-label={`Estado de ${p.name}`}
              onChange={(e) => onPickStatus(p, e.target.value)}
              className="h-[26px] cursor-pointer appearance-none rounded-md border-0 pl-2 pr-6 text-xs font-bold"
              style={{ background: status?.bg, color: status?.fg }}
            >
              {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <Chevron color={status?.fg} right={7} />
          </span>
          {late > 0 && (
            <span className="ml-1.5 whitespace-nowrap rounded-md border border-[#FCE3B0] bg-warn-soft px-1.5 py-0.5 text-[11px] font-extrabold text-warn" title={`Atrasada ${late} ${late === 1 ? "día" : "días"} laborables`}>
              Atrasada · +{late}
            </span>
          )}
        </span>
        <span role="cell" className={`${cell} min-w-0 gap-1.5 pl-3 pr-2`}>
          <span className={`min-w-0 flex-1 truncate text-[13px] ${p.notes || (paused && p.pause_reason) ? "text-ink-2" : "text-faint"}`} title={obsText === "—" ? undefined : obsText}>{obsText}</span>
          {p.notes && (
            <button
              type="button"
              aria-pressed={p.show_on_mural}
              aria-label={`Mostrar en el mural: ${p.name}`}
              title="Mostrar en el mural"
              onClick={() => onPatch(p.id, { show_on_mural: !p.show_on_mural })}
              className="flex size-[26px] shrink-0 items-center justify-center rounded-md border"
              style={{ background: p.show_on_mural ? "#FFF4EC" : "#FFFFFF", borderColor: p.show_on_mural ? "#F6C9A8" : "#EAECF0" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={p.show_on_mural ? "#C2410C" : "#667085"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="2.5" y="4" width="19" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
            </button>
          )}
        </span>
        <span role="cell" className="flex items-center justify-center">
          <button type="button" aria-label={`Editar ${p.name}`} onClick={() => onOpen(p.id)} className="flex size-[30px] items-center justify-center rounded-[7px] text-muted hover:bg-fill">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 20h4L19 9l-4-4L4 16z" /></svg>
          </button>
        </span>
      </div>
      {warn && (
        <div role="row" className="grid border-b border-line bg-warn-soft" style={{ gridTemplateColumns: "88px minmax(0, 1fr)" }}>
          <span className="sticky left-0 z-[1] border-r border-[#F5E3B8] bg-warn-soft" />
          <span role="cell" className="min-w-0 py-[7px]">
            <span className="sticky left-[100px] flex w-fit max-w-[calc(100vw-360px)] items-center gap-2 text-[13px] font-semibold text-warn">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden className="shrink-0"><path d="M12 3 2 21h20zM12 10v5M12 18h.01" /></svg>
              <span className="sr-only">Aviso en {p.name}: </span>
              <span className="truncate" title={warn}>{warn}</span>
            </span>
          </span>
        </div>
      )}
    </>
  );
});

/** Lista compacta con el panel abierto: # · proyecto · estado · fechas. */
export const CompactRow = memo(function CompactRow({ p, index, selected, lk, onOpen }: { p: Project; index: number; selected: boolean; lk: Lookup; onOpen: (id: string) => void }) {
  const status = lk.statusById.get(p.status_id);
  const company = lk.companyById.get(p.company_id);
  const dates = datesShort(p);
  return (
    <button
      type="button"
      onClick={() => onOpen(p.id)}
      aria-current={selected ? "true" : undefined}
      className="grid h-[52px] w-full cursor-pointer border-0 border-b border-line p-0 text-left text-ink"
      style={{ gridTemplateColumns: "40px minmax(0, 1fr) 136px 118px", background: selected ? "#FFF6EF" : p.archived ? "#F9FAFB" : "#FFFFFF", boxShadow: selected ? "inset 3px 0 0 #C2410C" : "none", contentVisibility: "auto", containIntrinsicSize: "auto 52px" }}
    >
      <span className={`${cell} justify-center text-[13px] text-subtle`}>{index + 1}</span>
      <span className={`${cell} min-w-0 gap-2.5 px-3`}>
        <Monogram code={company?.code ?? "··"} color={company?.color} />
        <span className="flex min-w-0 flex-col leading-[1.3]">
          <span className="truncate text-sm font-semibold">{p.name}</span>
          <span className="truncate text-xs text-subtle">{company?.name} · {teamLabel(p, lk)}</span>
        </span>
      </span>
      <span className={`${cell} px-3`}>
        <span className="whitespace-nowrap rounded-md px-2 py-1 text-xs font-bold" style={{ background: status?.bg, color: status?.fg }}>{status?.name}</span>
      </span>
      <span className={`flex items-center whitespace-nowrap px-3 text-[13px] ${dates ? "text-ink-2" : "text-faint"}`}>{dates || waitReason(p)}</span>
    </button>
  );
});

export function CompactHeader() {
  const h = "flex items-center border-r border-line px-3";
  return (
    <div aria-hidden className="sticky top-0 z-[2] grid h-10 border-b border-line bg-fill-2 text-[13px] font-semibold text-muted" style={{ gridTemplateColumns: "40px minmax(0, 1fr) 136px 118px" }}>
      <span className={`${cell} justify-center`}>#</span>
      <span className={h}>Proyecto</span>
      <span className={h}>Estado</span>
      <span className="flex items-center px-3">Fechas</span>
    </div>
  );
}

export function StatusTabs({ statuses, counts, total, value, onChange }: { statuses: Status[]; counts: Map<string, number>; total: number; value: string; onChange: (id: string) => void }): ReactNode {
  const tabs = [{ id: "all", name: "Todos", dot: "#1B1F27", count: total }, ...statuses.map((s) => ({ id: s.id, name: s.name, dot: s.dot, count: counts.get(s.id) ?? 0 }))];
  return (
    <div role="group" aria-label="Filtrar por estado" className="flex gap-1 overflow-x-auto border-b border-line px-4">
      {tabs.map((t) => {
        const on = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(t.id)}
            className="flex h-12 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap border-0 border-b-2 bg-transparent px-2.5 text-sm"
            style={{ borderBottomColor: on ? "#EA6A1F" : "transparent", color: on ? "#1B1F27" : "#667085", fontWeight: on ? 700 : 600 }}
          >
            <span aria-hidden className="size-2 rounded-full" style={{ background: t.dot }} />
            {t.name}
            <span className="rounded-md px-[7px] py-px text-xs font-bold" style={{ color: on ? "#9A3412" : "#475467", background: on ? "#FFF1E7" : "#F2F4F7" }}>{t.count}</span>
          </button>
        );
      })}
    </div>
  );
}
