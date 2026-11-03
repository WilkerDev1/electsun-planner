import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../../ui/api";
import type { HistoryEntry, Project } from "../../../shared/contracts/projects";
import type { Status } from "../../../shared/contracts/statuses";
import {
  addDays, dayLabel, lateDays, mondayOf, parseKwp, placeBar, plural, rangeLabel, shortDate, teamClash,
  waitReason, waitLabel, prepRows, workdayIndex, missingPrep,
} from "../../../shared/domain";
import { AutoArea, AutoDate, AutoText } from "./inputs";
import { ago, describeChange, isClashWarning, isLateWarning, teamLabel, toggledPrep, type Catalogs, type EditPatch, type Lookup } from "./model";
import { Monogram } from "./Table";
import type { SaveState } from "./store";

// Panel de edición (PRY-06): las mismas secciones del artboard V4Proyectos con `abierto`.
// Guarda solo: cada campo se envía al dejar de escribir o al cambiar.

const card = "flex flex-col gap-2.5 rounded-[14px] border border-line bg-white p-3";
const fld = "flex flex-col gap-0.5 rounded-[10px] border border-line bg-white px-3 py-2 focus-within:border-brand focus-within:shadow-[0_0_0_3px_rgba(234,106,31,0.16)]";
const fldLabel = "text-xs font-semibold text-subtle";
const fldInput = "min-w-0 border-0 bg-transparent p-0 text-sm font-medium text-ink !outline-none";

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="m-0 flex items-center justify-between text-sm font-bold">
        {title}
        {aside}
      </h3>
      {children}
    </section>
  );
}

