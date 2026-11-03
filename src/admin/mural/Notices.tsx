import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../ui/api";
import { Banner, Button, Field } from "../../ui/components";
import { Modal } from "../../ui/Modal";
import { addDays, dayLabel } from "../../../shared/domain";
import type { Notice } from "../../../shared/contracts/mural";
import { Section, inputClass, smallButton } from "./ui";

// Avisos generales (AVI-02): alta, edición, borrado y caducidad. Oficina y administración.

const MAX = 140;
const message = (e: unknown) => (e instanceof ApiError ? e.message : "No se pudo guardar el aviso. Intenta de nuevo.");

function when(n: Notice, today: string) {
  if (n.expires_on < today) return `Caducó el ${dayLabel(n.expires_on)}`;
  if (n.starts_on > today) return `Empieza el ${dayLabel(n.starts_on)} · visible hasta el ${dayLabel(n.expires_on)}`;
  return `Visible hasta el ${dayLabel(n.expires_on)}`;
}

export function NoticesCard({ today, flash }: { today: string; flash: (text: string, tone?: "ok" | "danger") => void }) {
  const [items, setItems] = useState<Notice[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [text, setText] = useState("");
  const [until, setUntil] = useState(() => addDays(today, 7));
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await api<Notice[]>("/notices"));
      setLoadError("");
    } catch (e) {
      setLoadError(message(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api("/notices", { body: { text: text.trim(), starts_on: today, expires_on: until < today ? today : until } });
      setText("");
      await load();
      flash("Aviso agregado");
    } catch (err) {
      flash(message(err), "danger");
    } finally {
      setBusy(false);
    }
  }

  async function remove(n: Notice) {
    try {
      await api(`/notices/${n.id}`, { method: "DELETE" });
      await load();
      flash("Aviso quitado");
    } catch (err) {
      flash(message(err), "danger");
    }
  }

  return (
    <Section title="Avisos generales" hint="Para avisos que no son de un proyecto. Las observaciones de cada proyecto se marcan en la tabla. El mural muestra hasta 3 a la vez.">
      {loadError && <Banner tone="danger">{loadError}</Banner>}
      {items?.length === 0 && <p className="m-0 text-sm text-subtle">Todavía no hay avisos generales.</p>}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {items?.map((n) => {
          const expired = n.expires_on < today;
          return (
            <li key={n.id} className="flex items-center gap-2.5 rounded-[10px] border border-line bg-fill-2 px-3 py-2.5">
              <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: expired ? "#98A2B3" : "#EA6A1F" }} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={`break-words text-sm font-bold ${expired ? "text-subtle" : ""}`}>{n.text}</span>
                <span className="text-xs text-muted">{when(n, today)}</span>
              </span>
              <button type="button" className={smallButton} aria-label={`Editar aviso: ${n.text}`} onClick={() => setEditing(n)}>
                Editar
              </button>
              <button
                type="button"
                aria-label={`Quitar aviso: ${n.text}`}
                onClick={() => void remove(n)}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-fill"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </li>
          );
        })}
      </ul>
      <form onSubmit={add} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            type="text"
            aria-label="Nuevo aviso"
            placeholder="Escribe un aviso…"
            maxLength={MAX}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className={`${inputClass} flex-1`}
          />
          <Button type="submit" variant="primary" disabled={busy || !text.trim()} className="h-10 rounded-[10px]">
            Agregar
          </Button>
        </div>
        <div className="flex items-center justify-between gap-2 text-[13px] text-muted">
          <label className="flex items-center gap-2 font-semibold">
            Visible hasta
            <input type="date" value={until} min={today} onChange={(e) => setUntil(e.target.value)} className={`${inputClass} h-9 text-[13px]`} />
          </label>
          <span aria-live="polite">{text.length}/{MAX}</span>
        </div>
      </form>
      {editing && (
        <EditDialog
          notice={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
            flash("Aviso guardado");
          }}
        />
      )}
    </Section>
  );
}

function EditDialog({ notice, onClose, onSaved }: { notice: Notice; onClose: () => void; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState({ text: notice.text, starts_on: notice.starts_on, expires_on: notice.expires_on, sort: notice.sort });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/notices/${notice.id}`, { method: "PATCH", body: { ...draft, text: draft.text.trim() } });
      await onSaved();
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  }

  return (
    <Modal title="Editar aviso" onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-3">
        <Field label="Texto" hint={`${draft.text.length}/${MAX}`}>
          <textarea
            data-autofocus
            rows={2}
            maxLength={MAX}
            value={draft.text}
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            className="resize-none border-0 bg-transparent text-sm outline-none"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Desde">
            <input type="date" value={draft.starts_on} onChange={(e) => setDraft({ ...draft, starts_on: e.target.value })} className="border-0 bg-transparent text-sm outline-none" />
          </Field>
          <Field label="Hasta (caducidad)">
            <input type="date" value={draft.expires_on} onChange={(e) => setDraft({ ...draft, expires_on: e.target.value })} className="border-0 bg-transparent text-sm outline-none" />
          </Field>
        </div>
        <Field label="Orden" hint="0 aparece primero.">
          <input
            type="number"
            min={0}
            max={99}
            value={draft.sort}
            onChange={(e) => setDraft({ ...draft, sort: Math.min(99, Math.max(0, Number(e.target.value) || 0)) })}
            className="border-0 bg-transparent text-sm outline-none"
          />
        </Field>
        {error && <Banner tone="danger">{error}</Banner>}
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !draft.text.trim()}>
            {busy ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
