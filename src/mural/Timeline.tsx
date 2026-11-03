import { useMemo, type CSSProperties } from "react";
import { longDate } from "../../shared/domain";
import { shortName, type MuralModel, type NoticeLine, type TimelineGroup, type TimelineRow, type WaitingItem } from "../../shared/mural-model";
import { ACCENT, Clock, FONT, Flag, SunLogo, TODAY_COLOR, ellipsis, pct, updatedText, type ScreenProps } from "./shared";
import { PatternDot } from "./Mark";
import { PageNumber, Paged, usePages } from "./Rotate";

// Diseño "timeline por fila" (design/v4/V4Mural.dc.html, MUR-08): una fila por proyecto activo con su barra.
// Lo que no cabe pasa de página (Rotate.tsx): filas por grupo, fichas de "Esperando fecha" y avisos de la derecha.

const COLS = "72px minmax(0, 1fr) 200px 1120px";
const GRID_PX = 1120;
const GAP = 20;
/** Pie: "Esperando fecha" y avisos. Caben 6 fichas (3 × 2) y hasta 4 líneas de avisos. */
const FOOTER_H = 164;
/** Alto libre para las filas: 1000 de lienzo − cabecera 88 − pie 164 − separaciones 40 − relleno 28 − encabezado 66 − indicador 30. */
const ROWS_AREA = 584;
const GROUP_LABEL = 40;
/** Por debajo de este factor las filas no se encogen más: se pasa de página. */
const MIN_SCALE = 0.9;
const SIZE = {
  obra: { row: 80, bar: 40, name: 30, badge: 56 },
  prog: { row: 64, bar: 30, name: 26, badge: 42 },
} as const;
const CARD_H = 60;
const CARDS_PER_PAGE = 6;
/** Avisos por página: líneas de ~44 caracteres en el cuadro de la derecha, como mucho 4 por página. */
const NOTICE_LINES = 4;
const NOTICE_CHARS = 44;

export function Timeline({ view, live }: ScreenProps) {
  const { model, settings } = view;
  const footer = (settings.show_waiting && model.waiting.items.length > 0) || model.notices.length > 0;
  const pages = useMemo(() => planTimeline(model.timeline.groups, ROWS_AREA + (footer ? 0 : FOOTER_H + GAP)), [model.timeline.groups, footer]);
  return (
    <div
      style={{
        width: 1920,
        height: 1080,
        boxSizing: "border-box",
        padding: "40px 48px",
        background: "#F4F5F7",
        color: "#1B1F27",
        fontFamily: FONT,
        fontVariantNumeric: "tabular-nums",
        display: "flex",
        flexDirection: "column",
        gap: GAP,
        overflow: "hidden",
      }}
    >
      <Header model={model} showClock={settings.show_clock} live={live} today={view.today} />
      <Board model={model} pages={pages} />
      {footer && <Footer model={model} show={settings.show_waiting} />}
    </div>
  );
}

export type Fitted = { group: TimelineGroup; rows: TimelineRow[]; scale: number };

/**
 * Reparte las filas en el área disponible. Si todo cabe encogiendo hasta `MIN_SCALE`, va en una sola página.
 * Si no cabe, se pagina a tamaño natural: cada página lleva grupos enteros o cortados con su etiqueta repetida,
 * y ninguna fila se oculta. Función pura (la usa el mural y se prueba aparte).
 */
export function planTimeline(groups: TimelineGroup[], area: number): Fitted[][] {
  const used = groups.filter((g) => g.rows.length > 0);
  if (!used.length) return [];
  const labels = used.length * GROUP_LABEL;
  const natural = used.reduce((s, g) => s + g.rows.length * SIZE[g.key].row, 0);
  const fit = (area - labels) / Math.max(natural, 1);
  if (fit >= MIN_SCALE) return [used.map((g) => ({ group: g, rows: g.rows, scale: Math.min(1, fit) }))];

  const pages: Fitted[][] = [];
  let page: Fitted[] = [];
  let height = 0;
  for (const g of used) {
    const h = SIZE[g.key].row;
    let section: Fitted | undefined;
    for (const row of g.rows) {
      const need = h + (section ? 0 : GROUP_LABEL);
      if (height + need > area && page.length) {
        pages.push(page);
        page = [];
        height = 0;
        section = undefined;
      }
      if (!section) {
        section = { group: g, rows: [], scale: 1 };
        page.push(section);
        height += GROUP_LABEL;
      }
      section.rows.push(row);
      height += h;
    }
  }
  if (page.length) pages.push(page);
  return pages;
}

