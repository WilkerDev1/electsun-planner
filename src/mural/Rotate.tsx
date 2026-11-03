import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

// Rotación del mural (MUR-01, NF-04): lo que no cabe va en marquesina (una línea horizontal) o en páginas (listas y rejillas).
// Solo se anima con `transform` y `opacity`, y el cambio de página lo marca un temporizador por página, no un intervalo por fotograma.

/** Velocidad de la marquesina en píxeles del lienzo de 1920. */
export const SCROLL_PX_PER_S = 60;
/** Pausa al empezar cada vuelta de la marquesina. */
export const MARQUEE_PAUSE_S = 2;
/** Tiempo que se muestra cada página. */
export const PAGE_MS = 8000;
/** Con movimiento reducido las páginas cambian cada 10 s, sin animación (MUR, prefers-reduced-motion). */
export const REDUCED_PAGE_MS = 10000;
/** Duración del fundido y deslizamiento al entrar en una página. */
export const PAGE_FADE_MS = 400;

/** Divide en páginas de `perPage` elementos. Función pura: la usan el hook y las pruebas. */
export function paginate<T>(items: readonly T[], perPage: number): T[][] {
  const size = Math.max(1, Math.floor(perPage));
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size));
  return pages;
}

/** Índice de página válido para `count` páginas. Al llegar datos nuevos se conserva; si sobra, se queda en la última. */
export function clampIndex(index: number, count: number): number {
  return count <= 0 ? 0 : Math.min(Math.max(0, index), count - 1);
}

/** Página siguiente, en bucle. */
export function nextIndex(index: number, count: number): number {
  return count <= 1 ? 0 : (clampIndex(index, count) + 1) % count;
}

/**
 * Tiempos de la marquesina. Recorre una copia más la separación (`shift`) a `speed` px/s y, en cada vuelta,
 * espera `pauseS` al principio. `holdPct` es el tramo de la animación que pasa parado.
 */
export function marqueeTiming(contentPx: number, gapPx: number, speed = SCROLL_PX_PER_S, pauseS = MARQUEE_PAUSE_S) {
  const shift = contentPx + gapPx;
  const duration = pauseS + shift / speed;
  return { shift, duration, holdPct: (pauseS / duration) * 100 };
}

// ---------- Preferencias y ventana ----------

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

/** `true` si el sistema pide movimiento reducido. */
export const useReducedMotion = () => useMedia(REDUCED_QUERY);

