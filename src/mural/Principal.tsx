import type { CSSProperties } from "react";
import { longDate } from "../../shared/domain";
import type { ActiveRow, CalBar, CalTeam, KpiTone, MuralModel, WaitingItem } from "../../shared/mural-model";
import { ACCENT, Clock, FONT, Flag, SunLogo, TODAY_COLOR, TodayLine, ellipsis, pct, updatedText, type ScreenProps } from "./shared";
import { MuralMark, PatternDot } from "./Mark";
import { Marquee, PageNumber, Paged, usePages } from "./Rotate";

// Diseño principal del mural (design/v4/V4MuralPrincipal.dc.html): tabla de activos + calendario por equipo.
// Todo el lienzo mide 1920×1080 (MUR-01) y todo el texto mide 22 px o más (MUR-01, NF-04); los números llevan tabular-nums.
// Reparto vertical del lienzo: 1080 − relleno 56 − cabecera 72 − indicadores 88 − pie 72 − 3 separaciones de 20 = 732 px de contenido.
// Lo que no cabe rota (Rotate.tsx): las listas pasan de página y las líneas horizontales van en marquesina.

const KPI_COLOR: Record<KpiTone, string> = { ok: "#157F3D", indigo: "#3B4FC4", slate: "#475467", brand: "#C2410C" };
const GAP = 20;
const CONTENT_H = 732;
/** Filas de "Instalaciones activas" por página. */
const ACTIVE_ROWS = 7;
const ACTIVE_ROW_H = 80;
const LIST_W = 1080;
const CAL_ROW_MAX = 40;
const CAL_ROW_MIN = 30;
/** Alto fijo del calendario fuera de las filas: relleno, título, leyenda y días de la semana. */
const CAL_CHROME = 168;
const TEAM_PAD = 13;
/** Tarjeta de "Por programar": dos líneas, nombre arriba y motivo abajo. */
const CHIP_H = 56;
const CHIP_GAP = 6;
const METER_H = 42;

const card: CSSProperties = { background: "#FFFFFF", border: "1px solid #E6E8EC", borderRadius: 20, boxSizing: "border-box" };
const COLS = "minmax(0, 1fr) 170px 80px 150px 220px";

/** Tarjetas por página: con medidor caben dos, para dejar sitio a su línea. */
const chipsPerPage = (meterShown: boolean) => (meterShown ? 2 : 3);

/** Alto fijo de "Por programar": una página completa. Así el calendario no cambia de tamaño al rotar. */
function waitingHeight(model: MuralModel, waitingShown: boolean) {
  const meterShown = model.meter.items.length > 0;
  if (!waitingShown && !meterShown) return 0;
  let h = 28; // relleno de la tarjeta, 14 arriba y abajo
  if (waitingShown) {
    const shownN = Math.min(chipsPerPage(meterShown), model.waiting.items.length);
    const listH = shownN ? shownN * CHIP_H + (shownN - 1) * CHIP_GAP : 30;
    h += 34 + 8 + listH;
  }
  if (meterShown) h += (waitingShown ? 8 : 0) + METER_H;
  return h;
}

export function Principal({ view, live }: ScreenProps) {
  const { model, settings } = view;
  const waitingShown = settings.show_waiting;
  const waitH = waitingHeight(model, waitingShown);
  return (
    <div
      style={{
        width: 1920,
        height: 1080,
        boxSizing: "border-box",
        padding: "28px 40px",
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
      <style>{`@keyframes mural-pulse{0%{box-shadow:0 0 0 0 rgba(22,163,74,.45)}100%{box-shadow:0 0 0 10px rgba(22,163,74,0)}}.mural-pulse{animation:mural-pulse 2s ease-out infinite}`}</style>
      <Header model={model} showClock={settings.show_clock} today={view.today} />
      <Kpis model={model} />
      <div style={{ height: CONTENT_H, flexShrink: 0, display: "flex", gap: 24 }}>
        <ActiveList model={model} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: GAP }}>
          <Calendar model={model} bottomH={waitH} />
          {waitH > 0 && <Waiting model={model} show={waitingShown} height={waitH} />}
        </div>
      </div>
      <Footer model={model} live={live} />
    </div>
  );
}

