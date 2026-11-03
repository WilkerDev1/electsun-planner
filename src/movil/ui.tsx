import type { ReactNode } from "react";
import { useOutletContext } from "react-router-dom";
import type { MovilCompany, MovilPerson, MovilView, SegmentState } from "../../shared/contracts/movil";

// Piezas compartidas de las pantallas móviles (design/v4/V4Movil). Pensadas para leerse a pleno sol:
// nada de texto por debajo de 13 px y los controles táctiles miden al menos 44 px (MOV-06).

export type MovilCtx = { view: MovilView; fetchedAt: Date | null; offline: boolean };
export const useMovil = () => useOutletContext<MovilCtx>();

export const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** Pestaña desde la que se abrió el detalle de una obra: rotula el botón "Atrás" y marca la barra inferior. */
export type FromTab = "Hoy" | "Obras" | "Calendario";
export const jobLink = (id: string) => `/m/obra/${id}`;
export const fromState = (from: FromTab) => ({ from });

const mix = (hex: string, target: number, amount: number) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return "#" + c.map((v) => Math.round(v + (target - v) * amount).toString(16).padStart(2, "0")).join("");
};
/** Colores del monograma de una empresa: fondo muy claro y letras oscuras del mismo tono (MUR-13). */
export const tones = (color: string) => (/^#[0-9A-Fa-f]{6}$/.test(color) ? { bg: mix(color, 255, 0.86), fg: mix(color, 0, 0.5) } : { bg: "#F2F4F7", fg: "#344054" });

export function Icon({ d, size = 20, width = 2, className }: { d: string; size?: number; width?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`shrink-0 ${className ?? ""}`}>
      <path d={d} />
    </svg>
  );
}

export const ICON = {
  chevronRight: "m9 6 6 6-6 6",
  chevronLeft: "m15 6-6 6 6 6",
  navigate: "m3 11 18-8-8 18-2-8z",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2",
  pin: "M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  warn: "M12 3 2 21h20zM12 10v5M12 18h.01",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  home: "M3 11.5 12 4l9 7.5M5 10v10h14V10M10 20v-6h4v6",
  table: "M3 5h18v14H3zM3 10h18M9 5v14",
  calendar: "M4 5h16v16H4zM4 10h16M8 3v4M16 3v4",
  agenda: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  timeline: "M3 6h10M7 12h12M5 18h8",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  wifiOff: "M2 2l20 20M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 5.2-2.6M19 12.9a10 10 0 0 0-2.3-1.7M2 8.8a15 15 0 0 1 4.2-2.7M22 8.8A15 15 0 0 0 10.5 5.1M12 20h.01",
};

export function Sun({ size = 40 }: { size?: number }) {
  return (
    <span role="img" aria-label="Electsun" className="flex shrink-0 items-center justify-center rounded-xl bg-brand text-white" style={{ width: size, height: size }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" aria-hidden>
        <circle cx="12" cy="12" r="4.5" />
        <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
      </svg>
    </span>
  );
}

/** Monograma de empresa (2 letras sobre su color suave). */
export function CompanyMono({ company, size = 40, round = true }: { company: MovilCompany; size?: number; round?: boolean }) {
  const t = tones(company.color);
  return (
    <span
      role="img"
      aria-label={company.name}
      className={`flex shrink-0 items-center justify-center text-[14px] font-extrabold ${round ? "rounded-full" : "rounded-xl"}`}
      style={{ width: size, height: size, background: t.bg, color: t.fg }}
    >
      {company.code}
    </span>
  );
}

export function TeamBadge({ code, className = "" }: { code: string; className?: string }) {
  return <span className={`shrink-0 rounded-md bg-ink px-2 py-0.5 text-[13px] font-extrabold text-white ${className}`}>{code}</span>;
}

export function MineChip() {
  return <span className="shrink-0 rounded-md bg-brand-soft px-1.5 py-0.5 text-[13px] font-extrabold text-brand-ink">TU EQUIPO</span>;
}

export const telHref = (phone: string) => "tel:" + phone.replace(/[^\d+]/g, "");

/** Botón de llamada de 44 px. */
export function CallButton({ phone, name }: { phone: string; name: string }) {
  return (
    <a href={telHref(phone)} aria-label={`Llamar a ${name}`} className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-ok-soft text-ok no-underline active:opacity-70">
      <Icon d={ICON.phone} size={20} width={2.2} />
    </a>
  );
}

/** "Cómo llegar": abre Google Maps con el lugar. */
export function MapsButton({ url, children, className = "" }: { url: string; children: ReactNode; className?: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={`flex min-h-11 items-center justify-center gap-2 rounded-xl bg-ink px-3.5 text-[15px] font-bold text-white no-underline active:opacity-80 ${className}`}>
      <Icon d={ICON.navigate} size={16} width={2.2} />
      {children}
    </a>
  );
}

/** Un bloque por día laborable: hecho, hoy (con aro naranja) o por hacer. */
export function Segments({ segments, kind, height = 8 }: { segments: SegmentState[]; kind: "en_obra" | "programado"; height?: number }) {
  return (
    <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${Math.max(segments.length, 1)}, minmax(0, 1fr))` }} role="img" aria-label={`${segments.filter((s) => s === "done").length} de ${segments.length} días trabajados`}>
      {segments.map((s, i) => (
        <span
          key={i}
          className="rounded-[3px]"
          style={{
            height,
            background: s === "done" ? "#16A34A" : s === "today" ? "#86D3A4" : kind === "en_obra" ? "#DCF3E5" : "#E4E9FF",
            boxShadow: s === "today" && height > 8 ? "0 0 0 2px #EA6A1F" : undefined,
          }}
        />
      ))}
    </div>
  );
}

export function Panel({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <section aria-label={label} className={`rounded-[20px] border border-line bg-card ${className}`}>
      {children}
    </section>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="m-0 px-1 text-[17px] font-extrabold">{children}</h2>;
}

/** Fila de una persona del equipo con su botón de llamada si se puede. */
export function PersonRow({ person }: { person: MovilPerson }) {
  const lead = person.is_lead;
  const away = person.state === "Vacaciones";
  return (
    <div className="flex min-h-11 items-center gap-3">
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold"
        style={{ background: lead ? "#EEF0FE" : person.is_me ? "#FFF1E7" : "#F2F4F7", color: lead ? "#3538CD" : person.is_me ? "#9A3412" : "#344054" }}
      >
        {person.initials}
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-snug">
        <span className="text-[16px] font-bold">
          {person.name}
          {person.is_me && " (tú)"}
        </span>
        <span className={`text-[14px] ${away ? "text-warn" : lead ? "text-[#3B4FC4]" : "text-muted"}`}>
          {person.level}
          {away && " · de vacaciones"}
        </span>
      </span>
      {person.phone && <CallButton phone={person.phone} name={person.name} />}
    </div>
  );
}

export function PageTitle({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        <h1 className="m-0 text-[28px] font-extrabold leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="m-0 text-[15px] text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

/** Interruptor segmentado de dos o más opciones (Todas / Mi equipo, Agenda / Línea de tiempo). */
export function Switch<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string; icon?: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="flex rounded-xl bg-[#E9EBEF] p-1">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[9px] border-0 text-[15px] font-bold ${on ? "bg-white text-ink shadow-[0_1px_2px_rgba(16,24,40,0.1)]" : "bg-transparent text-muted"}`}
          >
            {o.icon && <Icon d={o.icon} size={16} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
