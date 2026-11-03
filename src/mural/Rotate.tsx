import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useFit, NO_PAGES, type FitOptions, type Piece, type Rich } from "./Fit";

// Rotación del mural (MUR-01, NF-04): lo que no cabe va en marquesina (una línea horizontal) o en páginas (listas y rejillas).
// Solo se anima con `transform` y `opacity`, y el cambio de página lo marca un temporizador por página, no un intervalo por fotograma.

/** Velocidad base de la marquesina en píxeles del lienzo de 1920. */
export const SCROLL_PX_PER_S = 60;
/** Tope de velocidad: por encima de esto el texto no se lee bien a 3–4 m. */
export const MAX_SCROLL_PX_PER_S = 90;
/** Una vuelta completa no debería tardar más de esto: si tardaría más a 60 px/s, se sube la velocidad (hasta el tope). */
export const MAX_CYCLE_S = 60;
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

/** Velocidad de la marquesina según lo que recorre: 60 px/s, o más (hasta 90) si una vuelta tardaría más de 60 s. */
export function marqueeSpeed(shift: number): number {
  return Math.min(MAX_SCROLL_PX_PER_S, Math.max(SCROLL_PX_PER_S, shift / MAX_CYCLE_S));
}

/**
 * Tiempos de la marquesina. Recorre una copia más la separación (`shift`) a `speed` px/s y, en cada vuelta,
 * espera `pauseS` al principio. `holdPct` es el tramo de la animación que pasa parado.
 */
export function marqueeTiming(contentPx: number, gapPx: number, speed = marqueeSpeed(contentPx + gapPx), pauseS = MARQUEE_PAUSE_S) {
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
    // Los navegadores antiguos de algunas TV solo tienen addListener.
    if (mq.addEventListener) mq.addEventListener("change", on);
    else mq.addListener(on);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", on);
      else mq.removeListener(on);
    };
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

  // Si la página guardada sobra (menos páginas que antes), se guarda la válida: así, si vuelven más páginas, no se salta ninguna.
  useEffect(() => {
    if (state !== index) setState(index);
  }, [state, index]);

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
    <span
      aria-label={`Página ${index + 1} de ${count}`}
      style={{ flexShrink: 0, fontSize: 22, fontWeight: 700, lineHeight: 1, color: "#667085", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}
    >
      {index + 1}/{count}
    </span>
  );
}

// ---------- Marquesina ----------

/**
 * Una línea horizontal. Si cabe, se queda quieta. Si no cabe, repite el contenido con una copia `aria-hidden`
 * separada por `gap` y lo desplaza de derecha a izquierda, con una pausa de 2 s al empezar cada vuelta.
 * Con movimiento reducido no se desplaza: muestra un trozo cada vez, medido para que quepa en `box.maxH`.
 */
export function Marquee<T>({
  items,
  render,
  gap = 48,
  separator,
  box,
  style,
}: {
  items: readonly Rich<T>[];
  render: (p: Piece<T>) => ReactNode;
  gap?: number;
  separator?: ReactNode;
  box: FitOptions;
  style?: CSSProperties;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <OneAtATime items={items} render={render} box={box} style={style} />;
  return <ScrollLine items={items} render={render} gap={gap} separator={separator} style={style} />;
}

function OneAtATime<T>({ items, render, box, style }: { items: readonly Rich<T>[]; render: (p: Piece<T>) => ReactNode; box: FitOptions; style?: CSSProperties }) {
  const { pages, probe } = useFit(items, { ...box, maxPer: 1, gap: 0 });
  const pager = usePages(pages ?? NO_PAGES, 1, REDUCED_PAGE_MS);
  return (
    <div style={{ flex: 1, minWidth: 0, position: "relative", display: "flex", alignItems: "center", overflow: "hidden", ...style }}>
      {probe}
      <Paged pager={pager}>
        {(page) => (
          <div style={{ flex: 1, minHeight: 0, width: "100%", display: "flex", alignItems: "center" }}>
            {(page[0] ?? []).map((p, i) => (
              <div key={i} style={{ width: "100%" }}>
                {render(p)}
              </div>
            ))}
          </div>
        )}
      </Paged>
    </div>
  );
}

function ScrollLine<T>({ items, render, gap, separator, style }: { items: readonly Rich<T>[]; render: (p: Piece<T>) => ReactNode; gap: number; separator?: ReactNode; style?: CSSProperties }) {
  const id = "mq" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const outer = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLDivElement>(null);
  // Ancho de una copia cuando el contenido no cabe; 0 si cabe y se queda quieto.
  const [content, setContent] = useState(0);
  const whole = useMemo(() => items.map((it): Piece<T> => ({ head: it.head, body: it.body, first: true, data: it.data })), [items]);

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

  const t = content ? marqueeTiming(content, gap) : null;
  // Cada elemento lleva su separador detrás, también el último: así la copia empieza tras un separador.
  // Si todo cabe, el último separador de la única copia se oculta sin quitarle sitio (su ancho mide el recorrido).
  const row = (copy: boolean) => (
    <div ref={copy ? undefined : first} aria-hidden={copy || undefined} style={{ display: "flex", alignItems: "center", gap, flexShrink: 0, whiteSpace: "nowrap" }}>
      {whole.map((p, i) => (
        <Fragment key={i}>
          {render(p)}
          {separator && (
            <span style={{ display: "flex", flexShrink: 0, visibility: !copy && !t && i === whole.length - 1 ? "hidden" : undefined }}>{separator}</span>
          )}
        </Fragment>
      ))}
    </div>
  );

  return (
    <div ref={outer} style={{ flex: 1, minWidth: 0, position: "relative", overflow: "hidden", display: "flex", alignItems: "center", ...style }}>
      {t && (
        <style>{`@keyframes ${id}{0%,${t.holdPct.toFixed(3)}%{transform:translateX(0)}100%{transform:translateX(-${t.shift}px)}}`}</style>
      )}
      <div style={{ display: "flex", alignItems: "center", gap, flexShrink: 0, width: "max-content", animation: t ? `${id} ${t.duration.toFixed(3)}s linear infinite` : undefined, willChange: t ? "transform" : undefined }}>
        {row(false)}
        {t && row(true)}
      </div>
    </div>
  );
}