/** `true` mientras la pestaña o ventana no está visible: entonces no se cambia de página. */
function useHidden(): boolean {
  const [hidden, setHidden] = useState(() => typeof document !== "undefined" && document.hidden);
  useEffect(() => {
    const on = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return hidden;
}

export type Pager<T> = { page: T[]; index: number; count: number };

/**
 * Páginas de `items` de a `perPage` con giro automático cada `intervalMs`.
 * Cambiar los datos no devuelve a la página 1: el índice se ajusta al nuevo número de páginas, y el temporizador
 * solo se reinicia cuando cambia la página o el número de páginas, no cuando llegan datos iguales.
 */
export function usePages<T>(items: readonly T[], perPage: number, intervalMs = PAGE_MS): Pager<T> {
  const pages = useMemo(() => paginate(items, perPage), [items, perPage]);
  const reduced = useReducedMotion();
  const hidden = useHidden();
  const count = pages.length;
  const [state, setState] = useState(0);
  const index = clampIndex(state, count);
  const ms = reduced ? REDUCED_PAGE_MS : intervalMs;

  useEffect(() => {
    if (count <= 1 || hidden) return;
    const t = setTimeout(() => setState((i) => nextIndex(i, count)), ms);
    return () => clearTimeout(t);
  }, [count, index, ms, hidden]);

  return { page: pages[index] ?? [], index, count };
}

// ---------- Páginas ----------

const PAGED_CSS = `@keyframes mural-page-in{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}.mural-page-in{animation:mural-page-in ${PAGE_FADE_MS}ms ease-out both}`;

/**
 * Muestra la página actual con fundido y deslizamiento corto. La página se identifica por su índice:
 * si cambian los datos sin cambiar de página, el nodo se conserva y no se vuelve a animar.
 */
export function Paged<T>({ pager, children, style }: { pager: Pager<T>; children: (page: T[], index: number) => ReactNode; style?: CSSProperties }) {
  const reduced = useReducedMotion();
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", ...style }}>
      <style>{PAGED_CSS}</style>
      <div key={pager.index} className={reduced ? undefined : "mural-page-in"} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {children(pager.page, pager.index)}
      </div>
    </div>
  );
}

/** Indicador "1/3", en gris y 22 px. No se pinta si solo hay una página. */
export function PageNumber({ index, count }: { index: number; count: number }) {
  if (count <= 1) return null;
  return (
    <span style={{ flexShrink: 0, fontSize: 22, fontWeight: 700, lineHeight: 1, color: "#667085", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
      {index + 1}/{count}
    </span>
  );
}

// ---------- Marquesina ----------

/**
 * Una línea horizontal. Si cabe, se queda quieta. Si no cabe, repite el contenido con una copia `aria-hidden`
 * separada por `gap` y lo desplaza de derecha a izquierda a 60 px/s, con una pausa de 2 s al empezar cada vuelta.
 * Con movimiento reducido no se desplaza: muestra un elemento cada vez, como las páginas.
 */
export function Marquee({ items, gap = 48, separator, style }: { items: ReactNode[]; gap?: number; separator?: ReactNode; style?: CSSProperties }) {
  const reduced = useReducedMotion();
  if (reduced) return <OneAtATime items={items} style={style} />;
  return <ScrollLine items={items} gap={gap} separator={separator} style={style} />;
}

function OneAtATime({ items, style }: { items: ReactNode[]; style?: CSSProperties }) {
  const pager = usePages(items, 1, REDUCED_PAGE_MS);
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", overflow: "hidden", ...style }}>
      <Paged pager={pager} style={{ flex: 1, justifyContent: "center" }}>
        {(page) => <div style={{ display: "flex", alignItems: "center", minWidth: 0 }}>{page}</div>}
      </Paged>
    </div>
  );
}

function ScrollLine({ items, gap, separator, style }: { items: ReactNode[]; gap: number; separator?: ReactNode; style?: CSSProperties }) {
  const id = "mq" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const outer = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLDivElement>(null);
  // Ancho de una copia cuando el contenido no cabe; 0 si cabe y se queda quieto.
  const [content, setContent] = useState(0);

  // offsetWidth no se ve afectado por el `transform` de ScaledCanvas: se mide en píxeles del lienzo.
  useLayoutEffect(() => {
    const o = outer.current;
    const f = first.current;
    if (!o || !f) return;
    const measure = () => setContent(f.offsetWidth > o.offsetWidth ? f.offsetWidth : 0);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(o);
    ro.observe(f);
    return () => ro.disconnect();
  }, []);

  const row = (copy?: boolean) => (
    <div ref={copy ? undefined : first} aria-hidden={copy || undefined} style={{ display: "flex", alignItems: "center", gap, flexShrink: 0 }}>
      {items.map((it, i) => (
        <Fragment key={i}>
          {it}
          {separator}
        </Fragment>
      ))}
    </div>
  );

  const t = content ? marqueeTiming(content, gap) : null;
  return (
    <div ref={outer} style={{ flex: 1, minWidth: 0, position: "relative", overflow: "hidden", display: "flex", alignItems: "center", ...style }}>
      {t && (
        <style>{`@keyframes ${id}{0%,${t.holdPct.toFixed(3)}%{transform:translateX(0)}100%{transform:translateX(-${t.shift}px)}}`}</style>
      )}
      <div style={{ display: "flex", alignItems: "center", gap, flexShrink: 0, width: "max-content", animation: t ? `${id} ${t.duration.toFixed(3)}s linear infinite` : undefined, willChange: t ? "transform" : undefined }}>
        {row()}
        {t && row(true)}
      </div>
    </div>
  );
}
