import { useLayoutEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { AgendaDay, MovilView, TimelineBar } from "../../shared/contracts/movil";
import { shortDate } from "../../shared/domain";
import { Icon, ICON, PageTitle, Switch, TeamBadge, fromState, jobLink, useMovil } from "./ui";

// Calendario (MOV-04, CAL-09): agenda por día laborable y línea de tiempo por equipo, 3 semanas.

type Mode = "agenda" | "linea";
const COL = 56; // ancho de un día en la línea de tiempo
const GUT = 48; // columna fija con el equipo
const LETTERS = ["L", "M", "X", "J", "V", "S"];
const WEEK_NAMES = ["Esta semana", "Próxima semana", "En dos semanas"];

function useCalendarParams(teamCodes: string[]) {
  const [params, setParams] = useSearchParams();
  const mode: Mode = params.get("vista") === "linea" ? "linea" : "agenda";
  const eq = params.get("eq") ?? "todos";
  const team = eq === "todos" || teamCodes.includes(eq) ? eq : "todos";
  const week = Math.min(2, Math.max(0, Number(params.get("sem")) || 0));
  // El estado vive en la URL para que "Atrás" desde el detalle vuelva a la misma vista.
  const update = (patch: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) v === null ? next.delete(k) : next.set(k, v);
        return next;
      },
      { replace: true },
    );
  return { mode, team, week, update };
}

function AgendaRow({ day, team }: { day: AgendaDay; team: string }) {
  const items = day.items.filter((i) => team === "todos" || i.team_code === team);
  const dim = day.is_past;
  return (
    <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-2.5">
      <div className="flex flex-col items-center pt-1.5 leading-tight">
        <span className="text-[13px] font-extrabold" style={{ color: day.is_today ? "#C2410C" : dim ? "#6B7280" : "#475467" }}>
          {day.dow}
        </span>
        <span
          className="mt-1 flex size-9 items-center justify-center rounded-full text-[18px] font-extrabold"
          style={{ background: day.is_today ? "#C2410C" : "transparent", color: day.is_today ? "#FFFFFF" : dim ? "#6B7280" : "#1B1F27" }}
          aria-label={`${day.dow} ${day.day}${day.is_today ? ", hoy" : ""}`}
        >
          {day.day}
        </span>
      </div>
      <div className="flex flex-col gap-1.5 border-b border-[#E9EBEF] pb-1.5">
        {items.map((it) => (
          <Link
            key={it.id}
            to={jobLink(it.id)}
            state={fromState("Calendario")}
            className="flex min-h-14 items-center gap-2.5 rounded-xl border-[1.5px] px-3 py-2.5 text-ink no-underline"
            style={{
              borderColor: it.mine ? "#F6C9A8" : it.kind === "en_obra" ? "#CDEBD8" : "#DCE2FF",
              background: it.kind === "en_obra" ? "#F3FBF6" : "#F5F7FF",
            }}
          >
            {it.team_code && <TeamBadge code={it.team_code} />}
            <span className="flex min-w-0 flex-1 flex-col leading-snug">
              <span className="truncate text-[16px] font-bold">{it.name}</span>
              {it.sub && <span className="truncate text-[13px] text-muted">{it.sub}</span>}
            </span>
            <span className="shrink-0 text-[14px] font-bold" style={{ color: it.tone === "atrasada" ? "#B54708" : it.tone === "obra" ? "#157F3D" : "#3B4FC4" }}>
              {it.tag}
            </span>
          </Link>
        ))}
        {!items.length && <span className="rounded-xl border border-dashed border-line-2 bg-white px-3 py-2.5 text-[15px] text-muted">Sin obras programadas</span>}
      </div>
    </div>
  );
}

