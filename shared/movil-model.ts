// Modelo de la vista móvil (CAL-09). Función pura: la usan GET /api/view/movil y las pruebas.
// Todo el cálculo de fechas, atraso y preparación sale de shared/domain.ts (CONVENCIONES).
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
  shortDate,
  startsIn,
  initials,
  effectiveEnd,
  waitReason,
  missingPrep,
  weekdayShort,
  workdayIndex,
  LEVELS,
  type EmployeeState,
  type ISODate,
  type Level,
  type StatusKind,
  type SystemType,
} from "./domain.js";
import type {
  AgendaDay,
  AgendaItem,
  MovilContact,
  MovilDay,
  MovilDetail,
  MovilJob,
  MovilNotice,
  MovilPerson,
  MovilView,
  SegmentState,
  TimelineBar,
  TimelineLane,
  WeekDayState,
} from "./contracts/movil.js";

export type MobileEmployee = {
  id: string;
  name: string;
  job: string;
  level: Level;
  team_id: string | null;
  state: EmployeeState;
  phone: string;
};
export type MobileTeam = { id: string; code: string; name: string; lead_employee_id: string | null; active: boolean };
export type MobileCompany = { id: string; name: string; code: string; color: string };
export type MobileStatus = { id: string; name: string; kind: StatusKind };
export type MobileProject = {
  id: string;
  company_id: string;
  name: string;
  kwp: string | null;
  place: string;
  lead_employee_id: string | null;
  team_id: string | null;
  start_date: ISODate | null;
  end_date: ISODate | null;
  status_id: string;
  status_kind: StatusKind;
  notes: string;
  show_on_mural: boolean;
  mural_until: ISODate | null;
  priority: boolean;
  part: string;
  system_type: SystemType;
  prep_plans: boolean;
  prep_materials: boolean;
  prep_ede: boolean;
  archived: boolean;
};
export type MobileNotice = { id: string; text: string; starts_on: ISODate; expires_on: ISODate; sort: number };

export type MobileInput = {
  employees: MobileEmployee[];
  teams: MobileTeam[];
  companies: MobileCompany[];
  statuses: MobileStatus[];
  projects: MobileProject[];
  notices: MobileNotice[];
};

const WEEKS_AGENDA = 3;
const WEEKS_TIMELINE = 3;
const MAX_SEGMENTS = 130;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const dayNumber = (iso: ISODate) => Number(iso.slice(8, 10));
/** "Jue 29 oct", "19 – 30 oct" o "30 oct – 2 nov". */
function datesText(start: ISODate, end: ISODate): string {
  if (start === end) return cap(dayLabel(start));
  if (start.slice(0, 7) === end.slice(0, 7)) return `${dayNumber(start)} – ${shortDate(end)}`;
  return `${shortDate(start)} – ${shortDate(end)}`;
}

/** URL de Google Maps con el lugar (MOV-02, MOV-05). */
export const mapsUrl = (place: string): string | null =>
  place.trim()
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.trim()}, República Dominicana`)}`
    : null;

const levelRank = (l: Level) => LEVELS.indexOf(l);

/**
 * Qué ve un empleado (CAL-09). Solo se incluyen teléfonos de su equipo y del encargado y el supervisor de cada obra (MOV-08);
 * nunca correos ni datos de cuentas (la entrada ni siquiera los recibe).
 */
