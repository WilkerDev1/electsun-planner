import { useEffect, useId, useRef, type ReactNode } from "react";
import { Banner, Button } from "../../ui/components";

/**
 * Diálogo modal sobre <dialog>: el navegador atrapa el foco, Escape cierra y el fondo queda inerte.
 * Se monta cuando hace falta (render condicional) y llama a `onClose` al cerrar.
 */
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    // `autoFocus` de React corre antes de abrir el <dialog>; el primer campo se marca con data-autofocus.
    d?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className={`m-auto max-h-[92vh] w-[calc(100vw-32px)] overflow-y-auto rounded-[22px] border border-line bg-card p-0 text-ink shadow-[0_24px_60px_rgba(16,24,40,0.25)] backdrop:bg-ink/45 ${wide ? "max-w-[560px]" : "max-w-[460px]"}`}
    >
      <div className="p-6">
        <header className="mb-4 flex items-start justify-between gap-4">
          <h2 id={titleId} className="m-0 text-xl font-extrabold tracking-tight">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="-mr-2 -mt-1 flex size-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-fill"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

/** Confirmación de una acción con consecuencias (desactivar, rotar, revocar…). */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  danger,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="text-[15px] leading-relaxed text-ink-2">{children}</div>
      {error && (
        <div className="mt-3">
          <Banner tone="danger">{error}</Banner>
        </div>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
        <Button type="button" variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
          {busy ? "Un momento…" : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