/**
 * Agrupa los avisos en páginas que no cortan ninguno a la mitad: cada página suma como mucho `NOTICE_LINES` líneas
 * estimadas. Un aviso más largo que eso va solo en su página.
 */
export function packNotices(lines: NoticeLine[]): NoticeLine[][] {
  const pages: NoticeLine[][] = [];
  let cur: NoticeLine[] = [];
  let used = 0;
  for (const n of lines) {
    const len = (n.project ? n.project.length + 1 : 0) + n.text.length;
    const need = Math.max(1, Math.ceil(len / NOTICE_CHARS));
    if (cur.length && used + need > NOTICE_LINES) {
      pages.push(cur);
      cur = [];
      used = 0;
    }
    cur.push(n);
    used += need;
  }
  if (cur.length) pages.push(cur);
  return pages;
}

function Header({ model, showClock, live, today }: { model: MuralModel; showClock: boolean; live: ScreenProps["live"]; today: string }) {
  const c = model.timeline.counts;
  const [obra, prog] = model.timeline.groups;
  return (
    <header style={{ height: 88, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <SunLogo box={64} size={36} radius={18} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.05 }}>Proyectos</span>
          <span style={{ display: "flex", gap: 22, fontSize: 22, fontWeight: 700 }}>
            <span style={{ color: obra.fg }}>{c.obra} en obra</span>
            <span style={{ color: prog.fg }}>{c.prog} {c.prog === 1 ? "programado" : "programados"}</span>
            <span style={{ color: "#3F4859" }}>{c.waiting} esperando fecha</span>
          </span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
          {showClock && <span style={{ fontSize: 24, fontWeight: 700 }}>{longDate(today)}</span>}
          <span style={{ fontSize: 22, fontWeight: 500, color: live.offline ? "#B54708" : "#5F6675" }}>{updatedText(live, "Actualizado a las")}</span>
        </div>
        {showClock && <Clock style={{ fontSize: 68, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1 }} />}
      </div>
    </header>
  );
}

