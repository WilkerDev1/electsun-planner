import { useEffect, useState, type CSSProperties } from "react";
import { BRAND, TODAY_LINE, TZ } from "../../shared/domain";
import type { MuralView } from "../../shared/contracts/mural";

// Piezas comunes de los dos diseños del mural.

export const ACCENT = BRAND;
/** Naranja oscuro para fondos con texto blanco y para marcar "hoy": blanco sobre #C2410C da 5,18:1 (NF-04); sobre #EA6A1F, 3,19:1. */
export const TODAY_COLOR = TODAY_LINE;
export const FONT = "'Plus Jakarta Sans Variable', system-ui, sans-serif";

/** Estado de conexión que pinta el pie o la cabecera (MUR-07, MUR-11). */
export type LiveInfo = { fetchedAt: Date | null; offline: boolean };

export type ScreenProps = { view: MuralView; live: LiveInfo };

export const hhmm = (d: Date) =>
  new Intl.DateTimeFormat("es-DO", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

/** "Actualizado 11:40" o "Sin conexión · datos de las 11:40". */
export function updatedText(live: LiveInfo, prefix = "Actualizado") {
  const at = live.fetchedAt ? hhmm(live.fetchedAt) : "--:--";
  return live.offline ? `Sin conexión · datos de las ${at}` : `${prefix} ${at}`;
}

/** Hora actual, refrescada cada `ms`. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Reloj de la cabecera: se vuelve a dibujar solo él cada segundo, no todo el mural. */
export function Clock({ style }: { style?: CSSProperties }) {
  const now = useNow(1000);
  return <div style={style}>{hhmm(now)}</div>;
}

/** Línea de "hoy" del calendario: avanza con la jornada sin repintar el resto (se actualiza cada minuto). */
export function TodayLine({ col, atEnd, cols, left = 0 }: { col: number | null; atEnd: boolean; cols: number; left?: number }) {
  const now = useNow(60000);
  if (col === null) return null;
  return (
    <div style={{ position: "absolute", top: 0, bottom: 0, left, right: 0, pointerEvents: "none" }}>
      <div style={{ position: "absolute", top: 0, bottom: 0, left: pct(col + (atEnd ? 1 : dayFraction(now)), cols), width: 2, marginLeft: -1, background: TODAY_COLOR }} />
    </div>
  );
}

/** Fracción de la jornada (7:00–17:00) transcurrida, para la línea de "hoy" del calendario. */
export function dayFraction(now: Date) {
  const [h, m] = hhmm(now).split(":").map(Number);
  return Math.min(1, Math.max(0, (h * 60 + m - 7 * 60) / 600));
}

export const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(3)}%`;

export const SunLogo = ({ size, box, radius }: { size: number; box: number; radius: number }) => (
  <div style={{ width: box, height: box, borderRadius: radius, background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
    </svg>
  </div>
);

export const Flag = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#1F2A3D" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Prioridad" style={{ flexShrink: 0 }}>
    <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
  </svg>
);

export const ellipsis = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } as const;
