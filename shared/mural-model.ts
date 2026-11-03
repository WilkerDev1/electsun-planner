// Modelo del mural de TV (CAL-08). Función pura: lo usan GET /api/view/mural, la vista previa de Configuración y las pruebas.
// Calcula todo lo que muestra la pantalla; el cliente solo dibuja. Siempre apoyado en shared/domain.ts.
import {
  addDays,
  countWorkdays,
  dayLabel,
  dayOf,
  diffDays,
  gridDays,
  isWorkday,
  lateDays,
  lateText,
  longDate,
  mondayOf,
  overrunBar,
  placeBar,
  plural,
  shortDate,
  startsIn,
  waitReason,
  workdayIndex,
  missingPrep,
  type ISODate,
  type StatusKind, monogramColors } from "./domain.js";
import type { Project } from "./contracts/projects.js";
import type { Status } from "./contracts/statuses.js";
import type { Company, Team } from "./contracts/equipo.js";
import type { MuralSettings, Notice } from "./contracts/mural.js";

export type MuralInput = {
  projects: Project[];
  statuses: Status[];
  companies: Company[];
  teams: Team[];
  notices: Notice[];
};

// ---------- Tipos del modelo ----------

/** Colores de una empresa: punto, texto y fondo del monograma (MUR-13: solo ahí aparece el color de empresa). */
export type CompanyTint = { code: string; name: string; dot: string; fg: string; bg: string };
export type StatusStyle = { name: string; fg: string; bg: string; dot: string };
export type KpiTone = "ok" | "indigo" | "slate" | "brand";

export type MuralKpi = {
  key: "obra" | "proximos" | "porProgramar" | "terminados";
  n: number;
  label: string;
  sub: string;
  tone: KpiTone;
};

/** Fila de "Instalaciones activas" (MUR-03). */
export type ActiveRow = {
  id: string;
  kind: "en_obra" | "programado";
  name: string;
  company: CompanyTint;
  place: string;
  /** "97.28", o null si no hay kWp o el interruptor está apagado. */
  kwp: string | null;
  priority: boolean;
  /** Etiqueta junto al nombre ("Parte 1" o "Ver aviso"); solo con el interruptor de observaciones. */
  note: string | null;
  status: StatusStyle;
  team: { code: string; name: string } | null;
  dates: string;
  /** Solo "en_obra": avance de la obra. */
  progress: { text: string; endText: string; ratio: number; late: number } | null;
  /** Solo "programado": "Inicia en 3 días". */
  countdown: string | null;
};

export type CalDay = { iso: ISODate; label: string; n: number; today: boolean; saturday: boolean; weekStart: boolean };

/** Barra de un proyecto en el calendario (MUR-04). Las columnas cuentan días laborables desde el lunes `from`. */
export type CalBar = {
  id: string;
  /** Nombre corto para la etiqueta. */
  name: string;
  kind: "obra" | "prog";
  col: number;
  span: number;
  clipStart: boolean;
  clipEnd: boolean;
  /** Columnas ya transcurridas de la barra (relleno más oscuro). */
  done: number;
  /** Tramo de atraso, discontinuo en ámbar. */
  over: { col: number; span: number } | null;
  /** Etiqueta dentro de la barra, o fuera: a la derecha (tras el fin o el atraso) o a la izquierda. */
  inside: boolean;
  labelSide: "right" | "left";
};
export type CalTeam = { id: string; code: string; name: string; bars: CalBar[] };

export type WaitingItem = {
  id: string;
  name: string;
  company: CompanyTint;
  /** "Espera planos y material", "Lista para programar" o el motivo de la pausa. */
  sub: string;
  tone: "wait" | "ready" | "pause";
  priority: boolean;
  /** Días desde la venta, para el timeline. */
  days: number | null;
};

export type MeterItem = { id: string; name: string; place: string; endedOn: string | null; text: string };
export type NoticeLine = { project: string | null; text: string; general: boolean };

