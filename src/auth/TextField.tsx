import { useId, useState, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  label: string;
  hint?: string;
  error?: string;
  /** Contraseña con botón para mostrar u ocultar lo escrito. */
  reveal?: boolean;
};

/** Campo con la etiqueta encima. Enlaza la etiqueta, la ayuda y el error con el control. */
export function TextField({ label, hint, error, reveal, className = "", type, ...input }: Props) {
  const uid = useId();
  const [shown, setShown] = useState(false);
  const note = error ?? hint;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={uid} className="text-[13px] font-bold text-ink-2">
        {label}
      </label>
      <div className="relative">
        <input
          {...input}
          id={uid}
          type={reveal ? (shown ? "text" : "password") : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={note ? `${uid}-note` : undefined}
          className={`h-11 w-full rounded-xl border bg-white px-3.5 text-[15px] text-ink placeholder:text-faint disabled:bg-fill-2 ${error ? "border-danger" : "border-line-2"} ${reveal ? "pr-12" : ""} ${className}`}
        />
        {reveal && (
          <button
            type="button"
            aria-pressed={shown}
            aria-label="Mostrar contraseña"
            onClick={() => setShown((s) => !s)}
            className="absolute right-1 top-1 flex size-9 items-center justify-center rounded-lg text-muted hover:bg-fill"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {shown ? <path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 8.5 4.2 9.5 6-.4.7-1.2 1.8-2.4 2.9M6.5 7.6C4.4 9 3 11 2.5 12c1 1.8 4.5 6 9.5 6 1.4 0 2.7-.3 3.8-.9M9.9 9.9a3 3 0 0 0 4.2 4.2" /> : <path d="M2.5 12C3.5 10.2 7 6 12 6s8.5 4.2 9.5 6c-1 1.8-4.5 6-9.5 6s-8.5-4.2-9.5-6M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6" />}
            </svg>
          </button>
        )}
      </div>
      {note && (
        <p id={`${uid}-note`} className={`m-0 text-[13px] ${error ? "font-semibold text-danger" : "text-subtle"}`}>
          {note}
        </p>
      )}
    </div>
  );
}
