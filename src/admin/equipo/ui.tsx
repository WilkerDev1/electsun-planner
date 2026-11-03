import type { ReactNode, SelectHTMLAttributes } from "react";
import { ICON } from "./model";

// Piezas propias de la pantalla Equipo (V4EquipoTablas).

export const Svg = ({ d, size = 15, stroke = 2, className }: { d: string; size?: number; stroke?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
    <path d={d} />
  </svg>
);

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex h-9 w-60 max-w-full items-center gap-2 rounded-lg border border-line bg-white px-2.5 focus-within:border-ink">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#667085" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d={ICON.search} />
      </svg>
      <input
        type="search"
        aria-label="Buscar"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
      />
    </label>
  );
}

type ChipProps = SelectHTMLAttributes<HTMLSelectElement> & {
  fg: string;
  bg: string;
  border?: string;
  icon?: string;
  height?: number;
};
/** Selector con aspecto de etiqueta, para editar en la celda (nivel, equipo, estado). */
export function SelectChip({ fg, bg, border, icon, height = 30, className = "", children, style, ...props }: ChipProps) {
  return (
    <span className="relative inline-flex items-center" style={{ color: fg }}>
      {icon && <Svg d={icon} className="pointer-events-none absolute left-2" />}
      <select
        {...props}
        className={`cursor-pointer appearance-none rounded-lg text-[13px] font-bold disabled:cursor-wait disabled:opacity-60 ${className}`}
        style={{ color: fg, background: bg, border: `1px solid ${border ?? "transparent"}`, height, padding: `0 26px 0 ${icon ? 29 : 10}px`, ...style }}
      >
        {children}
      </select>
      <Svg d={ICON.chevron} size={12} stroke={2.6} className="pointer-events-none absolute right-2" />
    </span>
  );
}

export function Avatar({ text, bg, fg, size = 36, presence }: { text: string; bg: string; fg: string; size?: number; presence?: string }) {
  return (
    <span
      aria-hidden
      className="relative flex shrink-0 items-center justify-center rounded-full font-extrabold"
      style={{ width: size, height: size, background: bg, color: fg, fontSize: size > 32 ? 13 : 11 }}
    >
      {text}
      {presence && <span className="absolute -bottom-px -right-px size-2.5 rounded-full border-2 border-white" style={{ background: presence }} />}
    </span>
  );
}

export function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-9 items-center justify-center rounded-lg border-0 bg-transparent text-muted hover:bg-fill"
    >
      {children}
    </button>
  );
}

export const inputCls = "w-full border-0 bg-transparent p-0 text-[15px] font-semibold outline-none";