export type TimelineRow = {
  id: string;
  team: string;
  name: string;
  priority: boolean;
  dot: string;
  /** Lugar, más "parte 1" y kWp si están activos. */
  place: string;
  when: string;
  whenSub: string;
  late: number;
  bar: { col: number; span: number; clipStart: boolean; clipEnd: boolean; text: string };
  over: { col: number; span: number } | null;
};
export type TimelineGroup = {
  key: "obra" | "prog";
  label: string;
  /** Color del texto y color sólido de la barra, tomados de la lista de estados. */
  fg: string;
  solid: string;
  rows: TimelineRow[];
};

export type MuralModel = {
  today: ISODate;
  /** "Instalaciones · Octubre 2026" */
  subtitle: string;
  kpis: MuralKpi[];
  active: { rows: ActiveRow[]; nObra: number; nProg: number };
  calendar: {
    from: ISODate;
    weeks: number;
    cols: number;
    /** "26 oct – 7 nov · lunes a sábado" */
    rangeLabel: string;
    days: CalDay[];
    /** Columna de hoy (el domingo cae en el sábado, con `todayAtEnd`), o null si queda fuera del rango. */
    todayCol: number | null;
    todayAtEnd: boolean;
    teams: CalTeam[];
  };
  waiting: { show: boolean; items: WaitingItem[]; more: number; nWait: number; nPause: number; text: string };
  meter: { items: MeterItem[] };
  notices: NoticeLine[];
  timeline: {
    weeks: number;
    cols: number;
    weekLabels: string[];
    days: { n: number; today: boolean; saturday: boolean }[];
    todayCol: number | null;
    todayAtEnd: boolean;
    groups: TimelineGroup[];
    counts: { obra: number; prog: number; waiting: number };
  };
};

// ---------- Utilidades ----------

/** Color de empresa → colores del monograma: fondo muy claro y texto oscuro del mismo tono. */
export function companyTint(c: { code: string; name: string; color: string }): CompanyTint {
  // Mismos colores de monograma que la tabla y el móvil (shared/domain.ts).
  const { bg, fg } = monogramColors(c.color);
  return { code: c.code, name: c.name, dot: c.color.toUpperCase(), fg, bg };
}

const UNKNOWN_COMPANY = { code: "··", name: "Sin empresa", color: "#98A2B3" };

/** Nombre corto para las etiquetas del calendario: "Lucía Esther Gómez Paredes" → "Lucía Gómez". */
export function shortName(name: string): string {
  const clean = name.replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim() || name.trim();
  if (clean.length <= 18) return clean;
  const w = clean.split(" ");
  if (w.length >= 4) return `${w[0]} ${w[2]}`;
  if (w.length === 3) return `${w[0]} ${w[1]}`;
  return clean;
}

/** Fin con el que se dibuja y se mide el atraso: sin fecha de fin (o anterior al inicio) vale el día de inicio, como en el móvil (CAL-06, MUR-03). */
const endOf = (p: Project, start: ISODate): ISODate => (p.end_date && p.end_date >= start ? p.end_date : start);

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const WEEKDAY_CAP = (iso: ISODate) => cap(dayLabel(iso).split(" ")[0]);

/** "Jue 29 oct", "19 – 30 oct" o "19 oct – 6 nov" (columna Fechas). */
export function datesLabel(start: ISODate | null, end: ISODate | null): string {
  if (!start) return "Sin fecha";
  if (!end || end === start) return `${WEEKDAY_CAP(start)} ${shortDate(start)}`;
  if (start.slice(0, 7) === end.slice(0, 7)) return `${Number(start.slice(8, 10))} – ${shortDate(end)}`;
  return `${shortDate(start)} – ${shortDate(end)}`;
}

