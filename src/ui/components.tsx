import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { Status } from "../../shared/contracts/statuses";

// Piezas básicas del sistema visual V4. Cada módulo puede crear las suyas en su carpeta.

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" };
export function Button({ variant = "secondary", className = "", ...props }: ButtonProps) {
  const styles = {
    primary: "bg-ink text-white hover:bg-navy",
    secondary: "bg-white text-ink-2 border border-line hover:bg-fill-2",
    ghost: "bg-transparent text-muted hover:bg-fill",
    danger: "bg-white text-danger border border-line hover:bg-danger-soft",
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors disabled:opacity-50 ${styles} ${className}`}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[22px] border border-line bg-card shadow-[var(--shadow-card)] ${className}`}>{children}</section>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="m-0 text-[28px] font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-subtle">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

/** Píldora de estado con los colores de la lista editable (EST-03). */
export function StatusPill({ status, children }: { status: Pick<Status, "name" | "fg" | "bg" | "dot">; children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-bold" style={{ color: status.fg, background: status.bg }}>
      <span aria-hidden className="size-2 rounded-full" style={{ background: status.dot }} />
      {children ?? status.name}
    </span>
  );
}

/** Monograma de empresa: punto de color y 2 letras (MUR-13). */
export function CompanyMono({ code, color, name }: { code: string; color: string; name?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-ink-2" title={name}>
      <span aria-hidden className="size-2.5 rounded-full" style={{ background: color }} />
      {code}
    </span>
  );
}

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors disabled:opacity-50 ${on ? "justify-end bg-navy" : "justify-start bg-faint"}`}
    >
      <span className="size-6 rounded-full bg-white shadow" />
    </button>
  );
}

/** Control segmentado (tipo de sistema, semanas del mural…). */
export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-xl bg-fill p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`h-9 rounded-lg px-3 text-sm ${o.value === value ? "bg-white font-bold text-ink shadow-sm" : "font-semibold text-muted"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Campo con la etiqueta dentro, como en los paneles de V4. */
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 rounded-xl border border-line bg-white px-3 py-2 focus-within:border-ink">
      <span className="text-[12px] font-bold uppercase tracking-wide text-subtle">{label}</span>
      {children}
      {hint && <span className="text-[12px] text-subtle">{hint}</span>}
    </label>
  );
}

export function Banner({ tone = "warn", children }: { tone?: "warn" | "danger" | "ok" | "info"; children: ReactNode }) {
  const styles = {
    warn: "bg-warn-soft text-warn border-[#FEDF89]",
    danger: "bg-danger-soft text-danger border-[#FECDCA]",
    ok: "bg-ok-soft text-ok border-[#BFE6CC]",
    info: "bg-fill-2 text-ink-2 border-line",
  }[tone];
  return <div role={tone === "danger" ? "alert" : "status"} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${styles}`}>{children}</div>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
      <p className="m-0 text-lg font-bold">{title}</p>
      {children && <div className="max-w-md text-sm text-subtle">{children}</div>}
    </div>
  );
}

/** Mensaje breve tipo "Guardado". */
export function useFlash(ms = 2200) {
  const [msg, setMsg] = useState<{ text: string; tone: "ok" | "danger" } | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), ms);
    return () => clearTimeout(t);
  }, [msg, ms]);
  const node = msg ? (
    <div role="status" className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-lg ${msg.tone === "ok" ? "bg-ink" : "bg-danger"}`}>
      {msg.text}
    </div>
  ) : null;
  return { flash: (text: string, tone: "ok" | "danger" = "ok") => setMsg({ text, tone }), node };
}

export const initials = (name: string) =>
  name.replace(/^Sr\.\s*/, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
