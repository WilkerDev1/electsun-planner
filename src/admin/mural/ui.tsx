import type { ReactNode } from "react";

// Piezas propias de la pantalla Mural (V4Config).

/** Tarjeta de la configuración: título de 16 px y contenido en columna. */
export function Section({ title, children, hint, aside, id }: { id?: string; title: string; children: ReactNode; hint?: ReactNode; aside?: ReactNode }) {
  return (
    <section id={id} className="flex flex-col gap-2.5 rounded-2xl border border-line bg-white p-[18px]">
      <div className="flex items-start justify-between gap-3">
        <h2 className="m-0 text-base font-extrabold">{title}</h2>
        {aside}
      </div>
      {hint && <p className="m-0 text-[13px] leading-snug text-muted">{hint}</p>}
      {children}
    </section>
  );
}

export const inputClass =
  "h-10 min-w-0 rounded-[10px] border border-line-2 bg-white px-3 text-sm text-ink disabled:cursor-not-allowed disabled:bg-fill-2 disabled:text-subtle";

export const smallButton =
  "inline-flex h-8 items-center rounded-lg border border-line bg-white px-2.5 text-[13px] font-bold text-ink-2 hover:bg-fill-2 disabled:cursor-not-allowed disabled:opacity-50";

/** "hace 5 min", "hace 3 h", "ayer" o la fecha, para la última conexión de una pantalla. */
export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return "Nunca se ha conectado";
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "Conectada ahora";
  if (mins < 60) return `Última conexión: hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Última conexión: hace ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Última conexión: ayer" : `Última conexión: hace ${days} días`;
}