export function mobileModel(input: MobileInput, employeeId: string, today: ISODate): MovilView {
  const found = input.employees.find((e) => e.id === employeeId);
  if (!found) throw new Error("El empleado no existe.");
  const me: MobileEmployee = found;
  const teamById = new Map(input.teams.map((t) => [t.id, t]));
  const employeeById = new Map(input.employees.map((e) => [e.id, e]));
  const companyById = new Map(input.companies.map((c) => [c.id, c]));
  const statusById = new Map(input.statuses.map((s) => [s.id, s]));
  const myTeam = me.team_id ? (teamById.get(me.team_id) ?? null) : null;

  // ---------- Personas y teléfonos (MOV-08) ----------

  const phoneOf = (e: MobileEmployee): string | null => (e.phone.trim() && e.state === "Activo" ? e.phone.trim() : null);

  /** `callable`: la persona está en mi equipo o es encargado o supervisor de una obra. */
  const person = (e: MobileEmployee, leadId: string | null, callable: boolean): MovilPerson => ({
    id: e.id,
    name: e.name,
    initials: initials(e.name),
    level: e.level,
    state: e.state,
    is_lead: e.id === leadId,
    is_me: e.id === me.id,
    phone: callable && e.id !== me.id ? phoneOf(e) : null,
  });

  /** Integrantes de un equipo (sin los dados de baja), con el encargado primero. */
  function membersOf(team: MobileTeam, mineTeam: boolean): MovilPerson[] {
    const people = input.employees.filter((e) => e.team_id === team.id && e.state !== "De baja");
    const lead = team.lead_employee_id ? employeeById.get(team.lead_employee_id) : undefined;
    if (lead && lead.state !== "De baja" && !people.some((e) => e.id === lead.id)) people.push(lead);
    return people
      .map((e) => person(e, team.lead_employee_id, mineTeam || e.id === team.lead_employee_id))
      .sort(
        (a, b) =>
          Number(b.is_lead) - Number(a.is_lead) || levelRank(a.level) - levelRank(b.level) || a.name.localeCompare(b.name, "es"),
      );
  }

  const supervisor = input.employees
    .filter((e) => e.level === "Supervisor" && e.state !== "De baja")
    .sort((a, b) => a.name.localeCompare(b.name, "es"))[0];

  // ---------- Obras ----------

  const live = input.projects.filter(
    (p): p is MobileProject & { start_date: ISODate; status_kind: "en_obra" | "programado" } =>
      !p.archived && !!p.start_date && (p.status_kind === "en_obra" || p.status_kind === "programado"),
  );

  function job(p: (typeof live)[number]): MovilJob {
    const start = p.start_date;
    const end = effectiveEnd({ start_date: start, end_date: p.end_date });
    const total = countWorkdays(start, end);
    const late = lateDays(p.status_kind, end, today);
    const started = p.status_kind === "en_obra" && start <= today;
    const progress = started ? dayOf(start, end, today) : null;
    const company = companyById.get(p.company_id);
    const endIn = diffDays(today, end);
    const wd = (iso: ISODate) => `${weekdayShort(iso)} ${dayNumber(iso)}`;
    let when: string;
    if (started) when = late ? lateText(late) : progress!.text;
    else if (start >= today) when = startsIn(start, today).text;
    else when = `Debía iniciar el ${wd(start)}`;
    let endText = "";
    if (started) endText = late ? `debía terminar el ${wd(end)}` : endIn === 0 ? "termina hoy" : endIn === 1 ? "termina mañana" : `hasta el ${wd(end)}`;
    return {
      id: p.id,
      name: p.name,
      company: { name: company?.name ?? "", code: company?.code ?? "", color: company?.color ?? "#667085" },
      place: p.place,
      kwp: p.kwp,
      team_code: p.team_id ? (teamById.get(p.team_id)?.code ?? null) : null,
      mine: !!me.team_id && p.team_id === me.team_id,
      priority: p.priority,
      kind: p.status_kind,
      status_label: p.status_kind === "en_obra" ? "Instalando" : (statusById.get(p.status_id)?.name ?? "Programado"),
      part: p.part,
      start_date: start,
      end_date: end,
      dates_text: datesText(start, end),
      days_total: total,
      duration_text: `${total} ${total === 1 ? "día" : "días"}`,
      day: progress ? progress.day : null,
      late_days: late,
      when_text: when,
      end_text: endText,
      progress: late ? 1 : progress ? progress.ratio : 0,
    };
  }

  const jobs = live.map((p) => ({ p, j: job(p) }));

  function segments(j: MovilJob): SegmentState[] {
    const out: SegmentState[] = [];
    for (let d = j.start_date; d <= j.end_date && out.length < MAX_SEGMENTS; d = addDays(d, 1)) {
      if (!isWorkday(d)) continue;
      out.push(j.kind === "en_obra" && d < today ? "done" : j.kind === "en_obra" && d === today ? "today" : "todo");
    }
    return out;
  }

  function contact(e: MobileEmployee | undefined): MovilContact | null {
    return e ? { name: e.name, phone: phoneOf(e) } : null;
  }

  function detail(p: (typeof live)[number], j: MovilJob): MovilDetail {
    const team = p.team_id ? teamById.get(p.team_id) : undefined;
    const lead = (p.lead_employee_id ? employeeById.get(p.lead_employee_id) : undefined) ??
      (team?.lead_employee_id ? employeeById.get(team.lead_employee_id) : undefined);
    const missing = missingPrep(p);
    return {
      ...j,
      segments: segments(j),
      start_text: cap(dayLabel(j.start_date)),
      end_text_long: cap(dayLabel(j.end_date)),
      notes: p.notes,
      prep_text: missing.length ? waitReason(p) : "Lista",
      prep_ready: !missing.length,
      map_url: mapsUrl(p.place),
      lead: contact(lead),
      supervisor: supervisor && supervisor.id !== lead?.id ? contact(supervisor) : null,
      team: team
        ? { id: team.id, code: team.code, name: team.name, members: membersOf(team, team.id === me.team_id) }
        : null,
    };
  }

  const detailById: Record<string, MovilDetail> = {};
  for (const { p, j } of jobs) detailById[p.id] = detail(p, j);

  const byStart = (a: MovilJob, b: MovilJob) =>
    a.start_date.localeCompare(b.start_date) || (a.team_code ?? "").localeCompare(b.team_code ?? "") || a.name.localeCompare(b.name, "es");
  const mineFirst = (a: MovilJob, b: MovilJob) => Number(b.mine) - Number(a.mine) || byStart(a, b);

  // ---------- Hoy (MOV-02) ----------

  const teamJobs = jobs.filter((x) => x.j.mine).map((x) => x.j);
  const covers = (j: MovilJob, d: ISODate) => j.start_date <= d && d <= (j.late_days ? today : j.end_date);
  const current =
    teamJobs.filter((j) => j.kind === "en_obra" && j.start_date <= today).sort(byStart)[0] ??
    teamJobs.filter((j) => j.kind === "programado" && covers(j, today)).sort(byStart)[0] ??
    null;

  const monday = mondayOf(today);
  const dayInfo = (date: ISODate): MovilDay => ({
    date,
    dow: weekdayShort(date).toUpperCase(),
    day: dayNumber(date),
    is_today: date === today,
    is_past: date < today,
  });

  const week = gridDays(monday, 1).map((date) => {
    const here = teamJobs.filter((j) => covers(j, date));
    const state: WeekDayState = here.some((j) => j.kind === "en_obra") ? "obra" : here.length ? "programado" : "libre";
    return { ...dayInfo(date), state };
  });

  const notices: MovilNotice[] = [
    ...input.notices
      .filter((n) => n.starts_on <= today && today <= n.expires_on)
      .sort((a, b) => a.sort - b.sort)
      .map((n) => ({ title: "Aviso general", text: n.text })),
    ...jobs
      .filter(({ p, j }) => j.mine && p.show_on_mural && p.notes.trim() && (p.mural_until === null || today <= p.mural_until))
      .map(({ p }) => ({ title: p.name, text: p.notes.trim() })),
  ];

  // ---------- Equipo ----------

  const teamView = myTeam
    ? (() => {
        const members = membersOf(myTeam, true);
        return { id: myTeam.id, code: myTeam.code, name: myTeam.name, members, lead: members.find((m) => m.is_lead) ?? null };
      })()
    : null;

  // ---------- Obras (MOV-03) ----------

  const allJobs = jobs.map((x) => x.j);
  const countKind = (k: StatusKind) => input.projects.filter((p) => !p.archived && p.status_kind === k).length;

  // ---------- Calendario (MOV-04) ----------

  const agendaDays = gridDays(monday, WEEKS_AGENDA);
  const agenda: AgendaDay[] = agendaDays.map((date) => {
    const items: AgendaItem[] = allJobs
      .filter((j) => covers(j, date))
      .sort((a, b) => Number(b.mine) - Number(a.mine) || (a.team_code ?? "").localeCompare(b.team_code ?? "") || a.name.localeCompare(b.name, "es"))
      .map((j) => {
        const late = date > j.end_date;
        const nth = countWorkdays(j.start_date, date);
        const tag = late ? "Atrasada" : j.kind === "en_obra" || j.days_total > 1 ? `Día ${nth}/${j.days_total}` : "1 día";
        return {
          id: j.id,
          name: j.name,
          team_code: j.team_code,
          mine: j.mine,
          kind: j.kind,
          sub: [j.place, j.part].filter(Boolean).join(" · "),
          tag,
          tone: late ? ("atrasada" as const) : j.kind === "en_obra" ? ("obra" as const) : ("programado" as const),
        };
      });
    return { ...dayInfo(date), items };
  });

  const from = addDays(monday, -7);
  const todayCol = Math.max(0, workdayIndex(today, from));
  const lanes: TimelineLane[] = input.teams
    .filter((t) => t.active)
    .map((t) => {
      const bars: TimelineBar[] = [];
      for (const j of allJobs.filter((x) => x.team_code === t.code).sort(byStart)) {
        const bar = placeBar(j.start_date, j.end_date, from, WEEKS_TIMELINE);
        // El tramo de atraso se calcula antes de descartar: la obra puede haber terminado fuera de la ventana y seguir atrasada.
        const over = j.late_days ? overrunBar(j.end_date, today, from, WEEKS_TIMELINE) : null;
        if (!bar.visible && !over) continue;
        bars.push({
          id: j.id,
          name: j.name,
          kind: j.kind,
          dates_text: j.dates_text,
          // Barra planificada fuera de la ventana: ancho 0, pegada al tramo de atraso.
          col: bar.visible ? bar.col : over!.col,
          span: bar.visible ? bar.span : 0,
          clip_start: bar.clipStart,
          clip_end: bar.clipEnd,
          done_cols: j.kind === "en_obra" ? Math.min(bar.span, Math.max(0, todayCol - bar.col + 1)) : 0,
          overrun: over ? { col: over.col, span: over.span } : null,
        });
      }
      return { team_id: t.id, team_code: t.code, mine: t.id === me.team_id, bars };
    });

  return {
    today,
    date_text: longDate(today),
    me: {
      id: me.id,
      name: me.name,
      first_name: me.name.split(" ")[0],
      initials: initials(me.name),
      level: me.level,
      team_id: me.team_id,
      team_code: myTeam?.code ?? null,
    },
    team: teamView,
    hoy: {
      current: current ? detailById[current.id] : null,
      week,
      next: teamJobs.filter((j) => j.kind === "programado" && j.start_date >= today && j.id !== current?.id).sort(byStart),
      notices,
    },
    obras: {
      en_obra: allJobs.filter((j) => j.kind === "en_obra").sort(mineFirst),
      proximas: allJobs.filter((j) => j.kind === "programado").sort(mineFirst),
      por_programar: countKind("por_programar"),
      en_pausa: countKind("en_pausa"),
    },
    calendario: {
      agenda,
      timeline: { from, weeks: WEEKS_TIMELINE, days: gridDays(from, WEEKS_TIMELINE).map(dayInfo), today_col: todayCol, lanes },
      teams: input.teams.filter((t) => t.active).map((t) => ({ id: t.id, code: t.code, mine: t.id === me.team_id })),
    },
    detail: detailById,
  };
}
