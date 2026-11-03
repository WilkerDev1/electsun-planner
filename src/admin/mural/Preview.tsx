import type { MuralView, MuralSettings } from "../../../shared/contracts/mural";
import { useLive } from "../../ui/useLive";
import { MuralScreen } from "../../mural/MuralScreen";
import { ScaledCanvas } from "../../mural/ScaledCanvas";
import { useNow } from "../../mural/shared";

/** Consulta del mural con los ajustes de la pantalla, guardados o no (la oficina los ve sin cambiar nada). */
const previewPath = (s: MuralSettings) => {
  const q = new URLSearchParams({
    design: s.design,
    weeks: String(s.weeks),
    upcoming_order: s.upcoming_order,
    show_waiting: s.show_waiting ? "1" : "0",
    show_notes: s.show_notes ? "1" : "0",
    show_priority: s.show_priority ? "1" : "0",
    show_clock: s.show_clock ? "1" : "0",
    show_kwp: s.show_kwp ? "1" : "0",
  });
  return `/view/mural?${q}`;
};

/** Vista previa en vivo (MUR-09): el mismo componente de la TV, escalado, con los ajustes aún sin guardar. */
export function Preview({ settings }: { settings: MuralSettings }) {
  const live = useLive<MuralView>(previewPath(settings), "mural-config-preview");
  const now = useNow(1000);
  return (
    <section aria-label="Vista previa" className="flex min-w-0 flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-base font-extrabold">Vista previa</span>
        <span className="flex items-center gap-2 text-[13px] font-bold" style={{ color: live.error ? "#B54708" : "#095C4F" }}>
          <span aria-hidden className="size-2 rounded-full" style={{ background: live.error ? "#F59E0B" : "#0B7A68" }} />
          {live.error ? "Sin conexión" : "En vivo"}
        </span>
      </div>
      <div className="aspect-video w-[864px] max-w-full overflow-hidden rounded-2xl border-8 border-ink bg-canvas shadow-[0_12px_30px_rgba(16,24,40,0.15)]">
        {live.data ? (
          <ScaledCanvas className="size-full">
            <MuralScreen view={live.data} live={{ now, fetchedAt: live.fetchedAt, offline: !!live.error }} />
          </ScaledCanvas>
        ) : (
          <div className="flex size-full items-center justify-center text-sm font-semibold text-subtle">{live.error ? "No se pudo cargar la vista previa." : "Cargando la vista previa…"}</div>
        )}
      </div>
      <span className="text-[13px] text-muted">Si la TV pierde internet, sigue mostrando los últimos datos con la hora de la última actualización.</span>
    </section>
  );
}