function Bar({ bar, nextFree }: { bar: TimelineBar; nextFree: number }) {
  const left = bar.col * COL + 3;
  const width = bar.span * COL - 6;
  const label = bar.name.length * 8.5 + 24;
  const inside = label <= width;
  // Fuera de la barra el nombre va a la derecha (después del tramo de atraso) o, si no cabe, a su izquierda.
  const endX = nextFree * COL;
  const fitsRight = 18 * COL - endX >= label + 8;
  const color = bar.kind === "en_obra" ? "#16A34A" : "#4F63D8";
  const radius = `${bar.clip_start ? "0" : "8px"} ${bar.clip_end ? "0" : "8px"} ${bar.clip_end ? "0" : "8px"} ${bar.clip_start ? "0" : "8px"}`;
  return (
    <div className="relative h-10">
      <Link
        to={jobLink(bar.id)}
        state={fromState("Calendario")}
        aria-label={`${bar.name}, ${bar.dates_text}${bar.overrun ? ", atrasada" : ""}`}
        className="absolute top-[5px] flex h-[30px] items-center overflow-clip border-[1.5px] p-0 text-ink no-underline"
        style={{ left, width, borderColor: color, borderRadius: radius, background: bar.kind === "en_obra" ? "#DCF3E5" : "#E9EDFF" }}
      >
        <span aria-hidden className="absolute inset-y-0 left-0" style={{ width: `${(bar.done_cols / bar.span) * 100}%`, background: "#A6E0BD" }} />
        {/* overflow-clip (no hidden) deja que el nombre quede fijo junto a la columna de equipos al deslizar. */}
        {inside && <span className="sticky truncate px-2.5 text-[14px] font-bold" style={{ left: GUT }}>{bar.name}</span>}
      </Link>
      {bar.overrun && (
        <span
          aria-hidden
          className="absolute top-[5px] h-[30px] rounded-r-lg border-[1.5px] border-l-0 border-dashed border-[#F59E0B]"
          style={{
            left: bar.overrun.col * COL - 3,
            width: bar.overrun.span * COL,
            background: "repeating-linear-gradient(135deg, #FFF4DB 0, #FFF4DB 6px, #FFFAEB 6px, #FFFAEB 12px)",
          }}
        />
      )}
      {!inside && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-[5px] flex h-[30px] items-center whitespace-nowrap text-[14px] font-bold"
          style={fitsRight ? { left: endX + 6 } : { right: (18 - bar.col) * COL + 6 }}
        >
          {bar.name}
        </span>
      )}
    </div>
  );
}

