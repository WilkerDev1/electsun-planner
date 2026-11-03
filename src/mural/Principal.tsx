import type { CSSProperties } from "react";
import { longDate } from "../../shared/domain";
import type { ActiveRow, CalBar, CalTeam, KpiTone, MuralModel, WaitingItem } from "../../shared/mural-model";
import { ACCENT, FONT, Flag, SunLogo, dayFraction, ellipsis, hhmm, pct, updatedText, type ScreenProps } from "./shared";

// Diseño principal del mural (design/v4/V4MuralPrincipal.dc.html): tabla de activos + calendario por equipo.
// Todo el lienzo mide 1920×1080 (MUR-01); los números llevan tabular-nums (NF-04).

const KPI_COLOR: Record<KpiTone, string> = { ok: "#157F3D", indigo: "#3B4FC4", slate: "#475467", brand: ACCENT };
const ACTIVE_ROWS = 9;
const CAL_ROW = 38;

const card: CSSProperties = { background: "#FFFFFF", border: "1px solid #E6E8EC", borderRadius: 20, boxSizing: "border-box" };
const COLS = "minmax(0, 1fr) 170px 140px 170px 180px";

export function Principal({ view, live }: ScreenProps) {
  const { model, settings } = view;
  const waitingShown = settings.show_waiting;
  const meterShown = model.meter.items.length > 0;
  // Altura de "Por programar": con cuadrícula y medidor 276 px, solo uno de los dos menos.
  const bottomH = waitingShown ? (meterShown ? 276 : 226) : meterShown ? 74 : 0;
  return (
    <div
      style={{
        width: 1920,
        height: 1080,
        boxSizing: "border-box",
        padding: "36px 40px",
        background: "#F4F5F7",
        color: "#1B1F27",
        fontFamily: FONT,
        fontVariantNumeric: "tabular-nums",
        display: "flex",
        flexDirection: "column",
        gap: 24,
        overflow: "hidden",
      }}
    >
      <style>{`@keyframes mural-pulse{0%{box-shadow:0 0 0 0 rgba(22,163,74,.45)}100%{box-shadow:0 0 0 10px rgba(22,163,74,0)}}.mural-pulse{animation:mural-pulse 2s ease-out infinite}`}</style>
      <Header model={model} showClock={settings.show_clock} live={live} today={view.today} />
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 24 }}>
        <ActiveList model={model} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 24 }}>
          <Calendar model={model} live={live} bottomH={bottomH} />
          {bottomH > 0 && <Waiting model={model} show={waitingShown} height={bottomH} />}
        </div>
      </div>
      <Footer model={model} live={live} />
    </div>
  );
}

function Header({ model, showClock, live, today }: { model: MuralModel; showClock: boolean; live: ScreenProps["live"]; today: string }) {
  return (
    <header style={{ height: 88, display: "flex", alignItems: "center", gap: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 440 }}>
        <SunLogo box={60} size={32} radius={16} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.02em" }}>Proyectos</div>
          <div style={{ fontSize: 18, color: "#667085", fontWeight: 500 }}>{model.subtitle}</div>
        </div>
      </div>
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16 }}>
        {model.kpis.map((k) => (
          <div key={k.key} style={{ background: "#FFFFFF", border: "1px solid #E6E8EC", borderRadius: 16, padding: "12px 20px", display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontSize: 42, fontWeight: 800, color: KPI_COLOR[k.tone] }}>{k.n}</span>
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span style={{ fontSize: 17, fontWeight: 700 }}>{k.label}</span>
              <span style={{ fontSize: 15, color: "#667085", ...ellipsis }}>{k.sub}</span>
            </div>
          </div>
        ))}
      </div>
      {showClock && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, minWidth: 250 }}>
          <div style={{ fontSize: 52, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}>{hhmm(live.now)}</div>
          <div style={{ fontSize: 18, color: "#667085", fontWeight: 500 }}>{longDate(today)}</div>
        </div>
      )}
    </header>
  );
}

