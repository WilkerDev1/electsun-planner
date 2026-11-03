import { Toggle } from "../../ui/components";
import type { MuralSettings } from "../../../shared/contracts/mural";
import { Section, inputClass } from "./ui";

// Diseño, semanas, orden y los 5 interruptores (MUR-09). Guardan al instante; la oficina los ve deshabilitados.

const DESIGNS: { value: MuralSettings["design"]; label: string; hint: string }[] = [
  { value: "principal", label: "Principal · tabla + calendario (claro)", hint: "El formato recomendado para la TV" },
  { value: "timeline", label: "Timeline en cada fila", hint: "La tabla y la barra en la misma línea" },
];

const SWITCHES: { key: keyof Pick<MuralSettings, "show_waiting" | "show_notes" | "show_priority" | "show_clock" | "show_kwp">; label: string; hint: string }[] = [
  { key: "show_waiting", label: "Esperando fecha", hint: "Proyectos vendidos sin programar" },
  { key: "show_notes", label: "Observaciones", hint: "Las marcadas con la pantalla en la tabla" },
  { key: "show_priority", label: "Bandera de prioridad", hint: "Marca los proyectos que el jefe priorizó" },
  { key: "show_clock", label: "Reloj y fecha", hint: "Arriba a la derecha" },
  { key: "show_kwp", label: "kWp por proyecto", hint: "Apagado para no saturar" },
];

export function SettingsCards({ settings, canEdit, onChange }: { settings: MuralSettings; canEdit: boolean; onChange: (patch: Partial<MuralSettings>) => void }) {
  return (
    <>
      <Section title="Diseño del mural">
        {DESIGNS.map((d) => {
          const on = settings.design === d.value;
          return (
            <button
              key={d.value}
              type="button"
              aria-pressed={on}
              disabled={!canEdit}
              onClick={() => onChange({ design: d.value })}
              className={`flex items-center gap-3 rounded-xl border-[1.5px] p-3 text-left text-ink disabled:cursor-not-allowed ${on ? "border-ink bg-fill-2" : "border-line bg-white"}`}
            >
              <span aria-hidden className="box-border size-[18px] shrink-0 rounded-full bg-white" style={{ border: on ? "6px solid #1B1F27" : "2px solid #D0D5DD" }} />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-extrabold">{d.label}</span>
                <span className="text-xs text-muted">{d.hint}</span>
              </span>
            </button>
          );
        })}
      </Section>

      <Section title="Calendario y timeline">
        <div role="group" aria-label="Semanas visibles" className="flex rounded-[10px] bg-fill p-[3px]">
          {([2, 3, 4] as const).map((n) => {
            const on = settings.weeks === n;
            return (
              <button
                key={n}
                type="button"
                aria-pressed={on}
                disabled={!canEdit}
                onClick={() => onChange({ weeks: n })}
                className={`h-9 flex-1 rounded-lg text-sm disabled:cursor-not-allowed ${on ? "bg-white font-bold text-ink shadow-sm" : "font-semibold text-muted"}`}
              >
                {n} semanas
              </button>
            );
          })}
        </div>
        <label className="flex flex-col gap-1.5 text-[13px] font-bold text-ink-2">
          Orden de los próximos
          <select
            value={settings.upcoming_order}
            disabled={!canEdit}
            onChange={(e) => onChange({ upcoming_order: e.target.value as MuralSettings["upcoming_order"] })}
            className={`${inputClass} font-normal`}
          >
            <option value="fecha">Por fecha de inicio</option>
            <option value="prioridad">Prioridad primero</option>
          </select>
        </label>
      </Section>

      <section className="flex flex-col gap-1.5 rounded-2xl border border-line bg-white p-[18px]">
        <h2 className="m-0 mb-1.5 text-base font-extrabold">Qué mostrar</h2>
        {SWITCHES.map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-3 border-t border-[#F0F1F4] py-2">
            <span className="flex flex-col gap-px">
              <span className="text-sm font-bold">{s.label}</span>
              <span className="text-xs text-muted">{s.hint}</span>
            </span>
            <Toggle on={settings[s.key]} label={s.label} disabled={!canEdit} onChange={(v) => onChange({ [s.key]: v })} />
          </div>
        ))}
      </section>
    </>
  );
}
