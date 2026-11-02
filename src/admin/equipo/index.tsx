import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../../ui/api";
import { useAuth } from "../../ui/auth";
import { Banner, Button, Card, Empty, PageHeader, useFlash } from "../../ui/components";
import { EmpleadosTab } from "./EmpleadosTab";
import { EmpresasTab } from "./EmpresasTab";
import { EquiposTab } from "./EquiposTab";
import { ICON, TABS, type Tab, type TabProps } from "./model";
import { SearchBox, Svg } from "./ui";
import { useEquipo } from "./useEquipo";

// F1·C — Equipo: empleados, equipos de obra y empresas (V4EquipoTablas, EQP-01..06).
const META: Record<Tab, { label: string; icon: string; search: string }> = {
  empleados: { label: "Empleados", icon: ICON.people, search: "Buscar persona…" },
  equipos: { label: "Equipos de obra", icon: ICON.teams, search: "Buscar equipo…" },
  empresas: { label: "Empresas", icon: ICON.companies, search: "Buscar empresa…" },
};

export default function Equipo() {
  const param = useParams()["*"]?.split("/")[0] ?? "";
  const tab = TABS.find((t) => t === param);
  if (!tab) return <Navigate to="/equipo/empleados" replace />;
  return <EquipoPage tab={tab} />;
}

function EquipoPage({ tab }: { tab: Tab }) {
  const navigate = useNavigate();
  const { today } = useAuth();
  const { data, error, reload } = useEquipo();
  const { flash, node } = useFlash(3200);
  // La búsqueda es de cada pestaña: al cambiar de pestaña se vacía.
  const [search, setSearch] = useState({ tab, text: "" });
  const query = search.tab === tab ? search.text : "";
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  const save: TabProps["save"] = useCallback(
    async (fn, ok) => {
      try {
        const r = await fn();
        await reload();
        flash(ok);
        return r;
      } catch (e) {
        // 409: otra persona cambió la fila antes; se recarga para mostrar lo vigente.
        if (e instanceof ApiError && e.status === 409) await reload();
        flash(e instanceof ApiError ? e.message : "No se pudo guardar. Intenta nuevamente.", "danger");
        return null;
      }
    },
    [reload, flash],
  );
  const done = useCallback(
    async (message: string) => {
      await reload();
      flash(message);
    },
    [reload, flash],
  );

  const counts: Record<Tab, number | null> = {
    empleados: data?.employees.length ?? null,
    equipos: data?.teams.length ?? null,
    empresas: data?.companies.length ?? null,
  };

  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = TABS[(i + step + TABS.length) % TABS.length];
    navigate(`/equipo/${next}`);
    tabRefs.current[next]?.focus();
  };

  const props: TabProps | null = data && { data, today, query, save, done, reload };

  return (
    <>
      <PageHeader title="Equipo" subtitle="Las personas, los equipos de obra y las empresas que aparecen en Proyectos y en el mural." />
      <Card className="overflow-hidden !rounded-2xl">
        <div role="tablist" aria-label="Secciones" className="flex gap-1 overflow-x-auto border-b border-line px-4">
          {TABS.map((t, i) => {
            const on = t === tab;
            return (
              <button
                key={t}
                ref={(el) => {
                  tabRefs.current[t] = el;
                }}
                type="button"
                role="tab"
                id={`equipo-tab-${t}`}
                aria-selected={on}
                aria-controls="equipo-panel"
                tabIndex={on ? 0 : -1}
                onClick={() => navigate(`/equipo/${t}`)}
                onKeyDown={(e) => onKey(e, i)}
                className={`flex h-12 shrink-0 items-center gap-2 whitespace-nowrap border-0 border-b-2 bg-transparent px-2.5 text-sm ${on ? "border-brand font-bold text-ink" : "border-transparent font-semibold text-subtle"}`}
              >
                <Svg d={META[t].icon} size={16} />
                {META[t].label}
                {counts[t] !== null && (
                  <span className={`rounded-md px-[7px] py-px text-xs font-bold ${on ? "bg-brand-soft text-brand-ink" : "bg-fill text-muted"}`}>{counts[t]}</span>
                )}
              </button>
            );
          })}
        </div>

        <div id="equipo-panel" role="tabpanel" aria-labelledby={`equipo-tab-${tab}`}>
          <div className="px-4 pt-3 pb-3">
            <SearchBox value={query} onChange={(text) => setSearch({ tab, text })} placeholder={META[tab].search} />
          </div>
          {!props && !error && (
            <div role="status" aria-live="polite" className="px-4 py-16 text-center text-sm text-subtle">
              Cargando el equipo…
            </div>
          )}
          {!props && error && (
            <Empty title="No se pudo cargar el equipo">
              <div className="flex flex-col items-center gap-3">
                <Banner tone="danger">{error}</Banner>
                <Button onClick={() => void reload()}>Reintentar</Button>
              </div>
            </Empty>
          )}
          {props && tab === "empleados" && <EmpleadosTab {...props} />}
          {props && tab === "equipos" && <EquiposTab {...props} />}
          {props && tab === "empresas" && <EmpresasTab {...props} />}
        </div>
      </Card>
      {node}
    </>
  );
}
