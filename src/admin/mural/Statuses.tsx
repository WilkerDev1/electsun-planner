import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../ui/api";
import { Banner, Button, Field, StatusPill } from "../../ui/components";
import { Modal } from "../../ui/Modal";
import { STATUS_KINDS, plural, type StatusKind } from "../../../shared/domain";
import type { Status, StatusDeleted } from "../../../shared/contracts/statuses";
import { Section, inputClass, smallButton } from "./ui";

// Estados (EST-04, EST-05): crear, renombrar, recolorear, reordenar y borrar. Solo administración edita.
// El tipo de un estado existente no cambia. Se usa en Mural → Estados y en Ajustes → Estados.

const message = (e: unknown) => (e instanceof ApiError ? e.message : "No se pudo guardar el estado. Intenta de nuevo.");
type Colors = Pick<Status, "fg" | "bg" | "dot">;
const COLOR_FIELDS: { key: keyof Colors; label: string }[] = [
  { key: "fg", label: "texto" },
  { key: "bg", label: "fondo" },
  { key: "dot", label: "punto" },
];

/** Qué implica cada tipo y con qué colores nace un estado nuevo. */
export const KIND_INFO: Record<StatusKind, { label: string; help: string } & Colors> = {
  por_programar: { label: "Por programar", help: "Aún sin fecha. No ocupa a ningún equipo.", fg: "#3F4859", bg: "#EFF1F5", dot: "#8B95A7" },
  programado: { label: "Programado", help: "Pide fecha de inicio y equipo. Reserva al equipo en esas fechas.", fg: "#3538CD", bg: "#EEF0FE", dot: "#6172F3" },
  en_obra: { label: "En obra", help: "Pide fechas y equipo. Se marca como atrasada si pasa su fin.", fg: "#095C4F", bg: "#E0F4EF", dot: "#0B7A68" },
  en_pausa: { label: "En pausa", help: "Pide el motivo de la pausa. No ocupa al equipo.", fg: "#A11C47", bg: "#FDECF1", dot: "#D63B6A" },
  terminado: { label: "Terminado", help: "La obra ya se entregó. Sale del calendario.", fg: "#1F2A3D", bg: "#E8ECF2", dot: "#2B3A55" },
  post_obra: { label: "Post-obra", help: "Obra entregada que espera un trámite, como el medidor.", fg: "#155E75", bg: "#E3F1F5", dot: "#0E7490" },
};

