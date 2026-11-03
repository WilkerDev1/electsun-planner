import type { CSSProperties } from "react";
import { longDate } from "../../shared/domain";
import { shortName, type MuralModel, type TimelineGroup, type TimelineRow, type WaitingItem } from "../../shared/mural-model";
import { ACCENT, FONT, Flag, SunLogo, ellipsis, hhmm, pct, updatedText, type ScreenProps } from "./shared";

// Diseño "timeline por fila" (design/v4/V4Mural.dc.html, MUR-08): una fila por proyecto activo con su barra.

const COLS = "72px minmax(0, 1fr) 200px 1120px";
const GRID_PX = 1120;
// Alto libre para las filas: 1000 de lienzo − cabecera 88 − pie 100 − separaciones 40 − relleno 28 − encabezado 66.
const ROWS_AREA = 678;
const GROUP_LABEL = 40;
const SIZE = {
  obra: { row: 76, bar: 40, name: 30, badge: 56, min: 52 },
  prog: { row: 58, bar: 30, name: 26, badge: 42, min: 44 },
} as const;

export function Timeline({ view, live }: ScreenProps) {
  const { model, settings } = view;
  const footer = (settings.show_waiting && model.waiting.items.length > 0) || model.notices.length > 0;
  const groups = fit(model.timeline.groups, ROWS_AREA + (footer ? 0 : 120));
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
        gap: 20,
        overflow: "hidden",
      }}
    >
      <Header model={model} showClock={settings.show_clock} live={live} today={view.today} />
      <Board model={model} groups={groups} />
      {footer && <Footer model={model} show={settings.show_waiting} />}
    </div>
  );
}

type Fitted = { group: TimelineGroup; rows: TimelineRow[]; hidden: number; scale: number };

/** Reparte el alto entre filas: las encoge hasta un mínimo y, si aun así no caben, deja fuera las últimas ("y N más"). */
function fit(groups: TimelineGroup[], area: number): Fitted[] {
  const used = groups.filter((g) => g.rows.length > 0);
  const free = area - used.length * GROUP_LABEL;
  const height = (g: Fitted["group"], n: number, scale: number) => n * SIZE[g.key].row * scale;
  const total = (counts: number[], scale: number) => used.reduce((s, g, i) => s + height(g, counts[i], scale), 0);
  const counts = used.map((g) => g.rows.length);
  let scale = Math.min(1, free / Math.max(total(counts, 1), 1));
  const minScale = (g: TimelineGroup) => SIZE[g.key].min / SIZE[g.key].row;
  const floor = Math.max(...used.map(minScale), 0);
  if (scale < floor) {
    scale = floor;
    // Quita filas del último grupo, y luego del anterior, hasta que quepa.
    for (let i = used.length - 1; i >= 0 && total(counts, scale) > free; i--)
      while (counts[i] > 0 && total(counts, scale) > free) counts[i]--;
  }
  return used.map((g, i) => ({ group: g, rows: g.rows.slice(0, counts[i]), hidden: g.rows.length - counts[i], scale }));
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
        {showClock && <span style={{ fontSize: 68, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1 }}>{hhmm(live.now)}</span>}
      </div>
    </header>
  );
}

function Board({ model, groups }: { model: MuralModel; groups: Fitted[] }) {
  const t = model.timeline;
  const { cols, weeks } = t;
  const head: CSSProperties = { fontSize: 22, fontWeight: 700, color: "#5F6675", paddingBottom: 10 };
  const todayAt = t.todayCol === null ? null : (t.todayCol + (t.todayAtEnd ? 1 : 0.5)) / cols;
  const empty = groups.length === 0;
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
              <span key={i} style={{ textAlign: "center", fontSize: 22, fontWeight: d.today ? 800 : 600, color: d.today ? "#FFFFFF" : d.saturday ? "#5F6675" : "#3F4859", background: d.today ? "#C2410C" : "transparent", borderRadius: 8, margin: "0 2px" }}>{d.n}</span>
            ))}
          </div>
        </div>
      </div>
      {empty && <p style={{ margin: 0, padding: "40px 8px", fontSize: 26, fontWeight: 600, color: "#5F6675" }}>No hay instalaciones en obra ni programadas por ahora.</p>}
      {groups.map((f) => (
        <GroupRows key={f.group.key} f={f} cols={cols} weeks={weeks} todayCol={t.todayCol} todayAt={todayAt} />
      ))}
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
        {f.hidden > 0 && <span style={{ fontSize: 22, fontWeight: 700, color: "#5F6675" }}>· y {f.hidden} más</span>}
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
              <span style={{ width: 10, height: 10, flexShrink: 0, borderRadius: "50%", background: r.dot }} />
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
            {todayAt !== null && <div style={{ position: "absolute", top: 0, bottom: 0, left: `${(todayAt * 100).toFixed(3)}%`, width: 2, marginLeft: -1, background: "#C2410C" }} />}
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
  const lines = model.notices;
  const dense = lines.length > 2;
  return (
    <footer style={{ height: 100, flexShrink: 0, display: "flex", gap: 20 }}>
      {show && (
        <div style={{ flex: 1.6, minWidth: 0, background: "#FFFFFF", borderRadius: 22, padding: "0 24px", display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ flexShrink: 0, display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "0.12em", color: "#3F4859" }}>ESPERANDO FECHA</span>
            <span style={{ fontSize: 22, fontWeight: 600, color: "#5F6675" }}>vendidos sin programar</span>
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, minWidth: 0, maxHeight: 88, overflow: "hidden" }}>
            {items.map((b) => {
              const c = b.tone === "pause" ? CHIP.pause : CHIP.other;
              return (
                <span key={b.id} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 12px", borderRadius: 12, background: c.bg, fontSize: 22, fontWeight: 700, color: c.fg, whiteSpace: "nowrap" }}>
                  {b.priority && <Flag size={20} />}
                  {shortName(b.name)}
                  {b.tone === "pause" ? <span style={{ fontWeight: 600, opacity: 0.8 }}> · en pausa</span> : b.days !== null && <span style={{ fontWeight: 600, opacity: 0.8 }}>{b.days} d</span>}
                </span>
              );
            })}
            {w.more > 0 && <span style={{ alignSelf: "center", fontSize: 22, fontWeight: 700, color: "#5F6675" }}>+{w.more} más</span>}
            {items.length === 0 && <span style={{ alignSelf: "center", fontSize: 22, fontWeight: 600, color: "#5F6675" }}>Ninguno por ahora</span>}
          </div>
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0, background: "#FFFFFF", borderRadius: 22, padding: dense ? "6px 24px" : "12px 24px", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "center", gap: dense ? 0 : 6 }}>
        {lines.length === 0 && <span style={{ fontSize: 22, fontWeight: 600, color: "#5F6675" }}>Sin avisos por ahora</span>}
        {lines.map((n, i) => (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, lineHeight: dense ? 1.2 : undefined }}>
            <span style={{ flexShrink: 0, width: 10, height: 10, borderRadius: "50%", background: ACCENT }} />
            {n.project && <span style={{ fontSize: 22, fontWeight: 800, whiteSpace: "nowrap" }}>{n.project}</span>}
            <span style={{ fontSize: 22, fontWeight: n.project ? 600 : 800, color: n.project ? "#3F4859" : "#1B1F27", ...ellipsis }}>{n.text}</span>
          </span>
        ))}
      </div>
    </footer>
  );
}
