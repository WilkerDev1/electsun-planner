import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../ui/auth";
import { Banner, Empty, useFlash } from "../../ui/components";
import type { Project } from "../../../shared/contracts/projects";
import { Header, Row, CompactHeader, CompactRow, StatusTabs } from "./Table";
import { Panel } from "./Panel";
import { ImportDialog } from "./ImportDialog";
import { buildLookup, computeWarnings, filterRows } from "./model";
import { useProjects } from "./store";

// Proyectos: tabla tipo Excel y panel de edición (V4Proyectos). Rutas /proyectos y /proyectos/:id.

const button = "flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink-2 no-underline hover:bg-fill-2";
const SCROLL_MAX = "calc(100dvh - 250px)";

export default function Proyectos() {
  const { user, today } = useAuth();
  const isAdmin = user?.role === "admin";
  const navigate = useNavigate();
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

  const lk = useMemo(() => (catalogs ? buildLookup(catalogs) : null), [catalogs]);
  const activeTeams = useMemo(() => catalogs?.teams.filter((t) => t.active) ?? [], [catalogs]);

  // Un proyecto abierto que no está en la lista (archivado) se pide aparte.
  useEffect(() => {
    if (!openId || !rows || rows.some((r) => r.id === openId)) return;
    store.refreshRow(openId).catch(() => {
      flash("No encontré ese proyecto.", "danger");
      navigate("/proyectos", { replace: true });
    });
  }, [openId, rows]); // eslint-disable-line react-hooks/exhaustive-deps

  // La fila abierta queda a la vista en la lista compacta.
  useEffect(() => {
    if (openId) document.querySelector('[aria-label="Lista de proyectos"] [aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [openId, rows?.length]);

  const warnings = useMemo(() => (rows && lk ? computeWarnings(rows, lk, today) : new Map<string, string[]>()), [rows, lk, today]);
  const warnOf = useCallback(
    (p: Project) => (store.serverWarnings[p.id] ?? warnings.get(p.id) ?? []).join(" · "),
    [store.serverWarnings, warnings],
  );

  const shown = useMemo(() => (rows ?? []).filter((r) => store.showArchived || !r.archived || r.id === openId), [rows, store.showArchived, openId]);
  const searched = useMemo(() => (lk ? filterRows(shown, "all", query, lk) : []), [shown, query, lk]);
  const list = useMemo(() => (statusFilter === "all" ? searched : searched.filter((p) => p.status_id === statusFilter)), [searched, statusFilter]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of searched) m.set(p.status_id, (m.get(p.status_id) ?? 0) + 1);
    return m;
  }, [searched]);

  const open = useCallback((id: string) => navigate(`/proyectos/${id}`), [navigate]);
  const close = useCallback(() => navigate("/proyectos"), [navigate]);

  // VAL-01/02 en la interfaz: el estado solo cambia cuando los datos que pide están completos.
  const pickStatus = useCallback(
    (p: Project, statusId: string) => {
      const s = lk?.statusById.get(statusId);
      if (!s) return;
      const need = [
        s.requires_schedule && !p.start_date && "la fecha de inicio",
        s.requires_schedule && !p.team_id && "el equipo",
        s.requires_reason && !p.pause_reason.trim() && "el motivo de la pausa",
      ].filter(Boolean);
      if (need.length) {
        flash(`Para pasar a ${s.name} falta ${need.join(" y ")}. Complétalo en el panel.`, "danger");
        navigate(`/proyectos/${p.id}`, { state: { draftStatus: statusId } });
      } else patch(p.id, { status_id: statusId });
    },
    [lk, patch, flash, navigate],
  );

  async function addProject() {
    const companies = catalogs?.companies.filter((c) => c.active) ?? [];
    const company = companies.find((c) => c.name === "Electsun") ?? companies[0];
    if (!company) return flash("Primero agrega una empresa en Equipo.", "danger");
    const created = await store.create(company.id, "Nuevo proyecto");
    if (!created) return;
    setStatusFilter("all");
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
    body = (
      <Empty title={shown.length ? "Ningún proyecto coincide" : "Todavía no hay proyectos"}>
        {shown.length ? "Prueba con otra búsqueda o con otro estado." : "Crea el primero con «Nuevo proyecto» o importa tu Excel."}
        <div className="mt-3 flex justify-center gap-2">
          {shown.length ? (
            <button type="button" className={button} onClick={() => { setQuery(""); setStatusFilter("all"); }}>Quitar filtros</button>
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
        <div role="table" aria-label="Tabla de proyectos" aria-rowcount={list.length + 1} style={{ minWidth: 1744 }}>
          <Header />
          {list.map((p, i) => (
            <Row key={p.id} p={p} index={i} selected={false} warn={warnOf(p)} today={today} isAdmin={isAdmin} statuses={catalogs.statuses} teams={activeTeams} lk={lk} onPatch={patch} onOpen={open} onPickStatus={pickStatus} />
          ))}
          <button type="button" onClick={() => void addProject()} className="flex h-11 w-full cursor-pointer items-center gap-2 border-0 bg-white px-4 text-left text-sm font-semibold text-muted hover:bg-fill-2">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
            Agregar proyecto
          </button>
        </div>
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
          {catalogs && <StatusTabs statuses={catalogs.statuses} counts={counts} total={searched.length} value={statusFilter} onChange={setStatusFilter} />}
          <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex h-9 w-60 max-w-full items-center gap-2 rounded-lg border border-line bg-white px-2.5 focus-within:border-brand">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#667085" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                <input type="search" aria-label="Buscar proyecto" placeholder="Buscar proyecto o lugar…" value={query} onChange={(e) => setQuery(e.target.value)} className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none" />
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-muted">
                <input type="checkbox" checked={store.showArchived} onChange={(e) => store.setShowArchived(e.target.checked)} className="size-4 accent-[#1B1F27]" />
                Mostrar archivados
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
      {flashNode}
    </div>
  );
}

