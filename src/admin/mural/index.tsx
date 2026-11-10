import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../ui/api";
import { useAuth } from "../../ui/auth";
import { Banner, PageHeader, useFlash } from "../../ui/components";
import type { MuralSettings } from "../../../shared/contracts/mural";
import { NoticesCard } from "./Notices";
import { Preview } from "./Preview";
import { SettingsCards } from "./Settings";
import { StatusesCard } from "./Statuses";
import { TvLinksCard } from "./TvLinks";

// Mural · Configuración (V4Config, MUR-09, AVI-02, ACC-07, EST-04).
export default function MuralConfig() {
  const { user, today } = useAuth();
  const isAdmin = user?.role === "admin";
  const [settings, setSettings] = useState<MuralSettings | null>(null);
  const [error, setError] = useState("");
  const { flash, node } = useFlash(2600);
  // Las escrituras van en fila: cada una parte del último estado, así dos toques seguidos no se pisan.
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const load = useCallback(async () => {
    try {
      setSettings(await api<MuralSettings>("/mural/settings"));
      setError("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar la configuración. Revisa tu conexión.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const latest = useRef<MuralSettings | null>(null);
  latest.current = settings;
  const change = useCallback(
    (patch: Partial<MuralSettings>) => {
      if (!isAdmin || !latest.current) return;
      const next = { ...latest.current, ...patch };
      latest.current = next;
      setSettings(next);
      queue.current = queue.current.then(async () => {
        try {
          setSettings(await api<MuralSettings>("/mural/settings", { method: "PUT", body: next }));
          flash("Guardado");
        } catch (e) {
          await load();
          flash(e instanceof ApiError ? e.message : "No se pudo guardar. Intenta de nuevo.", "danger");
        }
      });
    },
    [isAdmin, load, flash],
  );

  return (
    <>
      <PageHeader
        title="Mural"
        subtitle="Qué se ve en las TV de la empresa. Los datos salen de la tabla de Proyectos."
        actions={
          <a href="/mural/tv" className="flex h-[42px] items-center gap-2 rounded-[10px] bg-ink px-4 text-sm font-bold text-white no-underline hover:bg-navy">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            </svg>
            Abrir en pantalla completa
          </a>
        }
      />
      {error && <Banner tone="danger">{error}</Banner>}
      {!isAdmin && settings && (
        <div className="mb-4">
          <Banner tone="info">Solo la administración puede cambiar el diseño y lo que se muestra. Tú puedes ver la configuración, la vista previa y gestionar los avisos generales.</Banner>
        </div>
      )}
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 max-w-[440px] flex-[1_1_360px] flex-col gap-4">
          {settings && <SettingsCards settings={settings} canEdit={isAdmin} onChange={change} />}
          <TvLinksCard canEdit={isAdmin} general={settings} />
          <NoticesCard today={today} flash={flash} />
        </div>
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
          {settings && <Preview settings={settings} />}
          <StatusesCard canEdit={isAdmin} flash={flash} />
        </div>
      </div>
      {node}
    </>
  );
}