function Board({ model, pages }: { model: MuralModel; pages: Fitted[][] }) {
  const t = model.timeline;
  const { cols, weeks } = t;
  const head: CSSProperties = { fontSize: 22, fontWeight: 700, color: "#5F6675", paddingBottom: 10 };
  const todayAt = t.todayCol === null ? null : (t.todayCol + (t.todayAtEnd ? 1 : 0.5)) / cols;
  const pager = usePages(pages, 1);
  const empty = pages.length === 0;
  return (
    <section aria-label="Proyectos y timeline" style={{ flex: 1, minHeight: 0, background: "#FFFFFF", borderRadius: 24, padding: "14px 24px", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
      <div style={{ height: 66, display: "grid", gridTemplateColumns: COLS, columnGap: 16, alignItems: "end", borderBottom: "2px solid #E4E6EB" }}>
        <span style={head}>Equipo</span>
        <span style={head}>Proyecto</span>
        <span style={head}>Cuándo</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}>
            {t.weekLabels.map((l, i) => (
              <span key={l} style={{ fontSize: 22, fontWeight: i === 0 ? 800 : 700, color: i === 0 ? "#1B1F27" : "#5F6675", paddingLeft: 8, borderLeft: i ? "2px solid #D3D6DD" : 0 }}>{l}</span>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, paddingBottom: 6 }}>
            {t.days.map((d, i) => (
              <span key={i} style={{ textAlign: "center", fontSize: 22, fontWeight: d.today ? 800 : 600, color: d.today ? "#FFFFFF" : d.saturday ? "#5F6675" : "#3F4859", background: d.today ? TODAY_COLOR : "transparent", borderRadius: 8, margin: "0 2px" }}>{d.n}</span>
            ))}
          </div>
        </div>
      </div>
      {empty ? (
        <p style={{ margin: 0, padding: "40px 8px", fontSize: 26, fontWeight: 600, color: "#5F6675" }}>No hay instalaciones en obra ni programadas por ahora.</p>
      ) : (
        <Paged pager={pager}>
          {(page) => (
            <>
              {(page[0] ?? []).map((f) => (
                <GroupRows key={f.group.key} f={f} cols={cols} weeks={weeks} todayCol={t.todayCol} todayAt={todayAt} />
              ))}
            </>
          )}
        </Paged>
      )}
      {pager.count > 1 && (
        <div style={{ height: 30, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
          <PageNumber index={pager.index} count={pager.count} />
        </div>
      )}
    </section>
  );
}

function GroupRows({ f, cols, weeks, todayCol, todayAt }: { f: Fitted; cols: number; weeks: number; todayCol: number | null; todayAt: number | null }) {
  const g = f.group;
  const size = SIZE[g.key];
  const rowH = Math.round(size.row * f.scale);
  const barH = Math.round(size.bar * Math.min(1, f.scale + 0.15));
  const badgeH = Math.min(size.badge, rowH - 8);
  const colPct = 100 / cols;
  const grid = `repeating-linear-gradient(to right, transparent 0, transparent calc(${colPct}% - 1px), #F0F1F4 calc(${colPct}% - 1px), #F0F1F4 ${colPct}%)`;
  return (
    <>
      <div style={{ height: GROUP_LABEL, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 12, height: 12, borderRadius: 4, background: g.solid }} />
        <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "0.14em", color: g.fg }}>{g.label}</span>
      </div>
      {f.rows.map((r) => (
        <div key={r.id} style={{ height: rowH, display: "grid", gridTemplateColumns: COLS, columnGap: 16, alignItems: "center", borderTop: "1px solid #EEF0F3" }}>
          <span
            style={{
              width: 60,
              height: badgeH,
              boxSizing: "border-box",
              borderRadius: 14,
              background: g.key === "obra" ? "#1F2A3D" : "#FFFFFF",
              border: "2px solid #1F2A3D",
              color: g.key === "obra" ? "#FFFFFF" : "#1F2A3D",
              fontSize: 24,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {r.team}
          </span>
          <span style={{ display: "flex", flexDirection: "column", gap: 0, minWidth: 0, lineHeight: 1.15 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <span style={{ fontSize: size.name, fontWeight: 800, ...ellipsis }}>{r.name}</span>
              {r.priority && <Flag size={24} />}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 22, fontWeight: 600, color: "#5F6675", ...ellipsis }}>
              <PatternDot color={r.dot} pattern={r.pattern} size={20} />
              <span style={ellipsis}>{r.place}</span>
            </span>
          </span>
          <span style={{ display: "flex", flexDirection: "column", gap: 0, minWidth: 0, lineHeight: 1.15 }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: r.late ? "#B54708" : g.key === "obra" ? "#1B1F27" : g.fg, whiteSpace: "nowrap" }}>{r.when}</span>
            <span style={{ fontSize: 22, fontWeight: 600, color: "#5F6675", whiteSpace: "nowrap" }}>{r.whenSub}</span>
          </span>
          <div style={{ height: "100%", position: "relative", width: GRID_PX, background: grid }}>
            {todayCol !== null && <div style={{ position: "absolute", top: 0, bottom: 0, left: pct(todayCol, cols), width: pct(1, cols), background: "rgba(194,65,12,0.06)" }} />}
            {Array.from({ length: weeks - 1 }, (_, i) => (
              <div key={i} style={{ position: "absolute", top: 0, bottom: 0, left: pct(i + 1, weeks), width: 2, background: "#D3D6DD" }} />
            ))}
            {r.bar.span > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  transform: "translateY(-50%)",
                  height: barH,
                  left: pct(r.bar.col, cols),
                  width: pct(r.bar.span, cols),
                  boxSizing: "border-box",
                  borderRadius: `${r.bar.clipStart ? 0 : 10}px ${r.bar.clipEnd ? 0 : 10}px ${r.bar.clipEnd ? 0 : 10}px ${r.bar.clipStart ? 0 : 10}px`,
                  background: g.solid,
                  display: "flex",
                  alignItems: "center",
                  padding: "0 12px",
                  overflow: "hidden",
                }}
              >
                {(r.bar.span * GRID_PX) / cols >= 150 && <span style={{ fontSize: 22, fontWeight: 800, color: "#FFFFFF", whiteSpace: "nowrap" }}>{r.bar.text}</span>}
              </div>
            )}
            {r.over && (
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  transform: "translateY(-50%)",
                  height: barH,
                  left: pct(r.over.col, cols),
                  width: pct(r.over.span, cols),
                  boxSizing: "border-box",
                  background: "repeating-linear-gradient(135deg, #FFF4DB 0, #FFF4DB 6px, #FFFAEB 6px, #FFFAEB 12px)",
                  border: "2px dashed #F59E0B",
                  borderLeft: 0,
                  borderRadius: "0 10px 10px 0",
                }}
              />
            )}
            {todayAt !== null && <div style={{ position: "absolute", top: 0, bottom: 0, left: `${(todayAt * 100).toFixed(3)}%`, width: 2, marginLeft: -1, background: TODAY_COLOR }} />}
          </div>
        </div>
      ))}
    </>
  );
}