function ActiveList({ model }: { model: MuralModel }) {
  const rows = model.active.rows;
  const shown = rows.slice(0, ACTIVE_ROWS);
  const more = rows.length - shown.length;
  return (
    <section aria-label="Instalaciones activas" style={{ ...card, width: 1100, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ height: 64, padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #EEF0F3" }}>
        <span style={{ fontSize: 22, fontWeight: 800 }}>Instalaciones activas</span>
        <div style={{ display: "flex", gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#157F3D", background: "#E7F7EE", borderRadius: 999, padding: "6px 14px" }}>En obra · {model.active.nObra}</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#3B4FC4", background: "#EEF2FF", borderRadius: 999, padding: "6px 14px" }}>Programados · {model.active.nProg}</span>
        </div>
      </div>
      <div style={{ height: 44, padding: "0 24px", display: "grid", gridTemplateColumns: COLS, columnGap: 16, alignItems: "center", background: "#F9FAFB", borderBottom: "1px solid #EEF0F3", fontSize: 14, fontWeight: 700, color: "#667085" }}>
        <span>Proyecto</span>
        <span>Estado</span>
        <span>Equipo</span>
        <span>Fechas</span>
        <span>Avance</span>
      </div>
      {shown.map((r) => (
        <ActiveItem key={r.id} r={r} />
      ))}
      {rows.length === 0 && (
        <p style={{ margin: 0, padding: "40px 24px", fontSize: 20, fontWeight: 600, color: "#667085" }}>No hay instalaciones en obra ni programadas por ahora.</p>
      )}
      {more > 0 && (
        <div style={{ padding: "12px 24px", fontSize: 16, fontWeight: 700, color: "#667085" }}>y {more} {more === 1 ? "instalación más" : "instalaciones más"}</div>
      )}
    </section>
  );
}

function ActiveItem({ r }: { r: ActiveRow }) {
  const late = (r.progress?.late ?? 0) > 0;
  const sub = [r.company.name, r.place, r.kwp ? `${r.kwp} kWp` : ""].filter(Boolean).join(" · ");
  return (
    <div style={{ height: 72, padding: "0 24px", display: "grid", gridTemplateColumns: COLS, columnGap: 16, alignItems: "center", borderBottom: "1px solid #F0F1F4" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
        <div style={{ width: 42, height: 42, flexShrink: 0, borderRadius: "50%", background: r.company.bg, color: r.company.fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800 }}>{r.company.code}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span style={{ fontSize: 20, fontWeight: 700, ...ellipsis }}>{r.name}</span>
            {r.priority && <Flag size={18} />}
            {r.note && (
              <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 700, color: "#9A3412", background: "#FFF1E7", borderRadius: 6, padding: "3px 8px" }}>{r.note}</span>
            )}
          </div>
          <span style={{ fontSize: 15, color: "#667085", ...ellipsis }}>{sub}</span>
        </div>
      </div>
      <div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700, color: r.status.fg, background: r.status.bg, borderRadius: 8, padding: "6px 12px" }}>
          <span className={r.kind === "en_obra" ? "mural-pulse" : undefined} style={{ width: 8, height: 8, borderRadius: "50%", background: r.status.fg }} />
          {r.status.name}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {r.team ? (
          <>
            <span style={{ width: 34, height: 30, borderRadius: 8, background: "#1B1F27", color: "#FFFFFF", fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{r.team.code}</span>
            <span style={{ fontSize: 16, fontWeight: 600, color: "#344054" }}>{r.team.name}</span>
          </>
        ) : (
          <span style={{ fontSize: 16, fontWeight: 600, color: "#667085" }}>Sin equipo</span>
        )}
      </div>
      <span style={{ fontSize: 16, fontWeight: 600, color: "#344054" }}>{r.dates}</span>
      {r.progress ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: late ? "#B54708" : "#157F3D", whiteSpace: "nowrap" }}>{r.progress.text}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#667085", whiteSpace: "nowrap" }}>{r.progress.endText}</span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: "#EAECF0", overflow: "hidden" }}>
            <div style={{ height: 8, borderRadius: 4, background: late ? "#F59E0B" : "#16A34A", width: `${Math.round(r.progress.ratio * 100)}%` }} />
          </div>
        </div>
      ) : (
        <span style={{ fontSize: 16, fontWeight: 600, color: "#3B4FC4" }}>{r.countdown}</span>
      )}
    </div>
  );
}

function Calendar({ model, live, bottomH }: { model: MuralModel; live: ScreenProps["live"]; bottomH: number }) {
  const cal = model.calendar;
  const { cols } = cal;
  const rows = cal.teams.reduce((n, t) => n + Math.max(1, t.bars.length), 0);
  // El alto libre del calendario: 353 px con "Por programar" completo; crece si ese bloque es menor o no está.
  const avail = 353 + (276 - bottomH) + (bottomH === 0 ? 24 : 0);
  const rowH = Math.max(26, Math.min(CAL_ROW, Math.floor((avail - cal.teams.length * 13) / Math.max(rows, 1))));
  const todayLeft = cal.todayCol === null ? null : pct(cal.todayCol + (cal.todayAtEnd ? 1 : dayFraction(live.now)), cols);
  return (
    <section aria-label="Calendario por equipo" style={{ ...card, flex: 1, minHeight: 0, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
          <span style={{ fontSize: 22, fontWeight: 800 }}>Calendario por equipo</span>
          <span style={{ fontSize: 14, color: "#667085", fontWeight: 500 }}>{cal.rangeLabel}</span>
        </span>
        <Legend />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "56px minmax(0, 1fr)" }}>
        <div />
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, borderBottom: "1px solid #EAECF0", paddingBottom: 8 }}>
          {cal.days.map((d) => (
            <div key={d.iso} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, borderLeft: d.weekStart ? "2px dashed #D0D5DD" : 0 }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", color: d.today ? ACCENT : "#667085" }}>{d.label}</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: d.today ? "#FFFFFF" : d.saturday ? "#667085" : "#1B1F27", background: d.today ? ACCENT : "transparent", borderRadius: 999, minWidth: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center" }}>{d.n}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, bottom: 0, left: 56, right: 0, display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {cal.days.map((d, i) => (
            <div key={d.iso} style={{ borderLeft: d.weekStart ? "2px dashed #D0D5DD" : i === 0 ? 0 : "1px solid #F0F1F4", background: d.today ? "rgba(234,106,31,0.06)" : d.saturday ? "#FAFAFB" : "transparent" }} />
          ))}
        </div>
        {todayLeft && (
          <div style={{ position: "absolute", top: 0, bottom: 0, left: 56, right: 0, pointerEvents: "none" }}>
            <div style={{ position: "absolute", top: 0, bottom: 0, left: todayLeft, width: 2, marginLeft: -1, background: ACCENT }} />
          </div>
        )}
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
    <span style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 14, fontWeight: 600, color: "#475467", whiteSpace: "nowrap" }}>
      <span style={item}><span style={{ ...chip, background: "linear-gradient(to right, #A6E0BD 50%, #DCF3E5 50%)", border: "1.5px solid #16A34A" }} />En obra</span>
      <span style={item}><span style={{ ...chip, background: "#E9EDFF", border: "1.5px solid #4F63D8" }} />Programado</span>
      <span style={item}><span style={{ width: 2, height: 14, background: ACCENT }} />Hoy</span>
      <span style={item}><span style={{ ...chip, background: "#FFFAEB", border: "1.5px dashed #F59E0B" }} />Atraso</span>
    </span>
  );
}

