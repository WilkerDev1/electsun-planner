import type { ReactNode } from "react";

/** Marca naranja con el sol del dock (design/v4/V4Dock). */
export function SunMark({ size = 48 }: { size?: number }) {
  return (
    <span
      role="img"
      aria-label="Electsun"
      className="flex shrink-0 items-center justify-center rounded-[15px] bg-brand text-white"
      style={{ width: size, height: size }}
    >
      <svg width={size * 0.54} height={size * 0.54} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" aria-hidden>
        <circle cx="12" cy="12" r="4.5" />
        <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
      </svg>
    </span>
  );
}

/** Tarjeta centrada de las pantallas sin cuenta: Login y Activar (AUT-09). */
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex flex-col items-center gap-3">
          <SunMark />
          <p className="m-0 text-[15px] font-extrabold tracking-tight text-ink">Electsun Planner</p>
        </div>
        <section className="rounded-[24px] border border-line bg-card p-8 shadow-[var(--shadow-card)]">
          <h1 className="m-0 text-[26px] font-extrabold tracking-tight">{title}</h1>
          {subtitle && <p className="mb-0 mt-1.5 text-[15px] leading-relaxed text-subtle">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </section>
        {footer && <p className="mx-4 mb-0 mt-5 text-center text-[13px] leading-relaxed text-subtle">{footer}</p>}
      </div>
    </main>
  );
}