function Header({ model, showClock, today }: { model: MuralModel; showClock: boolean; today: string }) {
  return (
    <header style={{ height: 72, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <SunLogo box={60} size={32} radius={16} />
        <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
          <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1 }}>Proyectos</div>
          <div style={{ fontSize: 22, color: "#667085", fontWeight: 500 }}>{model.subtitle}</div>
        </div>
      </div>
      {showClock && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
          <span style={{ fontSize: 22, color: "#667085", fontWeight: 500 }}>{longDate(today)}</span>
          <Clock style={{ fontSize: 52, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }} />
        </div>
      )}
    </header>
  );
}

function Kpis({ model }: { model: MuralModel }) {
  return (
    <div style={{ height: 88, flexShrink: 0, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16 }}>
      {model.kpis.map((k) => (
        <div key={k.key} style={{ background: "#FFFFFF", border: "1px solid #E6E8EC", borderRadius: 16, padding: "0 20px", display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
          <span style={{ fontSize: 48, fontWeight: 800, lineHeight: 1, color: KPI_COLOR[k.tone] }}>{k.n}</span>
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0, lineHeight: 1.2 }}>
            <span style={{ fontSize: 22, fontWeight: 700, ...ellipsis }}>{k.label}</span>
            <span style={{ fontSize: 22, color: "#667085", ...ellipsis }}>{k.sub}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ActiveList({ model }: { model: MuralModel }) {
  const rows = model.active.rows;
  const pager = usePages(rows, ACTIVE_ROWS);
  return (
    <section aria-label="Instalaciones activas" style={{ ...card, width: LIST_W, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ height: 60, flexShrink: 0, padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #EEF0F3" }}>
        <span style={{ fontSize: 28, fontWeight: 800 }}>Instalaciones activas</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: "#157F3D", background: "#E7F7EE", borderRadius: 999, padding: "4px 14px" }}>En obra · {model.active.nObra}</span>
          <span style={{ fontSize: 22, fontWeight: 700, color: "#3B4FC4", background: "#EEF2FF", borderRadius: 999, padding: "4px 14px" }}>Programados · {model.active.nProg}</span>
          <span style={{ marginLeft: 6 }}>
            <PageNumber index={pager.index} count={pager.count} />
          </span>
        </div>
      </div>
      <div style={{ height: 40, flexShrink: 0, padding: "0 24px", display: "grid", gridTemplateColumns: COLS, columnGap: 12, alignItems: "center", background: "#F9FAFB", borderBottom: "1px solid #EEF0F3", fontSize: 22, fontWeight: 700, color: "#667085" }}>
        <span>Proyecto</span>
        <span>Estado</span>
        <span>Equipo</span>
        <span>Fechas</span>
        <span>Avance</span>
      </div>
      {rows.length === 0 ? (
        <p style={{ margin: 0, padding: "40px 24px", fontSize: 26, fontWeight: 600, color: "#667085" }}>No hay instalaciones en obra ni programadas por ahora.</p>
      ) : (
        <Paged pager={pager}>{(page) => page.map((r) => <ActiveItem key={r.id} r={r} />)}</Paged>
      )}
    </section>
  );
}

function ActiveItem({ r }: { r: ActiveRow }) {
  const late = (r.progress?.late ?? 0) > 0;
  const sub = [r.company.name, r.place, r.kwp ? `${r.kwp} kWp` : ""].filter(Boolean).join(" · ");
  return (
    <div style={{ height: ACTIVE_ROW_H, flexShrink: 0, padding: "0 24px", display: "grid", gridTemplateColumns: COLS, columnGap: 12, alignItems: "center", borderBottom: "1px solid #F0F1F4", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <MuralMark company={r.company} size={46} />
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1, lineHeight: 1.15 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 28, fontWeight: 700, ...ellipsis }}>{r.name}</span>
            {r.priority && <Flag size={24} />}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            {r.note && (
              <span style={{ flexShrink: 0, fontSize: 22, fontWeight: 700, color: "#9A3412", background: "#FFF1E7", borderRadius: 6, padding: "0 8px" }}>{r.note}</span>
            )}
            <span style={{ fontSize: 22, color: "#667085", ...ellipsis }}>{sub}</span>
          </div>
        </div>
      </div>
      <div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 22, fontWeight: 700, color: r.status.fg, background: r.status.bg, borderRadius: 8, padding: "4px 10px" }}>
          <span className={r.kind === "en_obra" ? "mural-pulse" : undefined} style={{ width: 8, height: 8, flexShrink: 0, borderRadius: "50%", background: r.status.fg }} />
          {r.status.name}
        </span>
      </div>
      <div>
        {r.team ? (
          <span title={r.team.name} style={{ display: "inline-flex", minWidth: 44, height: 34, padding: "0 8px", boxSizing: "border-box", borderRadius: 8, background: "#1B1F27", color: "#FFFFFF", fontSize: 22, fontWeight: 800, alignItems: "center", justifyContent: "center" }}>{r.team.code}</span>
        ) : (
          <span style={{ fontSize: 22, fontWeight: 600, color: "#667085" }}>—</span>
        )}
      </div>
      <span style={{ fontSize: 22, fontWeight: 600, color: "#344054", lineHeight: 1.15 }}>{r.dates}</span>
      {r.progress ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, lineHeight: 1.15 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: late ? "#B54708" : "#157F3D", ...ellipsis }}>{r.progress.text}</span>
          <div style={{ height: 8, borderRadius: 4, background: "#EAECF0", overflow: "hidden" }}>
            <div style={{ height: 8, borderRadius: 4, background: late ? "#F59E0B" : "#16A34A", width: `${Math.round(r.progress.ratio * 100)}%` }} />
          </div>
          <span style={{ fontSize: 22, fontWeight: 600, color: "#667085", ...ellipsis }}>{r.progress.endText}</span>
        </div>
      ) : (
        <span style={{ fontSize: 22, fontWeight: 600, color: "#3B4FC4", lineHeight: 1.15 }}>{r.countdown}</span>
      )}
    </div>
  );
}

