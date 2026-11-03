import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../ui/auth";
import { Banner, Button, Empty, useFlash } from "../../ui/components";
import { Modal } from "../../ui/Modal";
import type { Project } from "../../../shared/contracts/projects";
import { Header, Row, CompactHeader, CompactRow, StatusTabs, TABLE_MIN_WIDTH } from "./Table";
import { Panel } from "./Panel";
import { ImportDialog } from "./ImportDialog";
import { AVISO_SEP, STALE_DAYS, buildLookup, computeWarnings, filterRows, staleFinished } from "./model";
import { useProjects } from "./store";

// Proyectos: tabla tipo Excel y panel de edición (V4Proyectos). Rutas /proyectos y /proyectos/:id.

const button = "flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink-2 no-underline hover:bg-fill-2";
const SCROLL_MAX = "calc(100dvh - 250px)";

export default function Proyectos() {
  const { user, today } = useAuth();
  const isAdmin = user?.role === "admin";
  const navigate = useNavigate();
  // `navigate` cambia con cada ruta; el ref evita invalidar el memo de las filas (500) al abrir o cerrar el panel.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const location = useLocation();
  const { "*": splat } = useParams();
  const openId = splat?.split("/")[0] || null;
  const state = (location.state ?? {}) as { draftStatus?: string; isNew?: boolean };
  const { flash: flashNow, node: flashNode } = useFlash(3600);
  // `flash` cambia en cada render; esta versión estable evita repintar toda la tabla.
  const flashRef = useRef(flashNow);
  flashRef.current = flashNow;
  const flash = useCallback((text: string, tone?: "ok" | "danger") => flashRef.current(text, tone), []);
  const store = useProjects(today, flash);
  const { rows, catalogs, patch } = store;
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [importing, setImporting] = useState(false);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [undo, setUndo] = useState<{ ids: string[]; text: string } | null>(null);
  const [confirmStale, setConfirmStale] = useState(false);
  const archivedView = statusFilter === "archived";

  const lk = useMemo(() => (catalogs ? buildLookup(catalogs) : null), [catalogs]);
  const activeTeams = useMemo(() => catalogs?.teams.filter((t) => t.active) ?? [], [catalogs]);

  // Un proyecto abierto que no está en la lista (archivado) se pide aparte.
  const { refreshRow } = store;
  useEffect(() => {
    if (!openId || !rows || rows.some((r) => r.id === openId)) return;
    refreshRow(openId).catch(() => {
      flash("No encontré ese proyecto.", "danger");
      navigateRef.current("/proyectos", { replace: true });
    });
  }, [openId, rows, refreshRow, flash]);

  // La fila abierta queda a la vista en la lista compacta.
  useEffect(() => {
    if (openId) document.querySelector('[aria-label="Lista de proyectos"] [aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [openId, rows?.length]);

  const warnings = useMemo(() => (rows && lk ? computeWarnings(rows, lk, today) : new Map<string, string[]>()), [rows, lk, today]);
  const warnOf = useCallback(
    (p: Project) => (store.serverWarnings[p.id] ?? warnings.get(p.id) ?? []).join(AVISO_SEP),
    [store.serverWarnings, warnings],
  );

  // Las pestañas de estado nunca muestran archivados; la pestaña «Archivados» muestra solo ellos (PRY-10).
  const searched = useMemo(() => (lk ? filterRows(rows ?? [], "all", query, lk) : []), [rows, query, lk]);
  const archivedRows = useMemo(() => searched.filter((p) => p.archived), [searched]);
  const activeRows = useMemo(() => searched.filter((p) => !p.archived), [searched]);
  const list = useMemo(
    () => (archivedView ? archivedRows : statusFilter === "all" ? activeRows : activeRows.filter((p) => p.status_id === statusFilter)),
    [archivedView, archivedRows, activeRows, statusFilter],
  );
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of activeRows) m.set(p.status_id, (m.get(p.status_id) ?? 0) + 1);
    return m;
  }, [activeRows]);
  const stale = useMemo(() => staleFinished(rows ?? [], today), [rows, today]);

  // La selección solo contiene filas que siguen en la lista.
  const selectedIds = useMemo(() => list.filter((p) => checked.has(p.id)).map((p) => p.id), [list, checked]);
  const onCheck = useCallback((id: string, on: boolean) => setChecked((prev) => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n; }), []);
  const changeFilter = useCallback((id: string) => { setStatusFilter(id); setChecked(new Set()); }, []);

  // Deshacer dura unos 6 s (PRY-10).
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 6000);
    return () => clearTimeout(t);
  }, [undo]);

  const { archiveMany } = store;
  const archiveIds = useCallback(
    async (ids: string[], text: string) => {
      const changed = await archiveMany(ids, true);
      if (changed === null) return;
      setChecked(new Set());
      setUndo({ ids, text });
    },
    [archiveMany],
  );
  const restoreIds = useCallback(
    async (ids: string[], text: string) => {
      const changed = await archiveMany(ids, false);
      if (changed === null) return;
      setChecked(new Set());
      setUndo(null);
      flash(text);
    },
    [archiveMany, flash],
  );
  const archiveOne = useCallback((p: Project) => void archiveIds([p.id], "Proyecto archivado"), [archiveIds]);
  const restoreOne = useCallback((p: Project) => void restoreIds([p.id], "Proyecto restaurado"), [restoreIds]);
  const undoArchive = async () => {
    if (!undo) return;
    const ids = undo.ids;
    setUndo(null);
    await restoreIds(ids, ids.length === 1 ? "Proyecto restaurado" : `${ids.length} proyectos restaurados`);
  };

  const open = useCallback((id: string) => navigateRef.current(`/proyectos/${id}`), []);
  const close = useCallback(() => navigateRef.current("/proyectos"), []);

  // VAL-01/02 en la interfaz: el estado solo cambia cuando los datos que pide están completos.
  const pickStatus = useCallback(
    (p: Project, statusId: string) => {
      const s = lk?.statusById.get(statusId);
      if (!s) return;
      const need = [
        s.requires_schedule && !p.start_date && "la fecha de inicio",
        s.requires_schedule && !p.team_id && "el equipo",
        s.requires_schedule && !p.end_date && !p.estimated_days && "el fin previsto o los días estimados",
        s.requires_reason && !p.pause_reason.trim() && "el motivo de la pausa",
      ].filter(Boolean);
      if (need.length) {
        flash(`Para pasar a ${s.name} falta ${need.join(" y ")}. Complétalo en el panel.`, "danger");
        navigateRef.current(`/proyectos/${p.id}`, { state: { draftStatus: statusId } });
      } else patch(p.id, { status_id: statusId });
    },
    [lk, patch, flash],
  );

  async function addProject() {
    const companies = catalogs?.companies.filter((c) => c.active) ?? [];
    const company = companies.find((c) => c.name === "Electsun") ?? companies[0];
    if (!company) return flash("Primero agrega una empresa en Equipo.", "danger");
    const created = await store.create(company.id, "Nuevo proyecto");
    if (!created) return;
    changeFilter("all");
    setQuery("");
    navigate(`/proyectos/${created.id}`, { state: { isNew: true } });
  }

  const current = openId ? (rows?.find((r) => r.id === openId) ?? null) : null;
  const compact = !!openId;
  const exportHref = `/api/projects/export?${new URLSearchParams({ ...(statusFilter !== "all" ? { status: statusFilter } : {}), ...(query.trim() ? { q: query.trim() } : {}) })}`;

  const savingText =
    store.save === "saving" ? "Guardando…" : store.save === "error" ? "No se pudo guardar el último cambio" : "Los cambios se guardan solos y aparecen en el mural al instante";
  const dot = store.save === "error" ? "#B42318" : store.save === "saving" ? "#F79009" : "#0B7A68";

  let body: ReactNode;
  if (store.error && !rows) {
    body = (
      <div className="flex flex-col items-start gap-3 p-6">
        <Banner tone="danger">{store.error}</Banner>
        <button type="button" className={button} onClick={() => void store.reload()}>Reintentar</button>
      </div>
    );
  } else if (!rows || !lk || !catalogs) {
    body = <p role="status" className="m-0 px-6 py-16 text-center text-sm text-subtle">Cargando proyectos…</p>;
  } else if (list.length === 0) {
    const any = archivedView ? archivedRows.length > 0 || query.trim() !== "" : (rows ?? []).some((p) => !p.archived);
    body = (
      <Empty title={archivedView && !query.trim() ? "No hay proyectos archivados" : any ? "Ningún proyecto coincide" : "Todavía no hay proyectos"}>
        {archivedView && !query.trim() ? "Cuando archives un proyecto, lo verás aquí y podrás restaurarlo." : any ? "Prueba con otra búsqueda o con otro estado." : "Crea el primero con «Nuevo proyecto» o importa tu Excel."}
        <div className="mt-3 flex justify-center gap-2">
          {archivedView && !query.trim() ? (
            <button type="button" className={button} onClick={() => changeFilter("all")}>Ver los proyectos activos</button>
          ) : any ? (
            <button type="button" className={button} onClick={() => { setQuery(""); changeFilter("all"); }}>Quitar filtros</button>
          ) : (
            <button type="button" className={button} onClick={() => setImporting(true)}>Importar Excel</button>
          )}
        </div>
      </Empty>
    );
  } else if (compact) {
    body = (
      <div aria-label="Lista de proyectos" className="overflow-y-auto border-t border-line" style={{ maxHeight: SCROLL_MAX }}>
        <CompactHeader />
        {list.map((p, i) => <CompactRow key={p.id} p={p} index={i} selected={p.id === openId} lk={lk} onOpen={open} />)}
      </div>
    );
  } else {
    body = (
      <div className="overflow-auto border-t border-line" style={{ maxHeight: SCROLL_MAX }}>
        <div role="table" aria-label="Tabla de proyectos" aria-rowcount={list.length + 1} style={{ minWidth: TABLE_MIN_WIDTH }}>
          <Header allChecked={list.length > 0 && selectedIds.length === list.length} someChecked={selectedIds.length > 0} onToggleAll={(on) => setChecked(on ? new Set(list.map((p) => p.id)) : new Set())} />
          {list.map((p, i) => (
            <Row key={p.id} p={p} index={i} selected={false} checked={checked.has(p.id)} onCheck={onCheck} onArchive={archiveOne} onRestore={restoreOne} warn={warnOf(p)} today={today} isAdmin={isAdmin} statuses={catalogs.statuses} teams={activeTeams} lk={lk} onPatch={patch} onOpen={open} onPickStatus={pickStatus} />
          ))}
        </div>
        {/* Fuera del role="table": una tabla solo puede contener filas (axe aria-required-children). */}
        <button type="button" onClick={() => void addProject()} className="flex h-11 w-full cursor-pointer items-center gap-2 border-0 bg-white px-4 text-left text-sm font-semibold text-muted hover:bg-fill-2">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
            Agregar proyecto
          </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-1 pb-10">
      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 text-[28px] font-extrabold tracking-tight">Proyectos</h1>
        <span role="status" className="flex items-center gap-2 text-sm text-muted">
          <span aria-hidden className="size-2 rounded-full" style={{ background: dot }} />
          {savingText}
        </span>
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <section aria-label="Proyectos" className="min-w-0 flex-[999_1_600px] overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          {catalogs && <StatusTabs statuses={catalogs.statuses} counts={counts} total={activeRows.length} archivedCount={archivedRows.length} value={statusFilter} onChange={changeFilter} />}
          <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex h-9 w-60 max-w-full items-center gap-2 rounded-lg border border-line bg-white px-2.5 focus-within:border-brand">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#667085" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                <input type="search" aria-label="Buscar proyecto" placeholder="Buscar proyecto o lugar…" value={query} onChange={(e) => setQuery(e.target.value)} className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none" />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={button} onClick={() => setImporting(true)}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></svg>
                Importar Excel
              </button>
              <a className={button} href={exportHref} download>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3v12M7 10l5 5 5-5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></svg>
                Exportar
              </a>
              <button type="button" onClick={() => void addProject()} disabled={!catalogs} className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-ink px-3.5 text-sm font-bold text-white disabled:opacity-50">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
                Nuevo proyecto
              </button>
            </div>
          </div>
          {stale.length > 0 && !archivedView && (
            <div role="note" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line bg-fill-2 px-4 py-2 text-[13px] text-muted">
              <span>{stale.length === 1 ? "1 proyecto terminado" : `${stale.length} proyectos terminados`} hace más de {STALE_DAYS} días</span>
              <button type="button" onClick={() => setConfirmStale(true)} className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-bold text-ink-2 underline">
                {stale.length === 1 ? "Archivarlo" : "Archivarlos"}
              </button>
            </div>
          )}
          {selectedIds.length > 0 && (
            <div role="region" aria-label="Acciones para los proyectos seleccionados" className="flex flex-wrap items-center gap-3 border-t border-line bg-[#F4F7FB] px-4 py-2">
              <span className="text-sm font-semibold text-ink">{selectedIds.length === 1 ? "1 seleccionado" : `${selectedIds.length} seleccionados`}</span>
              {archivedView ? (
                <button type="button" className={button} onClick={() => void restoreIds(selectedIds, `${selectedIds.length} ${selectedIds.length === 1 ? "proyecto restaurado" : "proyectos restaurados"}`)}>
                  Restaurar seleccionados ({selectedIds.length})
                </button>
              ) : (
                <button type="button" className={button} onClick={() => void archiveIds(selectedIds, `${selectedIds.length} ${selectedIds.length === 1 ? "proyecto archivado" : "proyectos archivados"}`)}>
                  Archivar seleccionados ({selectedIds.length})
                </button>
              )}
              <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-sm font-semibold text-muted underline" onClick={() => setChecked(new Set())}>Quitar selección</button>
            </div>
          )}
          {body}
        </section>

        {compact && current && lk && catalogs && (
          <div className="min-w-0 max-w-[520px] flex-[1_1_440px] self-stretch">
            <Panel
              key={current.id}
              project={current}
              catalogs={catalogs}
              lk={lk}
              rows={rows ?? []}
              today={today}
              isAdmin={isAdmin}
              save={store.save}
              lastError={store.lastError}
              warnings={store.serverWarnings[current.id] ?? warnings.get(current.id) ?? []}
              initialDraft={state.draftStatus ?? null}
              focusName={!!state.isNew}
              onPatch={patch}
              onClose={close}
              onArchive={store.setArchived}
            />
          </div>
        )}
      </div>

      {importing && <ImportDialog onClose={() => setImporting(false)} onApplied={() => void store.reloadProjects()} />}
      {confirmStale && (
        <Modal title="Archivar proyectos terminados" subtitle={`Terminaron hace más de ${STALE_DAYS} días. Dejan de verse en el mural y el móvil; puedes restaurarlos desde Archivados.`} onClose={() => setConfirmStale(false)}>
          <ul className="m-0 mb-4 max-h-60 list-disc overflow-y-auto pl-5 text-sm text-ink-2">
            {stale.map((p) => <li key={p.id}>{p.name}</li>)}
          </ul>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setConfirmStale(false)}>Cancelar</Button>
            <Button
              variant="primary"
              data-autofocus
              onClick={() => {
                setConfirmStale(false);
                void archiveIds(stale.map((p) => p.id), `${stale.length} ${stale.length === 1 ? "proyecto archivado" : "proyectos archivados"}`);
              }}
            >
              Archivar {stale.length === 1 ? "el proyecto" : `los ${stale.length} proyectos`}
            </Button>
          </div>
        </Modal>
      )}
      {undo && (
        <div role="status" className="fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-ink py-2 pl-4 pr-2 text-sm font-bold text-white shadow-lg">
          {undo.text}
          <button type="button" onClick={() => void undoArchive()} className="h-8 cursor-pointer rounded-lg border border-white/40 bg-transparent px-3 text-sm font-bold text-white hover:bg-white/10">Deshacer</button>
        </div>
      )}
      {flashNode}
    </div>
  );
}

