import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../ui/api";
import { Banner, Button } from "../../ui/components";
import { ConfirmDialog, Modal } from "../../ui/Modal";
import { LinkSecretDialog } from "../cuentas/LinkSecretDialog";
import type { AccessLink, LinkSecret, TvMuralOverrides } from "../../../shared/contracts/access";
import type { MuralSettings } from "../../../shared/contracts/mural";
import { Section, ago, inputClass } from "./ui";

// Pantallas de TV (ACC-01..03, ACC-07, ACC-08): crear con modo y título, configurar, pausar, rotar y revocar. Solo administración.

const message = (e: unknown) => (e instanceof ApiError ? e.message : "No se pudo completar la acción. Intenta de nuevo.");

type Design = MuralSettings["design"];
type Action = { kind: "rotate" | "revoke"; link: AccessLink };

const MODES: { value: Design; label: string; hint: string }[] = [
  { value: "principal", label: "Principal", hint: "tabla + calendario" },
  { value: "timeline", label: "Timeline", hint: "barra por fila" },
];
const MODE_LABEL: Record<Design, string> = { principal: "Principal", timeline: "Timeline" };
// Colores con contraste AA sobre su fondo; cada modo tiene su icono y su color.
const MODE_STYLE: Record<Design, { color: string; background: string }> = {
  principal: { color: "#095C4F", background: "#E0F4EF" },
  timeline: { color: "#3730A3", background: "#EEF2FF" },
};

const row44 =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-white px-3 text-[13px] font-bold text-ink-2 no-underline hover:bg-fill-2 disabled:cursor-not-allowed disabled:opacity-50";

function ModeIcon({ design }: { design: Design }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {design === "principal" ? (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 10h18M10 10v10" />
        </>
      ) : (
        <path d="M3 6h10M7 12h13M5 18h9" />
      )}
    </svg>
  );
}

function ModeBadge({ design }: { design: Design }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-bold" style={MODE_STYLE[design]}>
      <ModeIcon design={design} />
      {MODE_LABEL[design]}
    </span>
  );
}

/** Estado visible de un enlace: Activa, En pausa o Revocada. */
const stateOf = (l: AccessLink) =>
  !l.active
    ? { label: "Revocada", style: { color: "#B42318", background: "#FEF3F2" } }
    : l.paused
      ? { label: "En pausa", style: { color: "#B54708", background: "#FFFAEB" } }
      : { label: "Activa", style: { color: "#095C4F", background: "#E0F4EF" } };

/** ¿Sobrescribe algo además del modo? El modo ya se ve en su insignia. */
const hasOwnSettings = (m: TvMuralOverrides) => Object.keys(m).some((k) => k !== "design");