const CHIP = { pause: { bg: "#FDECF1", fg: "#A11C47" }, other: { bg: "#EFF1F5", fg: "#1B1F27" } } as const;

function Footer({ model, show }: { model: MuralModel; show: boolean }) {
  const w = model.waiting;
  // Los pausados van al final, como en el artboard.
  const items: WaitingItem[] = [...w.items.filter((i) => i.tone !== "pause"), ...w.items.filter((i) => i.tone === "pause")];
  const cards = usePages(items, CARDS_PER_PAGE);
  const lines = model.notices;
  const linePages = useMemo(() => packNotices(lines), [lines]);
  const notes = usePages(linePages, 1);
  return (
    <footer style={{ height: FOOTER_H, flexShrink: 0, display: "flex", gap: 20 }}>
      {show && (
        <div style={{ flex: 1.6, minWidth: 0, background: "#FFFFFF", borderRadius: 22, padding: "0 24px", display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "0.12em", color: "#3F4859" }}>ESPERANDO FECHA</span>
            <span style={{ fontSize: 22, fontWeight: 600, color: "#5F6675" }}>vendidos sin programar</span>
            {cards.count > 1 && <PageNumber index={cards.index} count={cards.count} />}
            {w.more > 0 && <span style={{ fontSize: 22, fontWeight: 700, color: "#5F6675" }}>+{w.more} más</span>}
          </span>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            {items.length === 0 ? (
              <span style={{ fontSize: 22, fontWeight: 600, color: "#5F6675" }}>Ninguno por ahora</span>
            ) : (
              <Paged pager={cards}>
                {(page) => (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gridTemplateRows: `repeat(2, ${CARD_H}px)`, gap: 8, alignContent: "center" }}>
                    {page.map((b) => (
                      <WaitCard key={b.id} b={b} />
                    ))}
                  </div>
                )}
              </Paged>
            )}
          </div>
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0, background: "#FFFFFF", borderRadius: 22, padding: "10px 24px", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
        {lines.length === 0 ? (
          <span style={{ fontSize: 22, fontWeight: 600, color: "#5F6675" }}>Sin avisos por ahora</span>
        ) : (
          <Paged pager={notes}>
            {(page) => (
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 6, flex: 1 }}>
                {(page[0] ?? []).map((n, i) => (
                  <NoticeText key={i} n={n} />
                ))}
              </div>
            )}
          </Paged>
        )}
        {(notes.count > 1 || model.noticesMore > 0) && (
          <div style={{ height: 24, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, fontSize: 22, fontWeight: 700, color: "#5F6675" }}>
            {model.noticesMore > 0 && <span>+{model.noticesMore} más</span>}
            <PageNumber index={notes.index} count={notes.count} />
          </div>
        )}
      </div>
    </footer>
  );
}

/** Una ficha de "Esperando fecha": nombre y días (o "en pausa") bien separados, bandera visible. */
function WaitCard({ b }: { b: WaitingItem }) {
  const c = b.tone === "pause" ? CHIP.pause : CHIP.other;
  const sub = b.tone === "pause" ? "en pausa" : b.days !== null ? `${b.days} ${b.days === 1 ? "día" : "días"}` : "";
  return (
    <div style={{ height: CARD_H, minWidth: 0, boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "center", gap: 2, padding: "0 14px", borderRadius: 12, background: c.bg, color: c.fg, lineHeight: 1.15 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        {b.priority && <Flag size={22} />}
        <span style={{ fontSize: 22, fontWeight: 800, ...ellipsis }}>{shortName(b.name)}</span>
      </span>
      <span style={{ fontSize: 22, fontWeight: b.tone === "pause" ? 800 : 600, opacity: b.tone === "pause" ? 1 : 0.85, ...ellipsis }}>{sub}</span>
    </div>
  );
}

/** Un aviso completo: el proyecto en negrita y el texto entero, con ajuste de línea y sin elipsis (AVI-03). */
function NoticeText({ n }: { n: NoticeLine }) {
  return (
    <span style={{ display: "flex", alignItems: "flex-start", gap: 12, fontSize: 22, lineHeight: 1.2, color: n.project ? "#3F4859" : "#1B1F27", fontWeight: n.project ? 600 : 800 }}>
      <span style={{ flexShrink: 0, width: 10, height: 10, marginTop: 7, borderRadius: "50%", background: ACCENT }} />
      <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
        {n.project && <span style={{ fontWeight: 800, color: "#1B1F27" }}>{n.project} </span>}
        {n.text}
      </span>
    </span>
  );
}
