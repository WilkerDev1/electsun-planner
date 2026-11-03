import { useState } from "react";
import { api, ApiError } from "../../ui/api";
import type { ImportReport } from "../../../shared/contracts/projects";
import { Banner } from "../../ui/components";
import { Modal } from "../../ui/Modal";

// Importar Excel en 2 pasos (XLS-01..04): subir y revisar la vista previa, luego aplicar.

const ACTION = {
  create: { label: "Nuevo", cls: "bg-ok-soft text-ok" },
  update: { label: "Actualiza", cls: "bg-[#EEF0FE] text-[#3538CD]" },
  error: { label: "Error", cls: "bg-danger-soft text-danger" },
} as const;

type Step = "upload" | "preview" | "done";

export function ImportDialog({ onClose, onApplied }: { onClose: () => void; onApplied: () => void }) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function choose(f: File | null) {
    setError("");
    if (f && !/\.xlsx$/i.test(f.name)) return setError("Elige un archivo de Excel con extensión .xlsx.");
    if (f && f.size > 5 * 1024 * 1024) return setError("El archivo supera los 5 MB.");
    setFile(f);
  }

  async function send(dry: boolean) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await api<ImportReport>(`/projects/import?dry=${dry ? 1 : 0}`, { body: form });
      setReport(r);
      setStep(dry ? "preview" : "done");
      if (!dry) onApplied();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo leer el archivo. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  const applicable = report ? report.created + report.updated : 0;
  const btn = "inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-bold disabled:opacity-50";

  return (
    <Modal title="Importar proyectos desde Excel" subtitle={step === "upload" ? "Paso 1 de 2 · Sube el archivo" : step === "preview" ? "Paso 2 de 2 · Revisa antes de aplicar. Todavía no se guardó nada." : "Importación terminada"} onClose={onClose} xl>
      <div className="flex flex-col">
        <div className="flex flex-col gap-4 pb-5">
          {error && <Banner tone="danger">{error}</Banner>}

          {step === "upload" && (
            <>
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line-2 bg-fill-2 px-6 py-10 text-center focus-within:border-brand">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#475467" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></svg>
                <span className="text-sm font-bold">{file ? file.name : "Elige un archivo .xlsx"}</span>
                <span className="text-[13px] text-subtle">{file ? `${(file.size / 1024).toFixed(0)} KB` : "Hasta 5 MB. El archivo no se guarda en el servidor."}</span>
                <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" data-autofocus aria-label="Archivo de Excel" onChange={(e) => choose(e.target.files?.[0] ?? null)} />
              </label>
              <div className="rounded-xl bg-fill-2 px-4 py-3 text-[13px] text-muted">
                <p className="m-0 font-bold text-ink-2">Columnas que reconoce</p>
                <p className="m-0 mt-1">Contratista, Proyecto, kWp, Fecha de venta, Lugar, Encargado, Cuadrilla/Equipo, Inicio, Fin, Estado y Observación (también Parte, Tipo y Días). No importa si van en mayúsculas o con tildes. «N/A» y «-» en una fecha la dejan vacía.</p>
                <p className="m-0 mt-1">Un proyecto que ya existe (misma empresa, nombre y parte) se actualiza; si no, se crea.</p>
              </div>
            </>
          )}

          {step === "preview" && report && (
            <>
              <div className="flex flex-wrap gap-2" role="list" aria-label="Resumen de la vista previa">
                <Chip n={report.created} label="nuevos" cls="bg-ok-soft text-ok" />
                <Chip n={report.updated} label="se actualizan" cls="bg-[#EEF0FE] text-[#3538CD]" />
                <Chip n={report.errors} label="con error" cls="bg-danger-soft text-danger" />
                {!!report.unchanged && <Chip n={report.unchanged} label="sin cambios" cls="bg-fill text-muted" />}
              </div>
              {report.errors > 0 && <Banner tone="warn">Las filas con error no se importan. Corrígelas en el Excel y vuelve a subirlo, o aplica solo las válidas.</Banner>}
              {report.rows.length === 0 ? (
                <p className="m-0 py-6 text-center text-sm text-subtle">No hay nada que importar: todas las filas ya están al día.</p>
              ) : (
                <div className="overflow-auto rounded-xl border border-line">
                  <table className="w-full border-collapse text-left text-[13px]">
                    <thead className="sticky top-0 bg-fill-2 text-muted">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Fila</th>
                        <th className="px-3 py-2 font-semibold">Qué pasa</th>
                        <th className="px-3 py-2 font-semibold">Proyecto</th>
                        <th className="px-3 py-2 font-semibold">Detalle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.rows.map((r) => (
                        <tr key={r.row} className="border-t border-line align-top">
                          <td className="px-3 py-2 tabular-nums text-subtle">{r.row}</td>
                          <td className="px-3 py-2"><span className={`rounded-md px-2 py-0.5 text-xs font-bold ${ACTION[r.action].cls}`}>{ACTION[r.action].label}</span></td>
                          <td className="px-3 py-2 font-semibold">{r.name}</td>
                          <td className={`px-3 py-2 ${r.action === "error" ? "text-danger" : "text-warn"}`}>{r.messages.map((m) => <span key={m} className="block">{m}</span>)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {step === "done" && report && (
            <div role="status" className="flex flex-col items-center gap-1 py-8 text-center">
              <p className="m-0 text-lg font-extrabold">Listo</p>
              <p className="m-0 text-sm text-muted">
                {report.created} proyectos nuevos y {report.updated} actualizados. {report.errors > 0 && `${report.errors} filas con error no se importaron.`}
              </p>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
          {step === "upload" && (
            <>
              <button type="button" className={`${btn} border border-line bg-white text-ink-2`} onClick={() => onClose()}>Cancelar</button>
              <button type="button" className={`${btn} bg-ink text-white`} disabled={!file || busy} onClick={() => void send(true)}>{busy ? "Leyendo…" : "Revisar archivo"}</button>
            </>
          )}
          {step === "preview" && (
            <>
              <button type="button" className={`${btn} border border-line bg-white text-ink-2`} disabled={busy} onClick={() => { setStep("upload"); setReport(null); }}>Elegir otro archivo</button>
              <button type="button" className={`${btn} bg-ink text-white`} disabled={busy || applicable === 0} onClick={() => void send(false)}>
                {busy ? "Importando…" : `Aplicar importación (${applicable})`}
              </button>
            </>
          )}
          {step === "done" && <button type="button" className={`${btn} bg-ink text-white`} onClick={() => onClose()}>Cerrar</button>}
        </footer>
      </div>
    </Modal>
  );
}

const Chip = ({ n, label, cls }: { n: number; label: string; cls: string }) => (
  <span role="listitem" className={`rounded-lg px-3 py-1.5 text-sm font-bold ${cls}`}>{n} {label}</span>
);