/** Dos botones grandes para elegir el modo al crear. */
function ModePicker({ value, onChange }: { value: Design; onChange: (d: Design) => void }) {
  return (
    <div role="group" aria-label="Modo del mural" className="grid grid-cols-2 gap-2">
      {MODES.map((m) => {
        const on = value === m.value;
        return (
          <button
            key={m.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(m.value)}
            className={`flex min-h-11 items-center gap-2.5 rounded-xl border-[1.5px] p-2.5 text-left text-ink ${on ? "border-ink bg-fill-2" : "border-line bg-white"}`}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={MODE_STYLE[m.value]}>
              <ModeIcon design={m.value} />
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-extrabold">{m.label}</span>
              <span className="text-xs text-muted">{m.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Opciones de un ajuste del enlace: "Usar el general" (valor `undefined`) o un valor propio. */
function Choice<T extends string | number | boolean>({
  label,
  value,
  options,
  general,
  onChange,
}: {
  label: string;
  value: T | undefined;
  options: { value: T; label: string }[];
  /** Cómo se llama hoy el valor general, para mostrarlo en la primera opción. */
  general: string;
  onChange: (v: T | undefined) => void;
}) {
  const all: { value: T | undefined; label: string }[] = [{ value: undefined, label: `Usar el general (${general})` }, ...options];
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1.5">
      <span className="text-[13px] font-bold text-ink-2">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {all.map((o) => {
          const on = value === o.value;
          return (
            <button
              key={String(o.value)}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(o.value)}
              className={`min-h-11 rounded-[10px] border-[1.5px] px-3 text-[13px] font-bold ${on ? "border-ink bg-fill-2 text-ink" : "border-line bg-white text-muted"}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const SWITCHES: { key: "show_waiting" | "show_notes" | "show_priority" | "show_clock" | "show_kwp"; label: string }[] = [
  { key: "show_waiting", label: "Esperando fecha" },
  { key: "show_notes", label: "Observaciones" },
  { key: "show_priority", label: "Bandera de prioridad" },
  { key: "show_clock", label: "Reloj y fecha" },
  { key: "show_kwp", label: "kWp por proyecto" },
];
const YES_NO = [
  { value: true, label: "Sí" },
  { value: false, label: "No" },
];

/** Diálogo "Configurar": nombre, título y ajustes propios de una pantalla (ACC-08). Lo que no se toca se hereda del mural general. */
function ConfigureDialog({ link, general, onClose, onSaved }: { link: AccessLink; general: MuralSettings | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(link.name);
  const [title, setTitle] = useState(link.title ?? "");
  const [mural, setMural] = useState<TvMuralOverrides>(link.mural);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof MuralSettings>(key: K, v: MuralSettings[K] | undefined) =>
    setMural((m) => {
      const next = { ...m };
      if (v === undefined) delete next[key];
      else next[key] = v;
      return next;
    });
  const yn = (b: boolean | undefined) => (b === undefined ? "—" : b ? "Sí" : "No");

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api(`/access-links/${link.id}`, { method: "PATCH", body: { name: name.trim(), title: title.trim() || null, mural } });
      onSaved();
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  }

  return (
    <Modal title={`Configurar ${link.name}`} subtitle="Los cambios llegan a la TV en segundos. El enlace no cambia." wide onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-[13px] font-bold text-ink-2">
          Nombre interno (dónde está la TV)
          <input data-autofocus type="text" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className={`${inputClass} h-11 font-normal`} />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-bold text-ink-2">
          Título en la pantalla
          <input type="text" maxLength={60} placeholder="Proyectos" value={title} onChange={(e) => setTitle(e.target.value)} className={`${inputClass} h-11 font-normal`} />
          <span className="text-xs font-normal text-muted">Si lo dejas vacío, la pantalla dice “Proyectos”.</span>
        </label>
        <Choice<Design>
          label="Modo"
          value={mural.design}
          options={MODES.map((m) => ({ value: m.value, label: m.label }))}
          general={general ? MODE_LABEL[general.design] : "—"}
          onChange={(v) => set("design", v)}
        />
        <Choice<2 | 3 | 4>
          label="Semanas visibles"
          value={mural.weeks}
          options={([2, 3, 4] as const).map((n) => ({ value: n, label: `${n} semanas` }))}
          general={general ? `${general.weeks} semanas` : "—"}
          onChange={(v) => set("weeks", v)}
        />
        <Choice<MuralSettings["upcoming_order"]>
          label="Orden de los próximos"
          value={mural.upcoming_order}
          options={[
            { value: "fecha", label: "Por fecha" },
            { value: "prioridad", label: "Prioridad primero" },
          ]}
          general={general ? (general.upcoming_order === "fecha" ? "Por fecha" : "Prioridad primero") : "—"}
          onChange={(v) => set("upcoming_order", v)}
        />
        {SWITCHES.map((s) => (
          <Choice<boolean> key={s.key} label={s.label} value={mural[s.key]} options={YES_NO} general={yn(general?.[s.key])} onChange={(v) => set(s.key, v)} />
        ))}
        {error && <Banner tone="danger">{error}</Banner>}
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose} disabled={busy} className="h-11">
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !name.trim()} className="h-11">
            {busy ? "Un momento…" : "Guardar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function TvLinksCard({ canEdit, general }: { canEdit: boolean; general: MuralSettings | null }) {
  const [links, setLinks] = useState<AccessLink[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [design, setDesign] = useState<Design>("principal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [secret, setSecret] = useState<{ title: string; path: string } | null>(null);
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [configuring, setConfiguring] = useState<AccessLink | null>(null);

  const load = useCallback(async () => {
    if (!canEdit) return;
    try {
      setLinks(await api<AccessLink[]>("/access-links?kind=tv"));
      setLoadError("");
    } catch (e) {
      setLoadError(message(e));
    }
  }, [canEdit]);
  useEffect(() => {
    void load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const r = await api<LinkSecret>("/access-links", { body: { kind: "tv", name: name.trim(), title: title.trim() || null, mural: { design } } });
      setName("");
      setTitle("");
      setSecret({ title: `Enlace de ${r.link.name}`, path: r.path });
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function run(a: Action) {
    setBusy(true);
    setError("");
    try {
      if (a.kind === "revoke") {
        await api(`/access-links/${a.link.id}/revoke`, { method: "POST" });
        setConfirm(null);
        await load();
      } else {
        const r = await api<LinkSecret>(`/access-links/${a.link.id}/rotate`, { method: "POST" });
        setConfirm(null);
        setSecret({ title: `Enlace nuevo de ${r.link.name}`, path: r.path });
      }
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function togglePause(l: AccessLink) {
    setBusy(true);
    setError("");
    try {
      await api(`/access-links/${l.id}`, { method: "PATCH", body: { paused: !l.paused } });
      await load();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      id="tv-links"
      title="Pantallas de TV"
      hint="Cada TV tiene su propio enlace, modo y título. Ábrelo en el navegador de la pantalla: se actualiza solo y no necesita usuario ni contraseña."
    >
      {!canEdit ? (
        <Banner tone="info">Solo la administración puede crear, configurar, pausar o revocar los enlaces de las pantallas.</Banner>
      ) : (
        <>
          {loadError && <Banner tone="danger">{loadError}</Banner>}
          {links?.length === 0 && <p className="m-0 text-sm text-subtle">Todavía no hay pantallas. Crea el enlace de la primera.</p>}
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {links?.map((l) => {
              const mode = l.mural.design ?? general?.design ?? "principal";
              const st = stateOf(l);
              return (
                <li key={l.id} className="flex flex-col gap-2 rounded-[10px] border border-line bg-fill-2 px-3 py-2.5">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-bold">
                    <ModeBadge design={mode} />
                    <span className="min-w-0 break-words">{l.name}</span>
                    <span className="rounded-md px-2 py-0.5 text-xs font-bold" style={st.style}>
                      {st.label}
                    </span>
                    {hasOwnSettings(l.mural) && (
                      <span className="rounded-md bg-fill px-2 py-0.5 text-xs font-bold text-ink-2" title="Esta pantalla cambia algo del mural general">
                        Ajustes propios
                      </span>
                    )}
                  </span>
                  <span className="flex flex-col text-xs text-muted">
                    <span className="break-words">Título: {l.title ?? "Proyectos (el de siempre)"}</span>
                    <span>{ago(l.last_seen_at)}</span>
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      className={row44}
                      disabled={busy}
                      aria-label={`Configurar ${l.name}`}
                      onClick={() => {
                        setError("");
                        setConfiguring(l);
                      }}
                    >
                      Configurar
                    </button>
                    <a className={row44} href={`/mural/tv?link=${l.id}`} target="_blank" rel="noreferrer" aria-label={`Vista previa de ${l.name} (se abre en otra pestaña)`}>
                      Vista previa
                    </a>
                    {l.active && (
                      <button type="button" className={row44} disabled={busy} aria-label={`${l.paused ? "Reanudar" : "Pausar"} ${l.name}`} onClick={() => void togglePause(l)}>
                        {l.paused ? "Reanudar" : "Pausar"}
                      </button>
                    )}
                    <button
                      type="button"
                      className={row44}
                      disabled={busy}
                      aria-label={`${l.active ? "Nuevo enlace" : "Reactivar con enlace nuevo"} para ${l.name}`}
                      onClick={() => {
                        setError("");
                        setConfirm({ kind: "rotate", link: l });
                      }}
                    >
                      {l.active ? "Nuevo enlace" : "Reactivar"}
                    </button>
                    {l.active && (
                      <button
                        type="button"
                        className={`${row44} text-danger hover:bg-danger-soft`}
                        disabled={busy}
                        aria-label={`Revocar el enlace de ${l.name}`}
                        onClick={() => {
                          setError("");
                          setConfirm({ kind: "revoke", link: l });
                        }}
                      >
                        Revocar
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="m-0 text-xs leading-snug text-muted">
            La dirección con el acceso solo se ve al crear el enlace o al generar uno nuevo. Si se pierde, genera un enlace nuevo: el anterior deja de funcionar.
          </p>
          <form onSubmit={create} className="flex flex-col gap-2.5 border-t border-line pt-3">
            <span className="text-sm font-extrabold">Nueva pantalla</span>
            <input
              type="text"
              aria-label="Nombre de la nueva pantalla"
              placeholder="Nombre interno, por ejemplo TV oficina"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`${inputClass} h-11`}
            />
            <input
              type="text"
              aria-label="Título en la pantalla (opcional)"
              placeholder="Título en la pantalla (opcional, si no dice Proyectos)"
              maxLength={60}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`${inputClass} h-11`}
            />
            <ModePicker value={design} onChange={setDesign} />
            <Button type="submit" variant="primary" disabled={busy || !name.trim()} className="h-11 rounded-[10px]">
              Crear enlace
            </Button>
          </form>
          {error && !confirm && !configuring && <Banner tone="danger">{error}</Banner>}
        </>
      )}

      {configuring && (
        <ConfigureDialog
          link={configuring}
          general={general}
          onClose={() => setConfiguring(null)}
          onSaved={() => {
            setConfiguring(null);
            void load();
          }}
        />
      )}
      {confirm?.kind === "rotate" && (
        <ConfirmDialog
          title={confirm.link.active ? "Generar un enlace nuevo" : "Reactivar la pantalla"}
          confirmLabel={confirm.link.active ? "Generar enlace nuevo" : "Reactivar"}
          busy={busy}
          error={error}
          onConfirm={() => void run(confirm)}
          onCancel={() => setConfirm(null)}
        >
          {confirm.link.active
            ? `El enlace actual de ${confirm.link.name} dejará de funcionar y la TV se quedará sin datos hasta que abras el enlace nuevo en ella. El título y los ajustes se conservan.`
            : `Se creará un enlace nuevo para ${confirm.link.name}. Tendrás que abrirlo en esa TV.`}
        </ConfirmDialog>
      )}
      {confirm?.kind === "revoke" && (
        <ConfirmDialog
          title="Revocar la pantalla"
          confirmLabel="Revocar pantalla"
          danger
          busy={busy}
          error={error}
          onConfirm={() => void run(confirm)}
          onCancel={() => setConfirm(null)}
        >
          {confirm.link.name} mostrará “Este enlace fue desactivado” y dejará de recibir datos. Para volver a usarla tendrás que generar un enlace nuevo. Si solo quieres apagarla un rato, usa Pausar.
        </ConfirmDialog>
      )}
      {secret && (
        <LinkSecretDialog
          title={secret.title}
          path={secret.path}
          intro="Abre este enlace en el navegador de la TV (o escanea el código con el teléfono para probarlo). El mural se muestra sin usuario ni contraseña."
          note="Dura 30 días en la pantalla. Esta dirección no se puede volver a ver: si se pierde o la ve otra persona, genera un enlace nuevo o revócalo desde aquí."
          onClose={() => {
            setSecret(null);
            void load();
          }}
        />
      )}
    </Section>
  );
}