export function StatusesCard({ canEdit, flash }: { canEdit: boolean; flash: (text: string, tone?: "ok" | "danger") => void }) {
  const [items, setItems] = useState<Status[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Status | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await api<Status[]>("/statuses"));
      setLoadError("");
    } catch (e) {
      setLoadError(message(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function save(s: Status, changes: Partial<Pick<Status, "name" | "sort" | "fg" | "bg" | "dot">>) {
    try {
      await api(`/statuses/${s.id}`, { method: "PATCH", body: { version: s.version, ...changes } });
      await load();
      flash("Estado guardado");
    } catch (e) {
      // 409: otra persona lo cambió antes; se recarga lo vigente.
      await load();
      flash(message(e), "danger");
    }
  }

  async function move(index: number, step: -1 | 1) {
    if (!items) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(index + step, 0, moved);
    setBusy(true);
    try {
      for (const [i, s] of next.entries()) if (s.sort !== i + 1) await api(`/statuses/${s.id}`, { method: "PATCH", body: { version: s.version, sort: i + 1 } });
      flash("Orden guardado");
    } catch (e) {
      flash(message(e), "danger");
    } finally {
      await load();
      setBusy(false);
    }
  }

  return (
    <Section
      title="Estados"
      hint="El nombre y los colores se ven en la tabla de Proyectos y en el mural. El tipo se elige al crear el estado y ya no cambia. Al borrar un estado, sus proyectos pasan a otro que elijas."
      aside={
        canEdit && (
          <button type="button" onClick={() => setAdding(true)} className={smallButton}>
            Agregar estado
          </button>
        )
      }
    >
      {!canEdit && <Banner tone="info">Solo la administración puede cambiar los estados.</Banner>}
      {loadError && <Banner tone="danger">{loadError}</Banner>}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {items?.map((s, i) => (
          <StatusRow
            key={`${s.id}-${s.version}`}
            s={s}
            first={i === 0}
            last={i === items.length - 1}
            canEdit={canEdit}
            busy={busy}
            onSave={(c) => save(s, c)}
            onMove={(step) => void move(i, step)}
            onRemove={() => setRemoving(s)}
          />
        ))}
      </ul>
      {adding && (
        <AddStatusDialog
          onClose={() => setAdding(false)}
          onCreated={async () => {
            setAdding(false);
            await load();
            flash("Estado agregado");
          }}
        />
      )}
      {removing && items && (
        <DeleteStatusDialog
          status={removing}
          all={items}
          onClose={() => setRemoving(null)}
          onDeleted={async (r) => {
            setRemoving(null);
            await load();
            flash(r.moved_projects ? `Estado borrado. ${plural(r.moved_projects, "proyecto pasó", "proyectos pasaron")} al estado elegido.` : "Estado borrado");
          }}
        />
      )}
    </Section>
  );
}

function StatusRow({
  s,
  first,
  last,
  canEdit,
  busy,
  onSave,
  onMove,
  onRemove,
}: {
  s: Status;
  first: boolean;
  last: boolean;
  canEdit: boolean;
  busy: boolean;
  onSave: (c: Partial<Pick<Status, "name" | "fg" | "bg" | "dot">>) => void;
  onMove: (step: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState(s.name);
  const [colors, setColors] = useState<Colors>({ fg: s.fg, bg: s.bg, dot: s.dot });
  const commitName = () => {
    const v = name.trim();
    if (!v) setName(s.name);
    else if (v !== s.name) onSave({ name: v });
  };
  const commitColor = (key: keyof Colors) => colors[key].toLowerCase() !== s[key].toLowerCase() && onSave({ [key]: colors[key] });
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-[10px] border border-line bg-fill-2 px-3 py-2.5">
      <span className="flex flex-col">
        <button type="button" disabled={!canEdit || busy || first} aria-label={`Subir ${s.name}`} onClick={() => onMove(-1)} className="flex h-5 w-7 items-center justify-center rounded text-muted hover:bg-fill disabled:opacity-30">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 15 6-6 6 6" /></svg>
        </button>
        <button type="button" disabled={!canEdit || busy || last} aria-label={`Bajar ${s.name}`} onClick={() => onMove(1)} className="flex h-5 w-7 items-center justify-center rounded text-muted hover:bg-fill disabled:opacity-30">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
        </button>
      </span>
      <input
        aria-label={`Nombre del estado ${s.name}`}
        value={name}
        maxLength={40}
        disabled={!canEdit}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className={`${inputClass} h-9 w-44 font-bold`}
      />
      <span className="flex items-center gap-2">
        {COLOR_FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col items-center gap-0.5 text-[11px] font-semibold text-muted">
            <input
              type="color"
              aria-label={`Color del ${f.label} de ${s.name}`}
              value={colors[f.key]}
              disabled={!canEdit}
              onChange={(e) => setColors({ ...colors, [f.key]: e.target.value })}
              onBlur={() => commitColor(f.key)}
              className="h-7 w-9 cursor-pointer rounded-md border border-line-2 bg-white p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            />
            {f.label}
          </label>
        ))}
      </span>
      <span className="ml-auto flex items-center gap-2">
        <span className="text-xs font-semibold text-muted">
          {KIND_INFO[s.kind].label} · {plural(s.project_count, "proyecto", "proyectos")}
        </span>
        <StatusPill status={{ name, ...colors }} />
        {canEdit && (
          <button
            type="button"
            aria-label={`Borrar el estado ${s.name}`}
            title="Borrar estado"
            onClick={onRemove}
            className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v6M14 10v6" />
            </svg>
          </button>
        )}
      </span>
    </li>
  );
}

function AddStatusDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<StatusKind>("por_programar");
  const [colors, setColors] = useState<Colors>({ fg: KIND_INFO.por_programar.fg, bg: KIND_INFO.por_programar.bg, dot: KIND_INFO.por_programar.dot });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Al cambiar de tipo se proponen los colores de ese tipo.
  const pickKind = (k: StatusKind) => {
    setKind(k);
    setColors({ fg: KIND_INFO[k].fg, bg: KIND_INFO[k].bg, dot: KIND_INFO[k].dot });
  };

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api("/statuses", { method: "POST", body: { name: name.trim(), kind, ...colors } });
      await onCreated();
    } catch (e) {
      setError(message(e));
      setSaving(false);
    }
  }

  return (
    <Modal title="Agregar estado" subtitle="El tipo decide qué datos pide el proyecto y no se puede cambiar después." onClose={onClose} wide>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Nombre">
          <input className="w-full border-0 bg-transparent p-0 text-[15px] font-semibold outline-none" value={name} maxLength={40} required onChange={(e) => setName(e.target.value)} data-autofocus />
        </Field>
        <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
          <legend className="mb-1 text-[12px] font-bold uppercase tracking-wide text-subtle">Tipo</legend>
          {STATUS_KINDS.map((k) => (
            <label
              key={k}
              className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2 focus-within:outline focus-within:outline-2 focus-within:outline-ink ${kind === k ? "border-ink bg-fill-2" : "border-line bg-white"}`}
            >
              <input type="radio" name="status-kind" value={k} checked={kind === k} onChange={() => pickKind(k)} className="mt-1" />
              <span className="flex flex-col">
                <span className="text-sm font-bold">{KIND_INFO[k].label}</span>
                <span className="text-[13px] text-muted">{KIND_INFO[k].help}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          {COLOR_FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col items-center gap-0.5 text-[11px] font-semibold text-muted">
              <input
                type="color"
                aria-label={`Color del ${f.label}`}
                value={colors[f.key]}
                onChange={(e) => setColors({ ...colors, [f.key]: e.target.value })}
                className="h-7 w-9 cursor-pointer rounded-md border border-line-2 bg-white p-0.5"
              />
              {f.label}
            </label>
          ))}
          <span className="ml-auto">
            <StatusPill status={{ name: name.trim() || "Vista previa", ...colors }} />
          </span>
        </div>
        {error && <Banner tone="danger">{error}</Banner>}
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={saving || !name.trim()}>{saving ? "Guardando…" : "Agregar estado"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteStatusDialog({ status, all, onClose, onDeleted }: { status: Status; all: Status[]; onClose: () => void; onDeleted: (r: StatusDeleted) => Promise<void> }) {
  const others = all.filter((o) => o.id !== status.id);
  const lastOfKind = !others.some((o) => o.kind === status.kind);
  // Primero los del mismo tipo: no cambian las reglas del proyecto.
  const options = [...others].sort((a, b) => Number(b.kind === status.kind) - Number(a.kind === status.kind) || a.sort - b.sort);
  const [replacement, setReplacement] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const n = status.project_count;

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const body = { version: status.version, ...(n > 0 ? { replacement_id: replacement } : {}) };
      const r = await api<StatusDeleted>(`/statuses/${status.id}`, { method: "DELETE", body });
      await onDeleted(r);
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  const blocked = lastOfKind || (n > 0 && !replacement);
  return (
    <Modal title={`Borrar «${status.name}»`} onClose={onClose}>
      <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-ink-2">
        {lastOfKind ? (
          <Banner tone="warn">Es el único estado de tipo {KIND_INFO[status.kind].label}. Agrega otro de ese tipo antes de borrarlo.</Banner>
        ) : n === 0 ? (
          <p className="m-0">Ningún proyecto usa este estado. Se borrará sin más cambios.</p>
        ) : (
          <>
            <p className="m-0">
              {plural(n, "proyecto usa", "proyectos usan")} este estado (archivados incluidos). Elige a qué estado {n === 1 ? "pasa" : "pasan"}.
            </p>
            <Field label="Pasan a" hint="Si el nuevo estado pide fechas o equipo y a algún proyecto le falta, el borrado se detiene y te dice cuál.">
              <select value={replacement} onChange={(e) => setReplacement(e.target.value)} className={`${inputClass} h-9`} data-autofocus>
                <option value="">Elige un estado…</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({KIND_INFO[o.kind].label})
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
        {error && <Banner tone="danger">{error}</Banner>}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button type="button" variant="danger" onClick={() => void confirm()} disabled={busy || blocked}>{busy ? "Un momento…" : "Borrar estado"}</Button>
      </div>
    </Modal>
  );
}
