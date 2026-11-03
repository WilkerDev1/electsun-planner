import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../ui/api";
import { Banner, Button, Field, Toggle } from "../../ui/components";
import { Modal } from "../../ui/Modal";
import { PREP_APPLIES, plural, type PrepAppliesTo } from "../../../shared/domain";
import type { PrepItem, PrepItemDeleted } from "../../../shared/contracts/prep";
import { Section, inputClass, smallButton } from "../mural/ui";

// Catálogo de preparación (PRY-12): agregar, renombrar, ordenar y quitar parámetros. Solo la administración edita.

const message = (e: unknown) => (e instanceof ApiError ? e.message : "No se pudo guardar. Intenta de nuevo.");
const APPLIES_LABEL: Record<PrepAppliesTo, string> = { todos: "Todos los sistemas", neta: "Medición neta", hibrido: "Híbrido" };
type Flash = (text: string, tone?: "ok" | "danger") => void;

export function PrepCatalogCard({ canEdit, flash }: { canEdit: boolean; flash: Flash }) {
  const [items, setItems] = useState<PrepItem[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<PrepItem | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await api<PrepItem[]>("/prep-items"));
      setLoadError("");
    } catch (e) {
      setLoadError(message(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function save(item: PrepItem, patch: Partial<Pick<PrepItem, "code" | "name" | "pending_label" | "applies_to" | "default_on">>) {
    setBusy(true);
    try {
      await api(`/prep-items/${item.id}`, { method: "PATCH", body: { version: item.version, ...patch } });
      flash("Guardado");
    } catch (e) {
      flash(message(e), "danger");
    } finally {
      await load();
      setBusy(false);
    }
  }

  async function move(index: number, step: -1 | 1) {
    if (!items) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(index + step, 0, moved);
    setBusy(true);
    try {
      for (const [i, s] of next.entries()) if (s.sort !== i + 1) await api(`/prep-items/${s.id}`, { method: "PATCH", body: { version: s.version, sort: i + 1 } });
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
      title="Preparación"
      hint="Lo que hay que tener listo antes de la obra. En cada proyecto se eligen los parámetros que aplican. El motivo de espera es lo que se lee en el mural cuando falta."
      aside={
        canEdit && (
          <button type="button" onClick={() => setAdding(true)} className={smallButton}>
            Agregar parámetro
          </button>
        )
      }
    >
      {!canEdit && <Banner tone="info">Solo la administración puede cambiar la preparación.</Banner>}
      {loadError && <Banner tone="danger">{loadError}</Banner>}
      {items && items.length === 0 && <p className="m-0 text-sm text-muted">Todavía no hay parámetros de preparación.</p>}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {items?.map((it, i) => (
          <PrepRow
            key={`${it.id}-${it.version}`}
            item={it}
            first={i === 0}
            last={i === items.length - 1}
            canEdit={canEdit}
            busy={busy}
            onSave={(p) => void save(it, p)}
            onMove={(step) => void move(i, step)}
            onRemove={() => setRemoving(it)}
          />
        ))}
      </ul>
      {adding && (
        <AddPrepDialog
          onClose={() => setAdding(false)}
          onCreated={async () => {
            setAdding(false);
            await load();
            flash("Parámetro agregado");
          }}
        />
      )}
      {removing && (
        <DeletePrepDialog
          item={removing}
          onClose={() => setRemoving(null)}
          onDeleted={async () => {
            setRemoving(null);
            await load();
            flash("Parámetro borrado");
          }}
        />
      )}
    </Section>
  );
}

const cell = "h-9 rounded-lg border border-line-2 bg-white px-2 text-sm text-ink disabled:cursor-not-allowed disabled:bg-fill-2 disabled:text-subtle";

function PrepRow({
  item,
  first,
  last,
  canEdit,
  busy,
  onSave,
  onMove,
  onRemove,
}: {
  item: PrepItem;
  first: boolean;
  last: boolean;
  canEdit: boolean;
  busy: boolean;
  onSave: (p: Partial<Pick<PrepItem, "code" | "name" | "pending_label" | "applies_to" | "default_on">>) => void;
  onMove: (step: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [code, setCode] = useState(item.code);
  const [name, setName] = useState(item.name);
  const [label, setLabel] = useState(item.pending_label);
  const off = !canEdit || busy;
  const moveBtn = "flex size-8 items-center justify-center rounded-lg text-muted hover:bg-fill disabled:opacity-30";
  return (
    <li className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-fill-2 p-2.5">
      <label className="flex flex-col gap-0.5 text-[11px] font-semibold text-muted">
        Código
        <input
          aria-label={`Código de ${item.name}`}
          className={`${cell} w-16 font-bold uppercase`}
          value={code}
          maxLength={4}
          disabled={off}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onBlur={() => {
            const v = code.trim();
            if (!v) setCode(item.code);
            else if (v !== item.code) onSave({ code: v });
          }}
        />
      </label>
      <label className="flex min-w-[160px] flex-[1_1_180px] flex-col gap-0.5 text-[11px] font-semibold text-muted">
        Nombre
        <input
          aria-label={`Nombre de ${item.name}`}
          className={cell}
          value={name}
          maxLength={60}
          disabled={off}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const v = name.trim();
            if (!v) setName(item.name);
            else if (v !== item.name) onSave({ name: v });
          }}
        />
      </label>
      <label className="flex min-w-[130px] flex-[1_1_140px] flex-col gap-0.5 text-[11px] font-semibold text-muted">
        Motivo de espera
        <input
          aria-label={`Motivo de espera de ${item.name}`}
          className={cell}
          value={label}
          maxLength={40}
          disabled={off}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => {
            const v = label.trim();
            if (!v) setLabel(item.pending_label);
            else if (v !== item.pending_label) onSave({ pending_label: v });
          }}
        />
      </label>
      <label className="flex flex-col gap-0.5 text-[11px] font-semibold text-muted">
        Aplica a
        <select aria-label={`Aplica a, ${item.name}`} className={cell} value={item.applies_to} disabled={off} onChange={(e) => onSave({ applies_to: e.target.value as PrepAppliesTo })}>
          {PREP_APPLIES.map((a) => (
            <option key={a} value={a}>{APPLIES_LABEL[a]}</option>
          ))}
        </select>
      </label>
      <span className="flex flex-col items-start gap-1 text-[11px] font-semibold text-muted">
        Proyectos nuevos
        <Toggle on={item.default_on} label={`${item.name}: se agrega a los proyectos nuevos`} disabled={off} onChange={(v) => onSave({ default_on: v })} />
      </span>
      <span className="ml-auto flex items-center gap-1">
        <span className="mr-1 text-xs font-semibold text-muted">{plural(item.project_count, "proyecto", "proyectos")}</span>
        {canEdit && (
          <>
            <button type="button" aria-label={`Subir ${item.name}`} title="Subir" disabled={off || first} onClick={() => onMove(-1)} className={moveBtn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 15 6-6 6 6" /></svg>
            </button>
            <button type="button" aria-label={`Bajar ${item.name}`} title="Bajar" disabled={off || last} onClick={() => onMove(1)} className={moveBtn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
            </button>
            <button type="button" aria-label={`Borrar el parámetro ${item.name}`} title="Borrar parámetro" disabled={busy} onClick={onRemove} className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v6M14 10v6" /></svg>
            </button>
          </>
        )}
      </span>
    </li>
  );
}

function AddPrepDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [applies, setApplies] = useState<PrepAppliesTo>("todos");
  const [defaultOn, setDefaultOn] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api("/prep-items", { method: "POST", body: { code: code.trim(), name: name.trim(), pending_label: label.trim(), applies_to: applies, default_on: defaultOn } });
      await onCreated();
    } catch (e) {
      setError(message(e));
      setSaving(false);
    }
  }

  return (
    <Modal title="Agregar parámetro" subtitle="Aparecerá en la preparación de los proyectos que lo elijan." onClose={onClose} wide>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="grid grid-cols-[96px_1fr] gap-3">
          <Field label="Código" hint="1 a 4 letras.">
            <input className="w-full border-0 bg-transparent p-0 text-[15px] font-semibold uppercase outline-none" value={code} maxLength={4} required pattern="[A-Za-z0-9]{1,4}" onChange={(e) => setCode(e.target.value.toUpperCase())} data-autofocus />
          </Field>
          <Field label="Nombre">
            <input className="w-full border-0 bg-transparent p-0 text-[15px] font-semibold outline-none" value={name} maxLength={60} required onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
        <Field label="Motivo de espera" hint="Lo que se lee cuando falta, por ejemplo «espera permiso».">
          <input className="w-full border-0 bg-transparent p-0 text-[15px] font-semibold outline-none" value={label} maxLength={40} required onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <label className="flex flex-col gap-1 text-[12px] font-bold uppercase tracking-wide text-subtle">
          Aplica a
          <select className={`${inputClass} h-10 normal-case`} value={applies} onChange={(e) => setApplies(e.target.value as PrepAppliesTo)}>
            {PREP_APPLIES.map((a) => (
              <option key={a} value={a}>{APPLIES_LABEL[a]}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={defaultOn} onChange={(e) => setDefaultOn(e.target.checked)} />
          Agregarlo a los proyectos nuevos
        </label>
        {error && <Banner tone="danger">{error}</Banner>}
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={saving || !code.trim() || !name.trim() || !label.trim()}>{saving ? "Guardando…" : "Agregar parámetro"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function DeletePrepDialog({ item, onClose, onDeleted }: { item: PrepItem; onClose: () => void; onDeleted: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const n = item.project_count;

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await api<PrepItemDeleted>(`/prep-items/${item.id}`, { method: "DELETE", body: { version: item.version } });
      await onDeleted();
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  return (
    <Modal title={`Borrar «${item.name}»`} onClose={onClose}>
      <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-ink-2">
        {n === 0 ? (
          <p className="m-0">Ningún proyecto lo usa. Se borrará sin más cambios.</p>
        ) : (
          <Banner tone="warn">
            {plural(n, "proyecto tiene", "proyectos tienen")} este parámetro (archivados incluidos). Se quitará de {n === 1 ? "ese proyecto" : "todos ellos"} y se perderá si estaba hecho o pendiente.
          </Banner>
        )}
        {error && <Banner tone="danger">{error}</Banner>}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button type="button" variant="danger" onClick={() => void confirm()} disabled={busy}>{busy ? "Un momento…" : "Borrar parámetro"}</Button>
      </div>
    </Modal>
  );
}