const TEAM_COL = 56;
/** Con 22 px solo cabe una letra por día: L M X J V S. */
const WEEKDAY: Record<string, string> = { "MIÉ": "X" };

function Calendar({ model, bottomH }: { model: MuralModel; bottomH: number }) {
  const cal = model.calendar;
  const { cols } = cal;
  const rows = cal.teams.reduce((n, t) => n + Math.max(1, t.bars.length), 0);
  const avail = CONTENT_H - (bottomH > 0 ? bottomH + GAP : 0) - CAL_CHROME - cal.teams.length * TEAM_PAD;
  const rowH = Math.max(CAL_ROW_MIN, Math.min(CAL_ROW_MAX, Math.floor(avail / Math.max(rows, 1))));
  return (
    <section aria-label="Calendario por equipo" style={{ ...card, flex: 1, minHeight: 0, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 6, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, lineHeight: 1.2 }}>
        <span style={{ fontSize: 28, fontWeight: 800, whiteSpace: "nowrap" }}>Calendario por equipo</span>
        <span style={{ fontSize: 22, color: "#667085", fontWeight: 500, ...ellipsis }}>{cal.rangeLabel}</span>
      </div>
      <Legend />

      <div style={{ display: "grid", gridTemplateColumns: `${TEAM_COL}px minmax(0, 1fr)` }}>
        <div />
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, borderBottom: "1px solid #EAECF0", paddingBottom: 6 }}>
          {cal.days.map((d) => (
            <div key={d.iso} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, borderLeft: d.weekStart ? "2px dashed #D0D5DD" : 0 }}>
              <span style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1, color: d.today ? TODAY_COLOR : "#667085" }}>{WEEKDAY[d.label] ?? d.label.slice(0, 1)}</span>
              <span style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, letterSpacing: cols > 18 ? "-0.08em" : "-0.02em", fontVariantNumeric: "proportional-nums", color: d.today ? "#FFFFFF" : d.saturday ? "#667085" : "#1B1F27", background: d.today ? TODAY_COLOR : "transparent", borderRadius: 8, width: "100%", maxWidth: 40, height: 30, display: "flex", alignItems: "center", justifyContent: "center" }}>{d.n}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, bottom: 0, left: TEAM_COL, right: 0, display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {cal.days.map((d, i) => (
            <div key={d.iso} style={{ borderLeft: d.weekStart ? "2px dashed #D0D5DD" : i === 0 ? 0 : "1px solid #F0F1F4", background: d.today ? "rgba(194,65,12,0.07)" : d.saturday ? "#FAFAFB" : "transparent" }} />
          ))}
        </div>
        <TodayLine col={cal.todayCol} atEnd={cal.todayAtEnd} cols={cols} left={TEAM_COL} />
        {cal.teams.map((t) => (
          <TeamRows key={t.id} team={t} cols={cols} rowH={rowH} />
        ))}
      </div>
    </section>
  );
}

