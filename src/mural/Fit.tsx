import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

// Texto que no cabe (MUR, AVI-03, MUR-06): se mide en su ancho real y se reparte en páginas por altura medida.
// Nada se estima por caracteres: el alto sale del propio navegador, con la misma tipografía que el render.

/** Un elemento con encabezado en negrita (proyecto, nombre) y cuerpo. `data` vuelve al render. */
export type Rich<T> = { head: string | null; body: string; data: T };
/** Trozo de un elemento. Si el cuerpo no cabe en una página se parte por palabras y el encabezado se repite. */
export type Piece<T> = { head: string | null; body: string; first: boolean; data: T };

export type FitOptions = {
  /** Alto disponible para una página, en píxeles del lienzo de 1920×1080. */
  maxH: number;
  /** Separación vertical entre trozos de una misma página. */
  gap?: number;
  /** Trozos por página como máximo (1 para ver un elemento cada vez). */
  maxPer?: number;
  /** Alto mínimo de un trozo (p. ej. una ficha de altura fija). */
  minH?: number;
  /** Lo que se suma a la altura medida (bordes, margen de redondeo). */
  pad?: number;
  /** Encabezado y cuerpo en bloques apilados (fichas) en vez de en línea (avisos). */
  stack?: boolean;
  /** Espacio a la izquierda y a la derecha que ocupan el punto, la bandera o el borde: el texto mide menos. */
  padL?: number;
  padR?: number;
  /** Espacio que ocupa un icono junto al encabezado: el encabezado mide menos. */
  headInset?: number;
  /** Peso del cuerpo según haya encabezado (mismo criterio que el render). */
  bodyWeight?: (hasHead: boolean) => number;
  /** Tipografía del texto. Debe ser la misma que la del render. */
  text: CSSProperties;
};

const words = (s: string) => s.split(/\s+/).filter(Boolean);

/**
 * Reparte los elementos en páginas de alto `maxH`, con `gap` entre trozos. Función pura: `measure` da el alto de un trozo.
 * Un elemento que no cabe entero se parte por palabras, en el mayor número de palabras que quepa en la página, salvo que
 * entero quepa en una página nueva: entonces pasa entero a la siguiente (no se parte un texto que cabe de una vez).
 * `measure` debe crecer con el texto (más palabras, no menos alto). Ningún trozo se pierde ni se repite.
 */
export function fitPieces<T>(
  items: readonly Rich<T>[],
  measure: (p: Piece<T>) => number,
  maxH: number,
  gap = 0,
  maxPer = Infinity,
): Piece<T>[][] {
  const pages: Piece<T>[][] = [];
  let cur: Piece<T>[] = [];
  let used = 0;
  const flush = () => {
    if (cur.length) pages.push(cur);
    cur = [];
    used = 0;
  };

  for (const it of items) {
    const w = words(it.body);
    const n = w.length;
    const piece = (from: number, to: number): Piece<T> => ({
      head: it.head,
      body: w.slice(from, to).join(" "),
      first: from === 0,
      data: it.data,
    });
    let from = 0;
    for (;;) {
      if (cur.length >= maxPer) flush();
      const base = cur.length ? used + gap : 0;
      const room = maxH - base;
      const fits = (to: number) => measure(piece(from, to)) <= room;
      // Mayor `to` que cabe: búsqueda binaria sobre el número de palabras (la altura crece con el texto).
      let to = from;
      if (fits(n)) to = n;
      else {
        let lo = from;
        let hi = n;
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1;
          if (fits(mid)) lo = mid;
          else hi = mid;
        }
        to = lo;
      }
      // Si el resto del elemento cabría entero en una página nueva, no se parte ahora: pasa a la siguiente.
      if (to < n && cur.length && measure(piece(from, n)) <= maxH) to = from;
      if (to === from) {
        // No cabe nada más en esta página: se pasa a otra. En una página vacía se fuerza al menos una palabra.
        if (cur.length) {
          flush();
          continue;
        }
        if (from < n) to = from + 1;
      }
      const p = piece(from, to);
      used = base + measure(p);
      cur.push(p);
      from = to;
      if (from >= n) break;
    }
  }
  flush();
  return pages;
}

const NO_PAGES: never[] = [];
export { NO_PAGES };

/**
 * Mide cada elemento con el mismo estilo que su render, en el ancho real del hueco, y devuelve las páginas.
 * `probe` va dentro del contenedor del hueco (relativo): está oculto y no ocupa sitio. Se vuelve a medir al
 * cambiar datos o tamaño, y cuando cargan las fuentes. Devuelve `null` hasta la primera medida.
 */
export function useFit<T>(items: readonly Rich<T>[], o: FitOptions): { pages: Piece<T>[][] | null; probe: ReactNode } {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<Piece<T>[][] | null>(null);
  const last = useRef("");
  const { maxH, gap = 0, maxPer, minH = 0, pad = 1, stack = false, padL = 0, padR = 0, headInset = 0, bodyWeight } = o;

  useLayoutEffect(() => {
    const bx = box.current;
    const el = inner.current;
    if (!bx || !el) return;
    let alive = true;
    const measure = (p: Piece<T>) => {
      el.replaceChildren();
      if (stack) {
        if (p.head) {
          const h = document.createElement("div");
          h.style.fontWeight = "800";
          h.style.paddingRight = `${headInset}px`;
          h.textContent = p.head;
          el.append(h);
        }
        if (p.body) {
          const b = document.createElement("div");
          b.textContent = p.body;
          el.append(b);
        }
      } else {
        if (p.head) {
          const s = document.createElement("span");
          s.style.fontWeight = "800";
          s.textContent = `${p.head} `;
          el.append(s);
        }
        if (bodyWeight) el.style.fontWeight = String(bodyWeight(!!p.head));
        el.append(p.body);
      }
      // +1 px: offsetHeight redondea a entero; el margen evita que una línea de más se salga de la página.
      return Math.max(minH, el.offsetHeight + pad);
    };
    const run = () => {
      if (!alive) return;
      const next = fitPieces(items, measure, maxH, gap, maxPer);
      const key = JSON.stringify(next);
      if (key !== last.current) {
        last.current = key;
        setPages(next);
      }
    };
    run();
    const ro = new ResizeObserver(run);
    ro.observe(bx);
    void document.fonts?.ready.then(run);
    return () => {
      alive = false;
      ro.disconnect();
    };
  }, [items, maxH, gap, maxPer, minH, pad, stack, padL, padR, headInset, bodyWeight]);

  const probe = (
    <div
      ref={box}
      aria-hidden
      style={{ position: "absolute", left: 0, right: 0, top: 0, visibility: "hidden", pointerEvents: "none", paddingLeft: padL, paddingRight: padR, boxSizing: "border-box" }}
    >
      <div ref={inner} style={{ ...o.text, overflowWrap: "anywhere" }} />
    </div>
  );
  return { pages, probe };
}