/** "vie 30", o "vie 6 nov" si cae en otro mes que hoy. */
function endDay(end: ISODate, today: ISODate): string {
  return end.slice(0, 7) === today.slice(0, 7) ? dayLabel(end).split(" ").slice(0, 2).join(" ") : dayLabel(end);
}

/** Suma de kWp en décimas, sin errores de coma flotante. */
function sumKwp(list: Project[]): string {
  const cents = list.reduce((s, p) => s + (p.kwp ? Math.round(Number(p.kwp) * 100) : 0), 0);
  return (Math.round(cents / 10) / 10).toFixed(1);
}

const LABEL_PX_PER_CHAR = 12.6;
const LABEL_PAD = 22;
/** Ancho aproximado de la cuadrícula del calendario (px) en el lienzo de 1920, con la letra de 22 px (MUR-01). */
const CAL_GRID_PX = 648;

function statusStyle(statuses: Status[], kind: StatusKind, fallback: StatusStyle): StatusStyle {
  const s = statuses.filter((x) => x.kind === kind).sort((a, b) => a.sort - b.sort)[0];
  return s ? { name: s.name, fg: s.fg, bg: s.bg, dot: s.dot } : fallback;
}

const FALLBACK: Record<StatusKind, StatusStyle> = {
  en_obra: { name: "En obra", fg: "#095C4F", bg: "#E0F4EF", dot: "#0B7A68" },
  programado: { name: "Programado", fg: "#3538CD", bg: "#EEF0FE", dot: "#6172F3" },
  por_programar: { name: "Por programar", fg: "#3F4859", bg: "#EFF1F5", dot: "#8B95A7" },
  en_pausa: { name: "En pausa", fg: "#A11C47", bg: "#FDECF1", dot: "#D63B6A" },
  terminado: { name: "Terminado", fg: "#1F2A3D", bg: "#E8ECF2", dot: "#2B3A55" },
  post_obra: { name: "Esperando medidor", fg: "#155E75", bg: "#E3F1F5", dot: "#0E7490" },
};

/** Cuánto antes de hoy se cuentan los "próximos" en el indicador (MUR-02). */
export const UPCOMING_DAYS = 14;

// ---------- Modelo ----------

