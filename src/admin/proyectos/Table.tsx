import { memo, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Project } from "../../../shared/contracts/projects";
import type { Status } from "../../../shared/contracts/statuses";
import type { Team } from "../../../shared/contracts/equipo";
import { missingPrep, prepRows, waitReason } from "../../../shared/domain";
import { CompanyMark } from "../../ui/CompanyMark";
import { Floating } from "./Floating";
import { AutoDate, AutoText } from "./inputs";
import {
  avisoOpenByDefault, avisoShort, datesShort, parseAvisos, readAvisoPref, saveAvisoPref, teamLabel, toggledPrep, withPrepItem,
  type Aviso, type EditPatch, type Lookup,
} from "./model";

// Tabla tipo Excel (PRY-02, PRY-03) y lista compacta cuando el panel de edición está abierto (V4Proyectos).

export const COLUMNS = "40px 44px 44px 170px minmax(210px, 1fr) 76px 104px 230px 150px 96px 134px 134px 250px 220px 124px";
/** Donde empieza la columna «Proyecto»: la suma de las cuatro columnas anteriores (casilla, #, prioridad, empresa). */
export const PROJECT_COL_LEFT = COLUMNS.split(" ").slice(0, 4).reduce((sum, w) => sum + parseInt(w, 10), 0);
/** Ancho mínimo de la tabla: la suma de las columnas con el mínimo de «Proyecto». */
export const TABLE_MIN_WIDTH = 2026;
const cell = "flex items-center border-r border-line";