function Legend() {
  const item: CSSProperties = { display: "flex", alignItems: "center", gap: 6 };
  const chip: CSSProperties = { width: 18, height: 12, boxSizing: "border-box", borderRadius: 4 };
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 22, fontWeight: 600, color: "#475467", whiteSpace: "nowrap", lineHeight: 1.2 }}>
      <span style={item}><span style={{ ...chip, background: "linear-gradient(to right, #A6E0BD 50%, #DCF3E5 50%)", border: "1.5px solid #16A34A" }} />En obra</span>
      <span style={item}><span style={{ ...chip, background: "#E9EDFF", border: "1.5px solid #4F63D8" }} />Programado</span>
      <span style={item}><span style={{ width: 3, height: 18, background: TODAY_COLOR }} />Hoy</span>
      <span style={item}><span style={{ ...chip, background: "#FFFAEB", border: "1.5px dashed #F59E0B" }} />Atraso</span>
    </span>
  );
}

function TeamRows({ team, cols, rowH }: { team: CalTeam; cols: number; rowH: number }) {
  return (
    <div style={{ position: "relative", display: "grid", gridTemplateColumns: `${TEAM_COL}px minmax(0, 1fr)`, padding: "6px 0", borderBottom: "1px solid #EEF0F3" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", paddingTop: 2 }}>
        <span style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1, color: "#FFFFFF", background: "#1B1F27", borderRadius: 6, padding: "2px 8px" }}>{team.code}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {team.bars.length === 0 && <div style={{ height: rowH }} />}
        {team.bars.map((b) => (
          <div key={b.id} style={{ height: rowH, position: "relative" }}>
            <Bar b={b} cols={cols} h={rowH - 6} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Bar({ b, cols, h }: { b: CalBar; cols: number; h: number }) {
  const obra = b.kind === "obra";
  const color = obra ? "#16A34A" : "#4F63D8";
  const radius = `${b.clipStart ? "0" : "8px"} ${b.clipEnd ? "0" : "8px"} ${b.clipEnd ? "0" : "8px"} ${b.clipStart ? "0" : "8px"}`;
  const lastCol = b.over ? b.over.col + b.over.span - 1 : b.col + b.span - 1;
  const label: CSSProperties = { position: "absolute", top: 3, height: h, display: "flex", alignItems: "center", fontSize: 22, fontWeight: 700, lineHeight: 1, color: "#1B1F27", whiteSpace: "nowrap" };
  return (
    <>
      {b.span > 0 && (
        <div style={{ position: "absolute", top: 3, height: h, left: pct(b.col, cols), width: pct(b.span, cols), boxSizing: "border-box", background: obra ? "#DCF3E5" : "#E9EDFF", border: `1.5px solid ${color}`, borderRadius: radius, overflow: "hidden", display: "flex", alignItems: "center" }}>
          <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${((b.done / b.span) * 100).toFixed(2)}%`, background: "#A6E0BD" }} />
          {b.inside && <span style={{ position: "relative", padding: "0 8px", fontSize: 22, fontWeight: 700, lineHeight: 1.15, color: "#1B1F27", ...ellipsis }}>{b.name}</span>}
        </div>
      )}
      {b.over && (
        <div style={{ position: "absolute", top: 3, height: h, left: pct(b.over.col, cols), width: pct(b.over.span, cols), boxSizing: "border-box", background: "repeating-linear-gradient(135deg, #FFF4DB 0, #FFF4DB 6px, #FFFAEB 6px, #FFFAEB 12px)", border: "1.5px dashed #F59E0B", borderLeft: 0, borderRadius: "0 8px 8px 0" }} />
      )}
      {!b.inside &&
        (b.labelSide === "right" ? (
          <span style={{ ...label, left: `calc(${pct(lastCol + 1, cols)} + 8px)`, justifyContent: "flex-start" }}>{b.name}</span>
        ) : (
          <span style={{ ...label, right: `calc(${pct(cols - b.col, cols)} + 8px)`, justifyContent: "flex-end" }}>{b.name}</span>
        ))}
    </>
  );
}

const WAIT_STYLE = {
  pause: { bg: "#FDECF1", border: "#F8D3DF", fg: "#A11C47", sub: "#A11C47" },
  wait: { bg: "#F9FAFB", border: "#EEF0F3", fg: "#1B1F27", sub: "#B54708" },
  ready: { bg: "#F9FAFB", border: "#EEF0F3", fg: "#1B1F27", sub: "#157F3D" },
} as const;

/** "Por programar": tarjetas por páginas (con tope de 30 en el modelo) y el medidor en una marquesina. */
function Waiting({ model, show, height }: { model: MuralModel; show: boolean; height: number }) {
  const w = model.waiting;
  const meter = model.meter.items;
  const pager = usePages(w.items, chipsPerPage(meter.length > 0));
  return (
    <section aria-label="Por programar" style={{ ...card, height, flexShrink: 0, padding: "14px 20px", display: "flex", flexDirection: "column", gap: 8, overflow: "hidden" }}>
      {show && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, height: 34, flexShrink: 0 }}>
            <span style={{ fontSize: 28, fontWeight: 800 }}>Por programar</span>
            <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: "#475467", background: "#F2F4F7", borderRadius: 999, padding: "2px 12px", whiteSpace: "nowrap" }}>
                {w.text}
                {w.more > 0 ? ` · +${w.more}` : ""}
              </span>
              <PageNumber index={pager.index} count={pager.count} />
            </span>
          </div>
          {w.items.length ? (
            <Paged pager={pager}>
              {(page) => (
                <div style={{ display: "flex", flexDirection: "column", gap: CHIP_GAP }}>
                  {page.map((b) => (
                    <WaitingChip key={b.id} b={b} />
                  ))}
                </div>
              )}
            </Paged>
          ) : (
            <p style={{ margin: 0, flex: 1, fontSize: 22, fontWeight: 600, color: "#667085" }}>No hay proyectos esperando fecha.</p>
          )}
        </>
      )}
      {meter.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, height: METER_H, flexShrink: 0, padding: "0 12px", borderRadius: 10, background: "#E3F1F5", color: "#155E75" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
            <circle cx="12" cy="13" r="8" />
            <path d="M12 13l3-3M9 3h6" />
          </svg>
          <span style={{ fontSize: 22, fontWeight: 800, whiteSpace: "nowrap", flexShrink: 0 }}>Esperando medidor</span>
          <Marquee
            gap={56}
            items={meter.map((m) => (
              <MeterText key={m.id} m={m} />
            ))}
            separator={<span aria-hidden style={{ width: 2, height: 22, flexShrink: 0, borderRadius: 1, background: "#7FB6C6" }} />}
          />
        </div>
      )}
    </section>
  );
}

/** Un medidor pendiente, completo: nombre en negrita, luego lugar y fecha (MUR-06). */
function MeterText({ m }: { m: MuralModel["meter"]["items"][number] }) {
  const rest = [m.place, m.endedOn ? `terminada el ${m.endedOn}` : ""].filter(Boolean).join(" · ");
  return (
    <span style={{ fontSize: 22, fontWeight: 600, whiteSpace: "nowrap" }}>
      <span style={{ fontWeight: 800 }}>{m.name}</span>
      {rest ? ` · ${rest}` : ""}
    </span>
  );
}

function WaitingChip({ b }: { b: WaitingItem }) {
  const s = WAIT_STYLE[b.tone];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, height: CHIP_H, flexShrink: 0, padding: "0 12px", background: s.bg, border: `1px solid ${s.border}`, borderRadius: 10, boxSizing: "border-box" }}>
      {b.tone === "pause" ? <span aria-hidden style={{ width: 10, height: 10, flexShrink: 0, borderRadius: "50%", background: "#D63B6A" }} /> : <PatternDot color={b.company.color} pattern={b.company.pattern} size={20} />}
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1, lineHeight: 1.15 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: s.fg, ...ellipsis }}>{b.name}</span>
          {b.priority && <Flag size={22} />}
        </span>
        <span style={{ fontSize: 22, fontWeight: 600, color: s.sub, ...ellipsis }}>{b.sub}</span>
      </div>
    </div>
  );
}

/** Pie: todos los avisos seguidos en una sola línea que rota (AVI-03). Cada uno lleva su punto; el nombre del proyecto, en negrita. */
function Footer({ model, live }: { model: MuralModel; live: ScreenProps["live"] }) {
  const lines = model.notices;
  return (
    <footer style={{ height: 72, flexShrink: 0, display: "flex", alignItems: "center", gap: 18, background: "#FFFFFF", border: "1px solid #E6E8EC", borderRadius: 16, padding: "0 16px 0 12px", overflow: "hidden", boxSizing: "border-box" }}>
      <span style={{ flexShrink: 0, fontSize: 22, fontWeight: 800, color: "#FFFFFF", background: TODAY_COLOR, borderRadius: 10, padding: "6px 16px" }}>
        Avisos
        {model.noticesMore > 0 ? ` +${model.noticesMore}` : ""}
      </span>
      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", overflow: "hidden" }}>
        {lines.length === 0 ? (
          <span style={{ fontSize: 22, fontWeight: 600, color: "#667085" }}>Sin avisos por ahora</span>
        ) : (
          <Marquee
            gap={64}
            items={lines.map((n, i) => (
              <NoticeText key={i} n={n} />
            ))}
            separator={<span aria-hidden style={{ width: 3, height: 28, flexShrink: 0, borderRadius: 2, background: "#D0D5DD" }} />}
          />
        )}
      </div>
      <span style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, fontSize: 22, fontWeight: 600, color: live.offline ? "#B54708" : "#667085", whiteSpace: "nowrap" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: live.offline ? "#F59E0B" : "#16A34A" }} />
        {updatedText(live)}
      </span>
    </footer>
  );
}

function NoticeText({ n }: { n: MuralModel["notices"][number] }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 22, lineHeight: 1.25, color: "#1B1F27", whiteSpace: "nowrap" }}>
      <span style={{ width: 10, height: 10, flexShrink: 0, borderRadius: "50%", background: ACCENT }} />
      {n.project && <span style={{ fontWeight: 800 }}>{n.project}</span>}
      <span style={{ fontWeight: n.project ? 600 : 700 }}>{n.text}</span>
    </span>
  );
}
