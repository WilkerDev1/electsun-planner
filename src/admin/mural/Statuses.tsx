import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../../ui/api";
import { Banner, StatusPill } from "../../ui/components";
import type { Status } from "../../../shared/contracts/statuses";
import { Section, inputClass } from "./ui";

// Estados (EST-04): renombrar, recolorear y reordenar. Solo administración. El tipo es fijo y no se borran.

const message = (e: unknown) => (e instanceof ApiError ? e.message : "No se pudo guardar el estado. Intenta de nuevo.");
type Colors = Pick<Status, "fg" | "bg" | "dot">;
const COLOR_FIELDS: { key: keyof Colors; label: string }[] = [
  { key: "fg", label: "texto" },
  { key: "bg", label: "fondo" },
  { key: "dot", label: "punto" },
];

export function StatusesCard({ canEdit, flash }: { canEdit: boolean; flash: (text: string, tone?: "ok" | "danger") => void }) {
  const [items, setItems] = useState<Status[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);

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
      hint="El nombre y los colores se ven en la tabla de Proyectos y en el mural. El tipo de cada estado es fijo y un estado no se borra."
    >
      {!canEdit && <Banner tone="info">Solo la administración puede cambiar los estados.</Banner>}
      {loadError && <Banner tone="danger">{loadError}</Banner>}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {items?.map((s, i) => (
          <StatusRow key={`${s.id}-${s.version}`} s={s} first={i === 0} last={i === items.length - 1} canEdit={canEdit} busy={busy} onSave={(c) => save(s, c)} onMove={(step) => void move(i, step)} />
        ))}
      </ul>
    </Section>
  );
}

function StatusRow({ s, first, last, canEdit, busy, onSave, onMove }: { s: Status; first: boolean; last: boolean; canEdit: boolean; busy: boolean; onSave: (c: Partial<Pick<Status, "name" | "fg" | "bg" | "dot">>) => void; onMove: (step: -1 | 1) => void }) {
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
      <span className="ml-auto">
        <StatusPill status={{ name, ...colors }} />
      </span>
    </li>
  );
}