const Chevron = ({ color = "#475467", right = 6 }: { color?: string; right?: number }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="pointer-events-none absolute" style={{ right }}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export function Header({ allChecked, someChecked, onToggleAll }: { allChecked: boolean; someChecked: boolean; onToggleAll: (on: boolean) => void }) {
  const head = "flex items-center border-r border-line px-3";
  return (
    <div role="row" className="sticky top-0 z-[4] grid h-[42px] border-b border-line bg-fill-2 text-[13px] font-semibold text-muted" style={{ gridTemplateColumns: COLUMNS }}>
      <span role="columnheader" className={`${cell} sticky left-0 z-[3] justify-center bg-fill-2`}>
        <input
          type="checkbox"
          aria-label="Seleccionar todos los proyectos de la lista"
          checked={allChecked}
          ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
          onChange={(e) => onToggleAll(e.target.checked)}
          className="size-4 cursor-pointer accent-[#1B1F27]"
        />
      </span>
      <span role="columnheader" className={`${cell} sticky left-10 z-[3] justify-center bg-fill-2`}>#</span>
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
      <span role="columnheader" aria-label="Acciones" />
    </div>
  );
}

type RowProps = {
  p: Project;
  index: number;
  selected: boolean;
  /** Marcado con la casilla de la fila (selección múltiple). */
  checked: boolean;
  /** Avisos de validación unidos con un salto de línea (cadena para que `memo` compare por valor). */
  warn: string;
  today: string;
  isAdmin: boolean;
  statuses: Status[];
  teams: Team[];
  lk: Lookup;
  onPatch: (id: string, fields: EditPatch) => void;
  onOpen: (id: string) => void;
  onPickStatus: (p: Project, statusId: string) => void;
  onCheck: (id: string, on: boolean) => void;
  onArchive: (p: Project) => void;
  onRestore: (p: Project) => void;
};

const WarnIcon = ({ error }: { error?: boolean }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0" style={{ color: error ? "#B42318" : "#B54708" }}>
    {error ? <><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5h.01" /></> : <path d="M12 3 2 21h20zM12 10v5M12 18h.01" />}
  </svg>
);

/** Fichas de preparación del proyecto y el selector de qué parámetros lleva (PRY-12, CAL-07). */
function PrepCell({ p, lk, onPatch }: { p: Project; lk: Lookup; onPatch: (id: string, fields: EditPatch) => void }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const rows = prepRows(p, lk.prepItems);
  const mine = rows.filter((r) => r.selected);
  const miss = missingPrep(p, lk.prepItems);
  return (
    <>
      {mine.length === 0 && <span className="text-sm text-faint" title="Este proyecto no necesita preparación">—<span className="sr-only">Sin preparación</span></span>}
      {mine.map(({ item, applies, done }) => {
        const na = !applies;
        const ok = !na && done;
        const state = na ? "no aplica a este tipo de sistema" : ok ? "listo" : "falta";
        return (
          <button
            key={item.id}
            type="button"
            disabled={na}
            aria-pressed={ok}
            aria-label={`${item.code} · ${item.name}: ${state} · ${p.name}`}
            title={`${item.name}: ${state}`}
            onClick={() => onPatch(p.id, { prep: toggledPrep(p, item.id) })}
            className="flex h-[26px] min-w-[34px] items-center justify-center gap-0.5 rounded-md px-1.5 text-[11px] font-extrabold"
            style={{
              background: na ? "#F9FAFB" : ok ? "#E7F7EE" : "#FFFFFF",
              color: na ? "#667085" : ok ? "#157F3D" : "#B54708",
              border: `1px ${ok || na ? "solid" : "dashed"} ${na ? "#EAECF0" : ok ? "#BFE6CC" : "#F7C97E"}`,
              cursor: na ? "default" : "pointer",
            }}
          >
            {item.code}
            {ok && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" aria-hidden><path d="m5 12 5 5 9-10" /></svg>}
          </button>
        );
      })}
      <span className="sr-only">{mine.length === 0 ? "" : miss.length ? waitReason(p, lk.prepItems) : "Preparación completa"}</span>
      <button
        ref={anchor}
        type="button"
        aria-label={`Elegir parámetros de preparación de ${p.name}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Elegir parámetros de preparación"
        onClick={() => setOpen((v) => !v)}
        className="flex size-[26px] shrink-0 cursor-pointer items-center justify-center rounded-md border border-line bg-white text-muted hover:bg-fill"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
      </button>
      {open && (
        <Floating anchor={anchor} role="dialog" label={`Parámetros de preparación de ${p.name}`} width={290} onClose={() => setOpen(false)}>
          <fieldset className="m-0 flex flex-col gap-0.5 border-0 p-0">
            <legend className="px-2 pb-1 pt-1 text-xs font-bold text-subtle">Parámetros de este proyecto</legend>
            {lk.prepItems.length === 0 && <p className="m-0 px-2 py-1 text-[13px] text-subtle">El catálogo está vacío.</p>}
            {rows.map(({ item, selected, applies }) => (
              <label key={item.id} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-fill-2">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={(e) => onPatch(p.id, { prep: withPrepItem(p, item.id, e.target.checked, lk.prepItems) })}
                  className="size-4 shrink-0 cursor-pointer accent-[#1B1F27]"
                />
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-sm font-semibold text-ink">{item.code} · {item.name}</span>
                  {!applies && <span className="text-xs text-subtle">No aplica a este tipo de sistema</span>}
                </span>
              </label>
            ))}
          </fieldset>
          <Link to="/ajustes#preparacion" className="mt-1 block rounded-lg px-2 py-2 text-[13px] font-semibold text-ink-2 underline">Editar catálogo</Link>
        </Floating>
      )}
    </>
  );
}

/** Menú de acciones de la fila: editar y archivar. */
function RowMenu({ p, onOpen, onArchive }: { p: Project; onOpen: (id: string) => void; onArchive: (p: Project) => void }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const item = "flex h-9 w-full cursor-pointer items-center rounded-lg border-0 bg-transparent px-2.5 text-left text-sm font-semibold text-ink hover:bg-fill-2 focus-visible:bg-fill-2";
  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-label={`Más acciones de ${p.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex size-[30px] cursor-pointer items-center justify-center rounded-[7px] border-0 bg-transparent text-muted hover:bg-fill"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
      </button>
      {open && (
        <Floating anchor={anchor} role="menu" label={`Acciones de ${p.name}`} width={170} onClose={() => setOpen(false)}>
          <button type="button" role="menuitem" className={item} onClick={() => { setOpen(false); onOpen(p.id); }}>Editar</button>
          <button type="button" role="menuitem" className={item} onClick={() => { setOpen(false); onArchive(p); }}>Archivar</button>
        </Floating>
      )}
    </>
  );
}

/** Panel de avisos que cuelga de la fila: cada aviso con su texto completo y, si encaja, una acción directa. */
function AvisoPanel({ id, p, avisos, lk, onPatch, onOpen, bg }: { id: string; p: Project; avisos: Aviso[]; lk: Lookup; onPatch: RowProps["onPatch"]; onOpen: (id: string) => void; bg: string }) {
  const pending = prepRows(p, lk.prepItems).filter((r) => r.pending);
  const act = "h-7 cursor-pointer rounded-md border border-[#F7C97E] bg-white px-2 text-xs font-bold text-warn hover:bg-warn-soft";
  return (
    <div role="row" className="grid border-b border-line text-[13px]" style={{ gridTemplateColumns: COLUMNS, background: bg }}>
      <span role="cell" className="sticky left-0 z-[1]" style={{ gridColumn: "1 / 5", background: bg, boxShadow: "inset 3px 0 0 #F79009" }} />
      <span role="cell" id={id} className="min-w-0 py-2 pr-3" style={{ gridColumn: "5 / -1" }}>
        <span className="sticky flex w-fit min-w-[320px] max-w-[calc(100vw-440px)] gap-2" style={{ left: PROJECT_COL_LEFT }}>
          <span aria-hidden className="select-none text-base leading-5 text-[#F79009]">↳</span>
          <ul className="m-0 flex min-w-0 list-none flex-col gap-1.5 p-0">
            <li className="sr-only">Avisos de {p.name}</li>
            {avisos.map((a) => (
              <li key={a.text} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-semibold" style={{ color: a.code === "error" ? "#B42318" : "#B54708" }}>
                <WarnIcon error={a.code === "error"} />
                <span>{a.text}</span>
                {a.code === "prep_pendiente" &&
                  pending.map(({ item }) => (
                    <button key={item.id} type="button" className={act} aria-label={`Marcar ${item.name} como hecho en ${p.name}`} onClick={() => onPatch(p.id, { prep: toggledPrep(p, item.id) })}>
                      Marcar {item.code} como hecho
                    </button>
                  ))}
                <button type="button" className={act} aria-label={`Abrir proyecto ${p.name}`} onClick={() => onOpen(p.id)}>Abrir proyecto</button>
              </li>
            ))}
          </ul>
        </span>
      </span>
    </div>
  );
}

export const Row = memo(function Row({ p, index, selected, checked, warn, today, isAdmin, statuses, teams, lk, onPatch, onOpen, onPickStatus, onCheck, onArchive, onRestore }: RowProps) {
  const status = lk.statusById.get(p.status_id);
  const company = lk.companyById.get(p.company_id);
  const paused = p.status_kind === "en_pausa";
  const avisos = parseAvisos(warn);
  const hasAvisos = avisos.length > 0;
  const [pref, setPref] = useState<boolean | null>(() => readAvisoPref(p.id));
  const avisoOpen = hasAvisos && (pref ?? avisoOpenByDefault(avisos));
  const panelId = `aviso-${useId()}`;
  const toggleAviso = () => {
    const next = !avisoOpen;
    setPref(next);
    saveAvisoPref(p.id, next);
  };
  const bg = avisoOpen ? "#FFFAF3" : paused ? "#FFF8FA" : selected ? "#FFF6EF" : checked ? "#F4F7FB" : p.archived ? "#F9FAFB" : "#FFFFFF";
  const accent = hasAvisos ? "inset 3px 0 0 #F79009" : undefined;
  const dateBorder = hasAvisos ? "border-[#FDB022]" : "border-transparent";
  const obsText = paused && p.pause_reason ? `Pausa: ${p.pause_reason}` : p.notes || "—";
  const team = p.team_id ? lk.teamById.get(p.team_id) : undefined;
  const teamOptions = team && !team.active ? [...teams, team] : teams;
  const warnTitle = hasAvisos ? avisos.map((a) => a.text).join(" · ") : undefined;
  const triggerText = avisos.length > 1 ? `${avisos.length} avisos` : hasAvisos ? avisoShort(avisos[0]!, p, today) : "";
  return (
    <>
      <div
        role="row"
        className={`grid h-[46px] text-sm ${avisoOpen ? "" : "border-b border-line"}`}
        style={{ gridTemplateColumns: COLUMNS, background: bg, contentVisibility: "auto", containIntrinsicSize: "auto 46px" }}
      >
        <span role="cell" className={`${cell} sticky left-0 z-[1] justify-center`} style={{ background: bg, boxShadow: accent }}>
          <input
            type="checkbox"
            aria-label={`Seleccionar ${p.name}`}
            checked={checked}
            onChange={(e) => onCheck(p.id, e.target.checked)}
            className="size-4 cursor-pointer accent-[#1B1F27]"
          />
        </span>
        <span role="cell" className={`${cell} sticky left-10 z-[1] justify-center text-[13px] text-subtle`} style={{ background: bg }}>{index + 1}</span>
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
          {company && <CompanyMark company={company} size={24} decorative />}
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
          <PrepCell p={p} lk={lk} onPatch={onPatch} />
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
          <AutoDate aria-label={`Inicio de ${p.name}`} title={warnTitle} value={p.start_date} onCommit={(v) => onPatch(p.id, { start_date: v })} className={`w-full min-w-0 rounded-md border bg-transparent px-1.5 py-1 text-[13px] ${dateBorder} ${p.start_date ? "text-ink-2" : "text-faint"}`} />
        </span>
        <span role="cell" className={`${cell} min-w-0 px-1.5`}>
          <AutoDate aria-label={`Fin previsto de ${p.name}`} title={warnTitle} value={p.end_date} onCommit={(v) => onPatch(p.id, { end_date: v })} className={`w-full min-w-0 rounded-md border bg-transparent px-1.5 py-1 text-[13px] ${dateBorder} ${p.end_date ? "text-ink-2" : "text-faint"}`} />
        </span>
        <span role="cell" className={`${cell} min-w-0 gap-1.5 px-2.5`}>
          <span className="relative inline-flex shrink-0 items-center">
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
          {hasAvisos && (
            <button
              type="button"
              aria-expanded={avisoOpen}
              aria-controls={avisoOpen ? panelId : undefined}
              aria-label={`${triggerText} · ${p.name}`}
              title={avisoOpen ? "Ocultar los avisos" : "Ver los avisos"}
              onClick={toggleAviso}
              className="inline-flex h-[26px] min-w-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border border-[#FCE3B0] bg-warn-soft px-1.5 text-[11px] font-extrabold text-warn"
            >
              <WarnIcon error={avisos.some((a) => a.code === "error")} />
              <span className="truncate">{triggerText}</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 transition-transform" style={{ transform: avisoOpen ? "rotate(180deg)" : "none" }}><path d="m6 9 6 6 6-6" /></svg>
            </button>
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
        <span role="cell" className="flex items-center justify-center gap-0.5 px-1">
          {p.archived && (
            <button type="button" aria-label={`Restaurar ${p.name}`} onClick={() => onRestore(p)} className="h-[28px] cursor-pointer rounded-md border border-line bg-white px-2 text-xs font-bold text-ink-2 hover:bg-fill-2">Restaurar</button>
          )}
          <button type="button" aria-label={`Editar ${p.name}`} onClick={() => onOpen(p.id)} className="flex size-[30px] cursor-pointer items-center justify-center rounded-[7px] border-0 bg-transparent text-muted hover:bg-fill">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 20h4L19 9l-4-4L4 16z" /></svg>
          </button>
          {!p.archived && <RowMenu p={p} onOpen={onOpen} onArchive={onArchive} />}
        </span>
      </div>
      {avisoOpen && <AvisoPanel id={panelId} p={p} avisos={avisos} lk={lk} onPatch={onPatch} onOpen={onOpen} bg={bg} />}
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
        {company && <CompanyMark company={company} size={24} decorative />}
        <span className="flex min-w-0 flex-col leading-[1.3]">
          <span className="truncate text-sm font-semibold">{p.name}</span>
          <span className="truncate text-xs text-subtle">{company?.name} · {teamLabel(p, lk)}</span>
        </span>
      </span>
      <span className={`${cell} px-3`}>
        <span className="whitespace-nowrap rounded-md px-2 py-1 text-xs font-bold" style={{ background: status?.bg, color: status?.fg }}>{status?.name}</span>
      </span>
      <span className={`flex items-center whitespace-nowrap px-3 text-[13px] ${dates ? "text-ink-2" : "text-faint"}`}>{dates || waitReason(p, lk.prepItems)}</span>
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

export function StatusTabs({ statuses, counts, total, archivedCount, value, onChange }: { statuses: Status[]; counts: Map<string, number>; total: number; archivedCount: number; value: string; onChange: (id: string) => void }): ReactNode {
  const tabs = [{ id: "all", name: "Todos", dot: "#1B1F27", count: total }, ...statuses.map((s) => ({ id: s.id, name: s.name, dot: s.dot, count: counts.get(s.id) ?? 0 }))];
  const tab = "flex h-12 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap border-0 border-b-2 bg-transparent px-2.5 text-sm";
  const badge = (on: boolean) => ({ color: on ? "#9A3412" : "#475467", background: on ? "#FFF1E7" : "#F2F4F7" });
  const archivedOn = value === "archived";
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
            className={tab}
            style={{ borderBottomColor: on ? "#EA6A1F" : "transparent", color: on ? "#1B1F27" : "#667085", fontWeight: on ? 700 : 600 }}
          >
            <span aria-hidden className="size-2 rounded-full" style={{ background: t.dot }} />
            {t.name}
            <span className="rounded-md px-[7px] py-px text-xs font-bold" style={badge(on)}>{t.count}</span>
          </button>
        );
      })}
      <span aria-hidden className="mx-2 my-3 w-px shrink-0 bg-line" />
      <button
        type="button"
        aria-pressed={archivedOn}
        onClick={() => onChange("archived")}
        className={tab}
        style={{ borderBottomColor: archivedOn ? "#EA6A1F" : "transparent", color: archivedOn ? "#1B1F27" : "#667085", fontWeight: archivedOn ? 700 : 600 }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v10h14V9M10 13h4" /></svg>
        Archivados
        <span className="rounded-md px-[7px] py-px text-xs font-bold" style={badge(archivedOn)}>{archivedCount}</span>
      </button>
    </div>
  );
}