function Timeline({ view, team }: { view: MovilView; team: string }) {
  const tl = view.calendario.timeline;
  const scroller = useRef<HTMLDivElement>(null);
  // La línea empieza en hoy: se desplaza para dejar el día de hoy casi al borde izquierdo.
  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = Math.max(0, (tl.today_col - 1) * COL);
  }, [tl.today_col]);

  const weeks = [0, 1, 2].map((w) => {
    const a = tl.days[w * 6].date;
    const b = tl.days[w * 6 + 5].date;
    const current = tl.today_col >= w * 6 && tl.today_col <= w * 6 + 5;
    const month = (iso: string) => shortDate(iso).split(" ")[1];
    const sameMonth = month(a) === month(b);
    return { current, label: `${current ? "Esta semana · " : ""}${Number(a.slice(8, 10))}${sameMonth ? "" : " " + month(a)}–${shortDate(b)}` };
  });
  const width = GUT + tl.days.length * COL;
  const lanes = tl.lanes.filter((l) => team === "todos" || l.team_code === team);
  const separator = (k: number) => (k > 0 && k % 6 === 0 ? "2px dashed #D0D5DD" : undefined);
  const dayBg = (k: number) => (k === tl.today_col ? "rgba(234,106,31,0.07)" : k % 6 === 5 ? "#FAFAFB" : "transparent");

  return (
    <div className="flex flex-col gap-2.5">
      <div
        ref={scroller}
        role="region"
        aria-label="Línea de tiempo por equipo. Desliza hacia los lados para ver más días."
        tabIndex={0}
        className="movil-noscrollbar overflow-x-auto rounded-[18px] border border-line bg-white"
      >
        <div className="relative" style={{ width }}>
          <div className="flex border-b border-[#F0F1F4]">
            <div className="sticky left-0 z-[3] shrink-0 border-r border-[#EEF0F3] bg-white" style={{ width: GUT }} />
            {weeks.map((w, i) => (
              <div
                key={i}
                className="shrink-0 whitespace-nowrap px-2.5 pb-1 pt-2 text-[13px] font-bold"
                style={{ width: 6 * COL, borderLeft: separator(i * 6), color: w.current ? "#C2410C" : "#475467" }}
              >
                {w.label}
              </div>
            ))}
          </div>
          <div className="flex border-b border-line">
            <div className="sticky left-0 z-[3] shrink-0 border-r border-[#EEF0F3] bg-white" style={{ width: GUT }} />
            {tl.days.map((d, k) => (
              <div key={d.date} className="flex shrink-0 flex-col items-center gap-0.5 pb-2 pt-1" style={{ width: COL, borderLeft: separator(k), background: dayBg(k) }}>
                <span className="text-[13px] font-bold" style={{ color: d.is_today ? "#C2410C" : d.is_past ? "#6B7280" : "#475467" }}>
                  {LETTERS[k % 6]}
                </span>
                <span
                  className="flex size-[30px] items-center justify-center rounded-full text-[15px] font-extrabold"
                  style={{ background: d.is_today ? "#C2410C" : "transparent", color: d.is_today ? "#FFFFFF" : d.is_past ? "#6B7280" : "#1B1F27" }}
                  aria-label={`${d.dow} ${d.day}${d.is_today ? ", hoy" : ""}`}
                >
                  {d.day}
                </span>
              </div>
            ))}
          </div>
          <div className="relative">
            <div aria-hidden className="absolute inset-y-0 flex" style={{ left: GUT }}>
              {tl.days.map((d, k) => (
                <div key={d.date} className="shrink-0" style={{ width: COL, borderLeft: k === 0 ? 0 : (separator(k) ?? "1px solid #F2F3F5"), background: dayBg(k) }} />
              ))}
            </div>
            <div aria-hidden className="absolute inset-y-0 w-0.5 bg-brand" style={{ left: GUT + tl.today_col * COL + COL / 2 - 1 }} />
            {lanes.map((ln) => (
              <div key={ln.team_id} className="relative flex border-b border-[#EEF0F3]">
                <div className="sticky left-0 z-[2] flex shrink-0 justify-center border-r border-[#EEF0F3] bg-white pt-3" style={{ width: GUT }}>
                  <span className={`flex h-[22px] items-center rounded-md px-2 text-[13px] font-extrabold text-white ${ln.mine ? "bg-today" : "bg-ink"}`}>{ln.team_code}</span>
                </div>
                <div className="relative py-1.5" style={{ width: tl.days.length * COL, minHeight: 52 }}>
                  {ln.bars.map((b) => (
                    <Bar key={b.id} bar={b} nextFree={b.overrun ? b.overrun.col + b.overrun.span : b.col + b.span} />
                  ))}
                  {!ln.bars.length && <span className="absolute left-3 top-4 text-[13px] text-muted">Sin obras en estas semanas</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[13px] font-semibold text-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-4 rounded-[3px] border-[1.5px] border-[#16A34A]" style={{ background: "linear-gradient(to right, #A6E0BD 50%, #DCF3E5 50%)" }} />
          Instalando
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-4 rounded-[3px] border-[1.5px] border-[#4F63D8] bg-[#E9EDFF]" />
          Programado
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-0.5 bg-brand" />
          Hoy
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-4 rounded-[3px] border-[1.5px] border-dashed border-[#F59E0B] bg-[#FFF4DB]" />
          Atraso
        </span>
        <span className="ml-auto flex items-center gap-1">
          Desliza
          <Icon d={ICON.arrowRight} size={14} width={2.2} />
        </span>
      </div>
    </div>
  );
}

export default function Calendario() {
  const { view } = useMovil();
  const { agenda, timeline, teams } = view.calendario;
  const { mode, team, week, update } = useCalendarParams(teams.map((t) => t.code));
  const days = agenda.slice(week * 6, week * 6 + 6);
  const subtitle =
    mode === "agenda"
      ? `${WEEK_NAMES[week]} · ${shortDate(days[0].date)} – ${shortDate(days[5].date)}`
      : `${shortDate(timeline.days[0].date)} – ${shortDate(timeline.days[timeline.days.length - 1].date)} · tres semanas`;
  const arrow = "flex size-11 items-center justify-center rounded-xl border border-line bg-white text-ink-2 disabled:text-line-2";

  return (
    <div className="flex flex-col gap-3.5 px-4 pb-6 pt-5">
      <PageTitle title="Calendario" subtitle={subtitle}>
        {mode === "agenda" && (
          <span className="flex gap-1.5">
            <button type="button" aria-label="Semana anterior" disabled={week === 0} onClick={() => update({ sem: String(week - 1) })} className={arrow}>
              <Icon d={ICON.chevronLeft} size={18} width={2.2} />
            </button>
            <button type="button" aria-label="Semana siguiente" disabled={week === 2} onClick={() => update({ sem: String(week + 1) })} className={arrow}>
              <Icon d={ICON.chevronRight} size={18} width={2.2} />
            </button>
          </span>
        )}
      </PageTitle>

      <Switch
        label="Modo de vista"
        value={mode}
        onChange={(v) => update({ vista: v === "linea" ? "linea" : null })}
        options={[
          { value: "agenda", label: "Agenda", icon: ICON.agenda },
          { value: "linea", label: "Línea de tiempo", icon: ICON.timeline },
        ]}
      />

      <div role="group" aria-label="Equipo" className="flex flex-wrap gap-1.5">
        {[{ code: "todos", label: "Todos" }, ...teams.map((t) => ({ code: t.code, label: t.mine ? `${t.code} · tu equipo` : t.code }))].map((c) => {
          const on = team === c.code;
          return (
            <button
              key={c.code}
              type="button"
              aria-pressed={on}
              onClick={() => update({ eq: c.code === "todos" ? null : c.code })}
              className={`h-11 rounded-full border px-4 text-[15px] font-bold ${on ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2"}`}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {mode === "agenda" ? days.map((d) => <AgendaRow key={d.date} day={d} team={team} />) : <Timeline view={view} team={team} />}
    </div>
  );
}