function Switch({ on, onChange, label, disabled, describedBy }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; describedBy?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`flex h-6 w-10 shrink-0 items-center rounded-full border-0 p-[3px] disabled:opacity-50 ${on ? "justify-end bg-navy" : "justify-start bg-faint"} ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span className="size-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(16,24,40,0.2)]" />
    </button>
  );
}

const Alert = ({ tone = "warn", icon, children }: { tone?: "warn" | "danger"; icon: ReactNode; children: ReactNode }) => (
  <div role={tone === "danger" ? "alert" : "status"} className={`flex items-start gap-2 rounded-[10px] border px-2.5 py-2 text-[13px] font-semibold ${tone === "warn" ? "border-[#FCE3B0] bg-warn-soft text-warn" : "border-[#FECDCA] bg-danger-soft text-danger"}`}>
    <span className="mt-px shrink-0">{icon}</span>
    <span className="min-w-0">{children}</span>
  </div>
);
const WarnIcon = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M12 3 2 21h20zM12 10v5M12 18h.01" /></svg>;
const ClockIcon = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;

type Props = {
  project: Project;
  catalogs: Catalogs;
  lk: Lookup;
  /** Todos los proyectos cargados, para el choque de equipo. */
  rows: Project[];
  today: string;
  isAdmin: boolean;
  save: SaveState;
  lastError: string | null;
  /** Avisos que calculó el servidor (o los locales si aún no hay respuesta). */
  warnings: string[];
  /** Estado al que se quiere pasar y falta completar datos (viene de la tabla). */
  initialDraft?: string | null;
  focusName?: boolean;
  onPatch: (id: string, fields: EditPatch) => void;
  onClose: () => void;
  onArchive: (id: string, archived: boolean) => Promise<boolean>;
};

export function Panel({ project: p, catalogs, lk, rows, today, isAdmin, save, lastError, warnings, initialDraft, focusName, onPatch, onClose, onArchive }: Props) {
  const status = lk.statusById.get(p.status_id);
  const company = lk.companyById.get(p.company_id);
  const patch = (fields: EditPatch) => onPatch(p.id, fields);
  const nameRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLInputElement>(null);
  const [draftStatus, setDraftStatus] = useState<string | null>(initialDraft && initialDraft !== p.status_id ? initialDraft : null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const priorityHint = useId();

  useEffect(() => {
    if (focusName) {
      nameRef.current?.focus();
      nameRef.current?.select();
    }
  }, [focusName]);

  // ----- Estado (VAL-01, VAL-02): solo se cambia cuando los datos que pide están completos -----
  const shownStatus: Status | undefined = (draftStatus ? lk.statusById.get(draftStatus) : null) ?? status;
  const missingFor = (s: Status) => {
    const need: string[] = [];
    if (s.requires_schedule && !p.start_date) need.push("la fecha de inicio");
    if (s.requires_schedule && !p.team_id) need.push("el equipo");
    if (s.requires_reason && !p.pause_reason.trim()) need.push("el motivo de la pausa");
    return need;
  };
  const draft = draftStatus ? lk.statusById.get(draftStatus) : undefined;
  const draftMissing = draft ? missingFor(draft) : [];
  useEffect(() => {
    // Cuando ya están los datos, el estado pendiente se guarda solo.
    if (draft && !draftMissing.length) {
      setDraftStatus(null);
      onPatch(p.id, { status_id: draft.id });
    }
  }, [draft, draftMissing.length, onPatch, p.id]);
  // Al elegir un estado que pide motivo, el foco va al campo; el motivo se lee por ref para no robar el foco al escribir.
  const reasonEmpty = useRef(false);
  reasonEmpty.current = !p.pause_reason.trim();
  const draftNeedsReason = !!draft?.requires_reason;
  useEffect(() => {
    if (draftNeedsReason && reasonEmpty.current) reasonRef.current?.focus();
  }, [draft?.id, draftNeedsReason]);

  function pickStatus(s: Status) {
    if (s.id === p.status_id) return setDraftStatus(null);
    if (missingFor(s).length) return setDraftStatus(s.id);
    setDraftStatus(null);
    patch({ status_id: s.id });
  }

  // ----- Preparación (CAL-07) -----
  const miss = missingPrep(p, catalogs.prepItems);
  const prepItems = prepRows(p, catalogs.prepItems).map(({ item, applies, done }) => ({
    key: item.id, title: item.name, applies, done, hint: applies ? `Si falta: ${waitLabel(item.pending_label)}` : "No aplica a este tipo de sistema",
  }));

  // ----- Programación y vista previa (CAL-03, CAL-05, PRY-07) -----
  const teams = catalogs.teams.filter((t) => t.active || t.id === p.team_id);
  const from = mondayOf(today);
  const bar = p.start_date ? placeBar(p.start_date, p.end_date, from, 2) : null;
  const clash = useMemo(
    () =>
      p.team_id && p.start_date
        ? teamClash(
            { id: p.id, name: p.name, team_id: p.team_id, start_date: p.start_date, end_date: p.end_date, kind: p.status_kind },
            rows.map((o) => ({ id: o.id, name: o.name, team_id: o.team_id, start_date: o.start_date, end_date: o.end_date, archived: o.archived, kind: o.status_kind })),
          )
        : null,
    [p.id, p.name, p.team_id, p.start_date, p.end_date, p.status_kind, rows],
  );
  const late = lateDays(p.status_kind, p.end_date, today);
  const todayLeft = `calc(${(((workdayIndex(today, from) + 0.5) / 12) * 100).toFixed(3)}% - 1px)`;
  const rangeText = !p.start_date
    ? "Sin fecha: no aparece en el calendario"
    : !bar?.visible
      ? "Fuera de las próximas dos semanas"
      : `${rangeLabel(p.start_date, p.end_date)} · ${teamLabel(p, lk)}`;
  const otherWarnings = warnings.filter((w) => !isClashWarning(w) && !isLateWarning(w));
  const reasonNeeded = !!shownStatus?.requires_reason;

  return (
    <aside aria-label="Editar proyecto" className="sticky top-4 flex max-h-[calc(100dvh-32px)] min-w-0 flex-col rounded-[18px] border border-line bg-fill-2 shadow-[0_12px_32px_rgba(16,24,40,0.08)]">
      <div className="flex items-center justify-between gap-3 px-5 pb-1.5 pt-[18px]">
        <div className="flex min-w-0 items-center gap-3">
          <Monogram code={company?.code ?? "··"} color={company?.color} size={40} />
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="text-[13px] font-semibold text-subtle">Editar proyecto</span>
            <span className="truncate text-xl font-extrabold">{p.name}</span>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar panel" className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-[10px] border-0 bg-transparent text-muted hover:bg-fill">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-5 pb-5 pt-3">
        {p.archived && (
          <Alert icon={WarnIcon}>
            Este proyecto está archivado y no aparece en el mural ni en el móvil.{" "}
            <button type="button" className="cursor-pointer border-0 bg-transparent p-0 font-bold text-warn underline" onClick={() => void onArchive(p.id, false)}>Desarchivar</button>
          </Alert>
        )}
        {otherWarnings.length > 0 && (
          <Alert icon={WarnIcon}>
            <span className="sr-only">Avisos: </span>
            {otherWarnings.map((w) => <span key={w} className="block">{w}</span>)}
          </Alert>
        )}

        <Section title="Datos del proyecto">
          <div className="grid grid-cols-2 gap-2.5 rounded-[14px] border border-line bg-white p-3">
            <label className={`${fld} col-span-2`}>
              <span className={fldLabel}>Proyecto / cliente</span>
              <AutoText ref={nameRef} value={p.name} maxLength={160} valid={(v) => v.trim().length > 0} onCommit={(v) => patch({ name: v.trim() })} className={`${fldInput} !font-semibold`} />
            </label>
            <label className={fld}>
              <span className={fldLabel}>Empresa</span>
              <select value={p.company_id} onChange={(e) => patch({ company_id: e.target.value })} className={`${fldInput} cursor-pointer`}>
                {catalogs.companies.filter((c) => c.active || c.id === p.company_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className={fld}>
              <span className={fldLabel}>Potencia (kWp)</span>
              <AutoText
                inputMode="decimal"
                value={p.kwp ?? ""}
                valid={(v) => parseKwp(v) !== undefined}
                onCommit={(v) => patch({ kwp: parseKwp(v) ?? null })}
                className={`${fldInput} tabular-nums`}
              />
            </label>
            <label className={fld}>
              <span className={fldLabel}>Lugar</span>
              <AutoText value={p.place} maxLength={120} onCommit={(v) => patch({ place: v.trim() })} className={fldInput} />
            </label>
            <label className={fld}>
              <span className={fldLabel}>Fecha de venta</span>
              <AutoDate value={p.sale_date} onCommit={(v) => patch({ sale_date: v })} className={fldInput} />
            </label>
            <label className={`${fld} col-span-2`}>
              <span className={fldLabel}>Encargado</span>
              <select value={p.lead_employee_id ?? ""} onChange={(e) => patch({ lead_employee_id: e.target.value || null })} className={`${fldInput} cursor-pointer`}>
                <option value="">
                  {(() => {
                    const lead = p.team_id ? lk.employeeById.get(lk.teamById.get(p.team_id)?.lead_employee_id ?? "") : undefined;
                    return lead ? `Del equipo: ${lead.name}` : "Sin asignar";
                  })()}
                </option>
                {catalogs.employees.filter((e) => e.state !== "De baja" || e.id === p.lead_employee_id).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </label>
          </div>
        </Section>

        <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend className="pb-2 text-sm font-bold">Estado</legend>
          <div className={card}>
            <div className="flex flex-wrap gap-1.5">
              {catalogs.statuses.map((s) => {
                const on = shownStatus?.id === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => pickStatus(s)}
                    className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-bold"
                    style={{ borderColor: on ? s.dot : "#EAECF0", background: on ? s.bg : "#FFFFFF", color: on ? s.fg : "#475467" }}
                  >
                    <span aria-hidden className="size-[7px] rounded-full" style={{ background: s.dot }} />
                    {s.name}
                  </button>
                );
              })}
            </div>
            {draft && draftMissing.length > 0 && (
              <Alert icon={WarnIcon}>
                Para pasar a {draft.name} completa primero {draftMissing.join(" y ")}. Se guarda solo al terminar.
              </Alert>
            )}
            {reasonNeeded && (
              <label className={`${fld} !border-[#F3B8CB] !bg-[#FFF8FA]`}>
                <span className="text-xs font-bold text-[#A11C47]">Motivo de la pausa · obligatorio</span>
                <AutoText
                  ref={reasonRef}
                  value={p.pause_reason}
                  maxLength={200}
                  placeholder="Ej.: esperando documentos del cliente"
                  valid={(v) => !status?.requires_reason || v.trim() !== ""}
                  onCommit={(v) => patch({ pause_reason: v.trim() })}
                  className={fldInput}
                />
              </label>
            )}
          </div>
        </fieldset>

        <Section
          title="Preparación"
          aside={
            <span className="rounded-md px-2 py-0.5 text-xs font-bold" style={{ color: miss.length ? "#B54708" : "#157F3D", background: miss.length ? "#FFFAEB" : "#E7F7EE" }}>
              {miss.length ? waitReason(p, catalogs.prepItems) : "Completa"}
            </span>
          }
        >
          <div className={card}>
            <div role="group" aria-label="Tipo de sistema" className="flex rounded-[10px] bg-fill p-[3px]">
              {([["neta", "Medición neta"], ["hibrido", "Híbrido"]] as const).map(([v, label]) => {
                const on = p.system_type === v;
                return (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={on}
                    onClick={() => patch({ system_type: v })}
                    className={`h-[34px] flex-1 cursor-pointer rounded-lg border-0 text-[13px] font-bold ${on ? "bg-white text-ink shadow-[0_1px_2px_rgba(16,24,40,0.1)]" : "bg-transparent text-muted"}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {prepItems.map((c) => {
              const na = !c.applies;
              const ok = !na && c.done;
              return (
                <button
                  key={c.key}
                  type="button"
                  role="checkbox"
                  aria-checked={ok}
                  disabled={na}
                  onClick={() => patch({ prep: toggledPrep(p, c.key) })}
                  className="flex min-h-11 items-center gap-2.5 rounded-[10px] border px-2.5 py-1.5 text-left"
                  style={{ background: na ? "#F9FAFB" : "#FFFFFF", borderColor: na ? "#F0F1F4" : ok ? "#D7EFE0" : "#F6DDB3", cursor: na ? "default" : "pointer" }}
                >
                  <span aria-hidden className="flex size-[22px] shrink-0 items-center justify-center rounded-md border-2 text-white" style={{ background: ok ? "#16A34A" : "#FFFFFF", borderColor: na ? "#D0D5DD" : ok ? "#16A34A" : "#F59E0B" }}>
                    {ok && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round"><path d="m5 12 5 5 9-10" /></svg>}
                  </span>
                  <span className="flex flex-col leading-[1.3]">
                    <span className={`text-sm font-bold ${na ? "text-faint" : "text-ink"}`}>{c.title}{na ? " (no aplica)" : ""}</span>
                    <span className="text-xs text-subtle">{c.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Section>

        <Section title="Programación">
          <div className={`${card} !gap-3`}>
            <div className="grid grid-cols-[84px_minmax(0,1.35fr)_minmax(0,0.8fr)] gap-2.5">
              <label className={fld}>
                <span className={fldLabel}>Equipo</span>
                <select value={p.team_id ?? ""} onChange={(e) => patch({ team_id: e.target.value || null })} className={`${fldInput} cursor-pointer !font-semibold`}>
                  <option value="">Sin equipo</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.code}</option>)}
                </select>
              </label>
              <label className={fld}>
                <span className={fldLabel}>Inicio</span>
                <AutoDate value={p.start_date} onCommit={(v) => patch({ start_date: v })} className={fldInput} />
              </label>
              <label className={fld}>
                <span className={fldLabel}>Días estimados</span>
                <AutoText
                  type="number"
                  min={1}
                  max={120}
                  inputMode="numeric"
                  value={p.estimated_days === null ? "" : String(p.estimated_days)}
                  valid={(v) => v === "" || (Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 120)}
                  onCommit={(v) => v !== "" && patch({ estimated_days: Number(v) })}
                  className={`${fldInput} tabular-nums !font-semibold`}
                />
              </label>
            </div>
            <div className="flex items-center justify-between gap-2.5 rounded-[10px] bg-fill-2 px-3 py-2 text-[13px] text-muted">
              <span>Fin previsto · <strong className="text-ink">{p.end_date ? dayLabel(p.end_date) : "pon inicio y días"}</strong></span>
              <span className="text-subtle">lunes a sábado</span>
            </div>
            {late > 0 && p.end_date && <Alert icon={ClockIcon}>Atrasada {plural(late, "día", "días")}: debía terminar el {dayLabel(p.end_date)}</Alert>}
            <div className="flex flex-col gap-1.5">
              <span className={fldLabel} id="preview-label">Vista previa en el calendario del mural · {shortDate(from)} – {shortDate(addDays(from, 12))}</span>
              <div role="img" aria-labelledby="preview-label preview-text" className="relative h-[26px] overflow-hidden rounded-lg border border-line" style={{ background: "repeating-linear-gradient(to right, #FFFFFF 0, #FFFFFF calc(8.3333% - 1px), #EEF0F3 calc(8.3333% - 1px), #EEF0F3 8.3333%)" }}>
                {bar?.visible && status && (
                  <div
                    className="absolute bottom-1 top-1 box-border"
                    style={{
                      left: `${(bar.col / 12) * 100}%`,
                      width: `${(bar.span / 12) * 100}%`,
                      background: status.bg,
                      border: `1.5px solid ${status.dot}`,
                      borderRadius: `${bar.clipStart ? 0 : 6}px ${bar.clipEnd ? 0 : 6}px ${bar.clipEnd ? 0 : 6}px ${bar.clipStart ? 0 : 6}px`,
                    }}
                  />
                )}
                <div className="absolute bottom-0 top-0 w-0.5 bg-today" style={{ left: todayLeft }} />
              </div>
              <span id="preview-text" className={`text-[13px] font-semibold ${bar?.visible ? "text-ink-2" : "text-subtle"}`}>{rangeText}</span>
            </div>
            {clash && <Alert icon={WarnIcon}>{teamLabel(p, lk)} ya está en {clash.name} esos días</Alert>}
          </div>
        </Section>

        <Section title="En el mural">
          <div className="flex flex-col rounded-[14px] border border-line bg-white">
            <div className="flex items-center gap-3 border-b border-[#F0F1F4] px-3.5 py-3">
              <Switch on={p.priority} onChange={(v) => patch({ priority: v })} label="Prioridad" disabled={!isAdmin} describedBy={priorityHint} />
              <span className="flex flex-col gap-px">
                <span className="text-sm font-semibold">Prioridad</span>
                <span id={priorityHint} className="text-xs text-subtle">
                  {isAdmin ? "Sale primero y con bandera en el mural" : "Solo el administrador cambia la prioridad. Pídesela a la jefatura."}
                </span>
              </span>
            </div>
            <div className="flex flex-col gap-2.5 px-3.5 py-3">
              <label className={fld}>
                <span className={fldLabel}>Observación</span>
                <AutoArea rows={2} maxLength={500} value={p.notes} placeholder="Algo que el equipo deba saber…" onCommit={(v) => patch({ notes: v.trim() })} className={`${fldInput} resize-y leading-normal`} />
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <Switch on={p.show_on_mural} onChange={(v) => patch({ show_on_mural: v })} label="Mostrar la observación en el mural" />
                <span className="text-sm font-semibold text-ink-2">Mostrar en el mural hasta</span>
                <AutoDate aria-label="Mostrar hasta" disabled={!p.show_on_mural} value={p.mural_until} onCommit={(v) => patch({ mural_until: v })} className="h-8 rounded-lg border border-line bg-white px-2 text-[13px] text-ink-2 disabled:opacity-50" />
              </div>
            </div>
          </div>
        </Section>

        <History project={p} lk={lk} />
      </div>

      <div className="flex items-center gap-3 border-t border-line px-5 py-3.5">
        {confirmArchive ? (
          <span className="flex items-center gap-2 text-sm font-semibold text-ink-2">
            ¿Archivar?
            <button type="button" className="h-9 cursor-pointer rounded-lg border-0 bg-danger px-3 text-sm font-bold text-white" onClick={() => void onArchive(p.id, true).then((ok) => ok && onClose())}>Sí, archivar</button>
            <button type="button" className="h-9 cursor-pointer rounded-lg border border-line bg-white px-3 text-sm font-semibold" onClick={() => setConfirmArchive(false)}>Cancelar</button>
          </span>
        ) : p.archived ? (
          <button type="button" onClick={() => void onArchive(p.id, false)} className="h-10 cursor-pointer border-0 bg-transparent px-1 text-sm font-semibold text-muted">Desarchivar</button>
        ) : (
          <button type="button" onClick={() => setConfirmArchive(true)} className="h-10 cursor-pointer border-0 bg-transparent px-1 text-sm font-semibold text-muted">Archivar</button>
        )}
        <span role="status" aria-live="polite" className="ml-auto flex items-center gap-1.5 text-[13px]" style={{ color: save === "error" ? "#B42318" : "#667085" }}>
          {save === "error" ? (
            <>No se guardó{lastError ? `: ${lastError}` : ""}</>
          ) : save === "saving" ? (
            <>Guardando…</>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0B7A68" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m5 12 5 5 9-10" /></svg>
              Guardado
            </>
          )}
        </span>
        <button type="button" onClick={onClose} className="h-10 cursor-pointer rounded-[10px] border-0 bg-ink px-5 text-sm font-bold text-white">Listo</button>
      </div>
    </aside>
  );
}

/** Historial de cambios (HIS-02): se vuelve a pedir cada vez que el proyecto cambia de versión. */
function History({ project, lk }: { project: Project; lk: Lookup }) {
  const [items, setItems] = useState<HistoryEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    api<HistoryEntry[]>(`/projects/${project.id}/history`)
      .then((h) => alive && (setItems(h), setFailed(false)))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [project.id, project.version]);
  return (
    <details className="group rounded-[14px] border border-line bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2.5 px-3.5 py-3 text-sm font-bold [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#667085" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2" /></svg>
          Historial de cambios
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#667085" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="transition-transform group-open:rotate-90"><path d="m9 6 6 6-6 6" /></svg>
      </summary>
      <ol className="m-0 flex list-none flex-col gap-2.5 border-t border-[#F0F1F4] px-3.5 pb-3.5 pt-1">
        {failed && <li className="pt-2 text-[13px] text-danger">No se pudo cargar el historial.</li>}
        {!failed && items === null && <li className="pt-2 text-[13px] text-subtle">Cargando…</li>}
        {items?.length === 0 && <li className="pt-2 text-[13px] text-subtle">Todavía no hay cambios registrados.</li>}
        {items?.map((h) => (
          <li key={h.id} className="flex flex-col gap-0.5 pt-2 text-[13px]">
            <span><strong>{h.actor_name ?? "Alguien"}</strong> {describeChange(h, lk)}</span>
            <span className="text-subtle">{ago(h.created_at)}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