export function muralModel(input: MuralInput, settings: MuralSettings, today: ISODate): MuralModel {
  const projects = input.projects.filter((p) => !p.archived);
  const company = new Map(input.companies.map((c) => [c.id, c]));
  const team = new Map(input.teams.map((t) => [t.id, t]));
  const tint = (id: string) => companyTint(company.get(id) ?? UNKNOWN_COMPANY);
  const style = (kind: StatusKind) => statusStyle(input.statuses, kind, FALLBACK[kind]);
  const statusOf = new Map(input.statuses.map((s) => [s.id, s]));
  const styleOf = (p: Project): StatusStyle => {
    const s = statusOf.get(p.status_id);
    return s ? { name: s.name, fg: s.fg, bg: s.bg, dot: s.dot } : style(p.status_kind);
  };

  const byKind = (...kinds: StatusKind[]) => projects.filter((p) => kinds.includes(p.status_kind));
  const monthName = longDate(today).split(" de ")[1];

  // Observaciones visibles de proyectos (AVI-01).
  const observed = (p: Project) =>
    settings.show_notes && p.show_on_mural && p.notes.trim() !== "" && (!p.mural_until || today <= p.mural_until);

  const dateOrder = (a: Project, b: Project) =>
    (a.start_date ?? "9999-12-31").localeCompare(b.start_date ?? "9999-12-31") || a.name.localeCompare(b.name, "es");
  const activeOrder = (a: Project, b: Project) =>
    settings.upcoming_order === "prioridad" ? Number(b.priority) - Number(a.priority) || dateOrder(a, b) : dateOrder(a, b);

  const obra = byKind("en_obra").sort(activeOrder);
  const prog = byKind("programado").sort(activeOrder);
  const waitingProjects = byKind("por_programar", "en_pausa");
  const nPause = waitingProjects.filter((p) => p.status_kind === "en_pausa").length;
  const nWait = waitingProjects.length - nPause;

  // --- Indicadores (MUR-02)
  const horizon = addDays(today, UPCOMING_DAYS);
  // "Próximos": programados que empiezan entre hoy y dentro de 14 días; con el inicio ya pasado no cuentan (MUR-02).
  const upcoming = prog.filter((p) => p.start_date && startsIn(p.start_date, today).days >= 0 && p.start_date <= horizon);
  const finishedMonth = projects.filter((p) => p.actual_end && p.actual_end.slice(0, 7) === today.slice(0, 7));
  const kpis: MuralKpi[] = [
    { key: "obra", n: obra.length, label: "En obra", sub: `${sumKwp(obra)} kWp`, tone: "ok" },
    { key: "proximos", n: upcoming.length, label: "Próximos", sub: "siguientes 2 semanas", tone: "indigo" },
    {
      key: "porProgramar",
      n: waitingProjects.length,
      label: "Por programar",
      sub: nPause ? `incluye ${nPause} en pausa` : "ninguno en pausa",
      tone: "slate",
    },
    { key: "terminados", n: finishedMonth.length, label: "Terminados", sub: `en ${monthName}`, tone: "brand" },
  ];

  // --- Instalaciones activas (MUR-03)
  const notePart = (p: Project) => (settings.show_notes ? p.part.trim() || (observed(p) ? "Ver aviso" : "") : "");
  const rows: ActiveRow[] = [...obra, ...prog].map((p) => {
    const t = p.team_id ? team.get(p.team_id) : undefined;
    const isObra = p.status_kind === "en_obra";
    let progress: ActiveRow["progress"] = null;
    if (isObra && p.start_date) {
      const end = endOf(p, p.start_date);
      const late = lateDays(p.status_kind, end, today);
      const d = dayOf(p.start_date, end, today);
      const endIn = diffDays(today, end);
      const endLabel = endDay(end, today);
      progress = {
        text: late ? lateText(late) : d.text,
        endText: late
          ? `venció ${endLabel}`
          : endIn === 0
              ? "termina hoy"
              : endIn === 1
                ? "termina mañana"
                : `hasta ${endLabel}`,
        ratio: late ? 1 : d.ratio,
        late,
      };
    }
    return {
      id: p.id,
      kind: p.status_kind as ActiveRow["kind"],
      name: p.name,
      company: tint(p.company_id),
      place: p.place,
      kwp: settings.show_kwp && p.kwp ? p.kwp : null,
      priority: settings.show_priority && p.priority,
      note: notePart(p) || null,
      status: styleOf(p),
      team: t ? { code: t.code, name: t.name } : null,
      dates: datesLabel(p.start_date, p.end_date),
      progress,
      countdown: !isObra && p.start_date ? startsIn(p.start_date, today).text : null,
    };
  });

  // --- Calendario por equipo (MUR-04)
  const weeks = settings.weeks;
  const from = mondayOf(today);
  const cols = weeks * 6;
  const colPx = CAL_GRID_PX / cols;
  const LABELS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
  const days: CalDay[] = gridDays(from, weeks).map((iso, i) => ({
    iso,
    label: LABELS[i % 6],
    n: Number(iso.slice(8, 10)),
    today: iso === today,
    saturday: i % 6 === 5,
    weekStart: i > 0 && i % 6 === 0,
  }));
  const todayIdx = workdayIndex(today, from);
  const todayCol = todayIdx >= 0 && todayIdx < cols ? todayIdx : null;
  const sunday = !isWorkday(today);

  const barOf = (p: Project): CalBar | null => {
    if (!p.start_date) return null;
    const isObra = p.status_kind === "en_obra";
    const end = endOf(p, p.start_date);
    const placed = placeBar(p.start_date, end, from, weeks);
    const over = isObra ? overrunBar(end, today, from, weeks) : null;
    if (!placed.visible && !over) return null;
    const col = placed.visible ? placed.col : over!.col;
    const span = placed.visible ? placed.span : 0;
    const name = shortName(p.name);
    const need = name.length * LABEL_PX_PER_CHAR + LABEL_PAD;
    // Con la letra de 22 px una barra de 5 columnas ya no basta en 3 o 4 semanas: solo va dentro si el nombre cabe.
    const inside = span > 0 && need <= span * colPx;
    const lastCol = over ? over.col + over.span - 1 : col + span - 1;
    const roomRight = (cols - 1 - lastCol) * colPx >= need + 10;
    return {
      id: p.id,
      name,
      kind: isObra ? "obra" : "prog",
      col,
      span,
      clipStart: placed.visible ? placed.clipStart : true,
      clipEnd: placed.visible ? placed.clipEnd : false,
      done: isObra && span > 0 ? Math.min(span, Math.max(0, todayIdx - col + 1)) : 0,
      over: over ? { col: over.col, span: over.span } : null,
      inside,
      labelSide: roomRight ? "right" : "left",
    };
  };

  const calendarTeams: CalTeam[] = input.teams
    .filter((t) => t.active)
    .map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      bars: [...obra, ...prog]
        .filter((p) => p.team_id === t.id)
        .sort((a, b) => (a.start_date ?? "").localeCompare(b.start_date ?? "") || a.name.localeCompare(b.name, "es"))
        .map(barOf)
        .filter((b): b is CalBar => !!b),
    }));

  const lastDay = days[days.length - 1].iso;

  // --- Por programar (MUR-05)
  const waitSorted = [...waitingProjects].sort(
    (a, b) =>
      Number(b.priority) - Number(a.priority) ||
      (a.sale_date ?? "9999-12-31").localeCompare(b.sale_date ?? "9999-12-31") ||
      a.name.localeCompare(b.name, "es"),
  );
  const waitingAll: WaitingItem[] = waitSorted.map((p) => {
    const paused = p.status_kind === "en_pausa";
    const missing = missingPrep(p).length > 0;
    return {
      id: p.id,
      name: p.name,
      company: tint(p.company_id),
      sub: paused ? p.pause_reason.trim() || "En pausa" : waitReason(p),
      tone: paused ? "pause" : missing ? "wait" : "ready",
      priority: settings.show_priority && p.priority,
      days: p.sale_date ? Math.max(0, diffDays(p.sale_date, today)) : null,
    };
  });
  const WAITING_MAX = 6;

  // --- Esperando medidor (MUR-06)
  const meter: MeterItem[] = byKind("post_obra")
    .sort((a, b) => (a.actual_end ?? a.end_date ?? "9999").localeCompare(b.actual_end ?? b.end_date ?? "9999") || a.name.localeCompare(b.name, "es"))
    .map((p) => {
      const ended = p.actual_end ?? p.end_date;
      const endedOn = ended ? shortDate(ended) : null;
      return {
        id: p.id,
        name: p.name,
        place: p.place,
        endedOn,
        text: [p.name, p.place, endedOn ? `terminada el ${endedOn}` : ""].filter(Boolean).join(" · "),
      };
    });

  // --- Avisos (AVI-03): generales primero, luego observaciones por prioridad; como mucho 3
  const general: NoticeLine[] = input.notices
    .filter((n) => n.starts_on <= today && today <= n.expires_on)
    .sort((a, b) => a.sort - b.sort || a.starts_on.localeCompare(b.starts_on) || a.text.localeCompare(b.text, "es"))
    .map((n) => ({ project: null, text: n.text, general: true }));
  const observations: NoticeLine[] = projects
    .filter(observed)
    .sort((a, b) => Number(b.priority) - Number(a.priority) || dateOrder(a, b))
    .map((p) => ({ project: p.name, text: p.notes.trim(), general: false }));
  const notices = [...general, ...observations].slice(0, 3);

  // --- Timeline (MUR-08)
  const timelineRow = (p: Project): TimelineRow | null => {
    if (!p.start_date) return null;
    const isObra = p.status_kind === "en_obra";
    const end = endOf(p, p.start_date);
    const placed = placeBar(p.start_date, end, from, weeks);
    const over = isObra ? overrunBar(end, today, from, weeks) : null;
    const t = p.team_id ? team.get(p.team_id) : undefined;
    const late = lateDays(p.status_kind, end, today);
    const endText = endDay(end, today);
    const parts = [
      p.place,
      settings.show_notes && p.part.trim() ? p.part.trim().toLowerCase() : "",
      settings.show_kwp && p.kwp ? `${p.kwp} kWp` : "",
    ].filter(Boolean);
    let when: string;
    let whenSub: string;
    if (isObra) {
      const d = dayOf(p.start_date, end, today);
      const endIn = diffDays(today, end);
      when = late ? lateText(late) : d.text;
      whenSub = late
        ? `venció ${endText}`
        : endIn === 0
          ? "termina hoy"
          : endIn === 1
            ? "termina mañana"
            : `termina ${endText}`;
    } else {
      when = datesLabel(p.start_date, p.start_date);
      whenSub = plural(countWorkdays(p.start_date, end), "día", "días");
    }
    return {
      id: p.id,
      team: t?.code ?? "—",
      name: p.name,
      priority: settings.show_priority && p.priority,
      dot: (company.get(p.company_id) ?? UNKNOWN_COMPANY).color,
      place: parts.join(" · "),
      when,
      whenSub,
      late,
      bar: {
        col: placed.visible ? placed.col : over ? over.col : 0,
        span: placed.visible ? placed.span : 0,
        clipStart: placed.visible ? placed.clipStart : false,
        clipEnd: placed.visible ? placed.clipEnd : false,
        text: isObra && placed.visible && placed.clipStart ? `desde ${shortDate(p.start_date)}` : "",
      },
      over: over ? { col: over.col, span: over.span } : null,
    };
  };
  const group = (key: "obra" | "prog", list: Project[]): TimelineGroup => {
    const st = style(key === "obra" ? "en_obra" : "programado");
    return {
      key,
      label: key === "obra" ? "EN OBRA" : "PRÓXIMOS",
      fg: st.fg,
      solid: st.dot,
      rows: list.map(timelineRow).filter((r): r is TimelineRow => !!r),
    };
  };

  const weekLabels = Array.from({ length: weeks }, (_, w) =>
    w === 0 ? "Esta semana" : w === 1 ? "Próxima semana" : `En ${w} semanas`,
  );

  return {
    today,
    subtitle: `Instalaciones · ${cap(monthName)} ${today.slice(0, 4)}`,
    kpis,
    active: { rows, nObra: obra.length, nProg: prog.length },
    calendar: {
      from,
      weeks,
      cols,
      rangeLabel: `${shortDate(from)} – ${shortDate(lastDay)} · lunes a sábado`,
      days,
      todayCol,
      todayAtEnd: sunday,
      teams: calendarTeams,
    },
    waiting: {
      show: settings.show_waiting,
      items: settings.show_waiting ? waitingAll.slice(0, WAITING_MAX) : [],
      more: settings.show_waiting ? Math.max(0, waitingAll.length - WAITING_MAX) : 0,
      nWait,
      nPause,
      text: `${nWait} en espera · ${nPause} en pausa`,
    },
    meter: { items: meter },
    notices,
    timeline: {
      weeks,
      cols,
      weekLabels,
      days: days.map((d) => ({ n: d.n, today: d.today, saturday: d.saturday })),
      todayCol,
      todayAtEnd: sunday,
      groups: [group("obra", obra), group("prog", prog)],
      counts: { obra: obra.length, prog: prog.length, waiting: waitingProjects.length },
    },
  };
}