function TeamRows({ team, cols, rowH }: { team: CalTeam; cols: number; rowH: number }) {
  return (
    <div style={{ position: "relative", display: "grid", gridTemplateColumns: "56px minmax(0, 1fr)", padding: "6px 0", borderBottom: "1px solid #EEF0F3" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, paddingTop: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: "#FFFFFF", background: "#1B1F27", borderRadius: 6, padding: "3px 8px" }}>{team.code}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {team.bars.length === 0 && <div style={{ height: rowH }} />}
        {team.bars.map((b) => (
          <div key={b.id} style={{ height: rowH, position: "relative" }}>
            <Bar b={b} cols={cols} h={rowH - 10} />
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
  const label: CSSProperties = { position: "absolute", top: 5, height: h, display: "flex", alignItems: "center", fontSize: 15, fontWeight: 700, color: "#1B1F27", whiteSpace: "nowrap" };
  return (
    <>
      {b.span > 0 && (
        <div style={{ position: "absolute", top: 5, height: h, left: pct(b.col, cols), width: pct(b.span, cols), boxSizing: "border-box", background: obra ? "#DCF3E5" : "#E9EDFF", border: `1.5px solid ${color}`, borderRadius: radius, overflow: "hidden", display: "flex", alignItems: "center" }}>
          <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${((b.done / b.span) * 100).toFixed(2)}%`, background: "#A6E0BD" }} />
          {b.inside && <span style={{ position: "relative", padding: "0 10px", fontSize: 15, fontWeight: 700, color: "#1B1F27", ...ellipsis }}>{b.name}</span>}
        </div>
      )}
      {b.over && (
        <div style={{ position: "absolute", top: 5, height: h, left: pct(b.over.col, cols), width: pct(b.over.span, cols), boxSizing: "border-box", background: "repeating-linear-gradient(135deg, #FFF4DB 0, #FFF4DB 6px, #FFFAEB 6px, #FFFAEB 12px)", border: "1.5px dashed #F59E0B", borderLeft: 0, borderRadius: "0 8px 8px 0" }} />
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

function Waiting({ model, show, height }: { model: MuralModel; show: boolean; height: number }) {
  const w = model.waiting;
  const items = w.items;
  const meter = model.meter.items;
  return (
    <section aria-label="Por programar" style={{ ...card, height, flexShrink: 0, padding: "18px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
      {show && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 22, fontWeight: 800 }}>Por programar</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#475467", background: "#F2F4F7", borderRadius: 999, padding: "4px 12px" }}>
              {w.text}
              {w.more > 0 ? ` · +${w.more} más` : ""}
            </span>
          </div>
          {items.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px 16px", alignContent: "start", flex: 1 }}>
              {items.map((b) => (
                <WaitingChip key={b.id} b={b} />
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, flex: 1, fontSize: 18, fontWeight: 600, color: "#667085" }}>No hay proyectos esperando fecha.</p>
          )}
        </>
      )}
      {meter.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, height: 38, flexShrink: 0, padding: "0 12px", borderRadius: 10, background: "#E3F1F5", color: "#155E75" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="13" r="8" />
            <path d="M12 13l3-3M9 3h6" />
          </svg>
          <span style={{ fontSize: 15, fontWeight: 800, whiteSpace: "nowrap" }}>Esperando medidor</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, ...ellipsis }}>{meter.map((m) => m.text).join("   |   ")}</span>
        </div>
      )}
    </section>
  );
}

function WaitingChip({ b }: { b: WaitingItem }) {
  const s = WAIT_STYLE[b.tone];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, height: 40, padding: "0 12px", background: s.bg, border: `1px solid ${s.border}`, borderRadius: 10, boxSizing: "border-box" }}>
      <span style={{ width: 10, height: 10, flexShrink: 0, borderRadius: "50%", background: b.tone === "pause" ? "#D63B6A" : b.company.dot }} />
      <span style={{ flex: "0 1 auto", minWidth: 0, maxWidth: "62%", fontSize: 16, fontWeight: 700, color: s.fg, ...ellipsis }}>{b.name}</span>
      {b.priority && <Flag size={16} />}
      <span style={{ flex: "1 1 0", minWidth: 0, textAlign: "right", fontSize: 13, fontWeight: 700, color: s.sub, ...ellipsis }}>{b.sub}</span>
    </div>
  );
}

function Footer({ model, live }: { model: MuralModel; live: ScreenProps["live"] }) {
  const lines = model.notices;
  return (
    <footer style={{ height: 56, flexShrink: 0, display: "flex", alignItems: "center", gap: 18, background: "#FFFFFF", border: "1px solid #E6E8EC", borderRadius: 16, padding: "0 16px 0 10px", overflow: "hidden", boxSizing: "border-box" }}>
      <span style={{ flexShrink: 0, fontSize: 16, fontWeight: 800, color: "#FFFFFF", background: ACCENT, borderRadius: 10, padding: "8px 16px" }}>Avisos</span>
      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 40, overflow: "hidden" }}>
        {lines.length === 0 && <span style={{ fontSize: 18, fontWeight: 600, color: "#667085" }}>Sin avisos por ahora</span>}
        {lines.map((n, i) => (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flexShrink: i === lines.length - 1 ? 1 : 0, fontSize: 20, fontWeight: 600, whiteSpace: "nowrap", color: "#1B1F27" }}>
            <span style={{ width: 8, height: 8, flexShrink: 0, borderRadius: "50%", background: ACCENT }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{n.project ? `${n.project}: ${n.text}` : n.text}</span>
          </span>
        ))}
      </div>
      <span style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 600, color: live.offline ? "#B54708" : "#667085", whiteSpace: "nowrap" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: live.offline ? "#F59E0B" : "#16A34A" }} />
        {updatedText(live)}
      </span>
    </footer>
  );
}
