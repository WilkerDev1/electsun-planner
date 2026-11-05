import {
  addDays,
  countWorkdays,
  effectiveRoles,
  lateDays,
  lateText,
  monogramColors,
  plural,
  shortDate,
  weekdayShort,
  type EffectiveRoles,
  type EmployeeState,
  type ISODate,
  type LevelDef,
  type LevelIcon,
} from "../../../shared/domain";
import type { Company, Employee, EmployeeRole, LevelItem, Team } from "../../../shared/contracts/equipo";
import type { Project } from "../../../shared/contracts/projects";

// Presentación de V4EquipoTablas: iconos, colores por nivel y estado, y la obra de cada equipo.

export type Tab = "empleados" | "equipos" | "empresas";
export const TABS: Tab[] = ["empleados", "equipos", "empresas"];

export type EquipoData = {
  employees: Employee[];
  /** Catálogo de niveles (NIV-01), con los inactivos. */
  levels: LevelItem[];
  levelsById: Map<string, LevelDef>;
  teams: Team[];
  companies: Company[];
  /** `null` mientras `GET /api/projects` no responda: la pantalla sigue sin la obra actual. */
  projects: Project[] | null;
};

export const ICON = {
  people: "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 19v-1a4 4 0 0 0-3-3.9M16 3.1a3.5 3.5 0 0 1 0 6.8",
  teams: "M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6",
  companies: "M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M2 21h20M8 7h4M8 11h4M8 15h4",
  search: "m20 20-3.5-3.5",
  plus: "M12 5v14M5 12h14",
  chevron: "m6 9 6 6 6-6",
  pencil: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
};

export const LEVEL_ICON: Record<LevelIcon, string> = {
  shield: "M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  wrench: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1",
  building: ICON.companies,
};

export type LevelStyle = { group: string; icon: string; fg: string; bg: string; border: string; avBg: string; avFg: string };

/** Colores, icono y título de grupo de un nivel del catálogo. El avatar usa los mismos colores (blanco pasa a gris claro). */
export function levelStyle(l: LevelDef | null | undefined): LevelStyle {
  if (!l) return { group: "Sin nivel", icon: ICON.people, fg: "#344054", bg: "#FFFFFF", border: "#EAECF0", avBg: "#F2F4F7", avFg: "#344054" };
  return {
    group: l.group_label,
    icon: LEVEL_ICON[l.icon],
    fg: l.fg,
    bg: l.bg,
    border: l.border,
    avBg: l.bg.toUpperCase() === "#FFFFFF" ? "#F2F4F7" : l.bg,
    avFg: l.fg,
  };
}

/** Roles de una persona resueltos con la fecha de hoy y el catálogo (EQP-01b). */
export const rolesOf = (e: Employee, data: EquipoData, today: ISODate): EffectiveRoles<EmployeeRole> =>
  effectiveRoles(e.roles, data.levelsById, today);

/** Un solo rol vigente, sin fecha de fin y sin cambios programados: el nivel se edita directo en la celda. */
export const isSimple = (eff: EffectiveRoles<EmployeeRole>) =>
  eff.current.length === 1 && eff.future.length === 0 && eff.current[0].ends_on === null;

/** «hasta 15 nov» si el rol principal vence, o «→ E2 el 16 nov» si viene un cambio. `null` si no hay nada que avisar. */
export function roleHint(eff: EffectiveRoles<EmployeeRole>, teams: Team[]): string | null {
  const main = eff.current.find((r) => r.level.active) ?? eff.current[0];
  if (main?.ends_on) return `hasta ${shortDate(main.ends_on)}`;
  const next = eff.future[0];
  if (!next) return null;
  const code = next.team_id ? teams.find((t) => t.id === next.team_id)?.code : undefined;
  return `→ ${code ?? next.level.name} el ${shortDate(next.starts_on)}`;
}

export const STATE_STYLE: Record<EmployeeState, { fg: string; bg: string; presence: string }> = {
  Activo: { fg: "#095C4F", bg: "#E0F4EF", presence: "#12B76A" },
  Vacaciones: { fg: "#B54708", bg: "#FFFAEB", presence: "#F79009" },
  "De baja": { fg: "#475467", bg: "#F2F4F7", presence: "#98A2B3" },
};

/** Fondo y texto del monograma a partir del color de la empresa: la fórmula única de shared/domain.ts. */
export const monogram = monogramColors;

// ---------- Obra de cada equipo (EQP-03, CAL-02) ----------

export type Agenda = {
  now: { name: string; sub: string; late: boolean } | null;
  next: { name: string; when: string } | null;
};

const untilLabel = (end: ISODate | null, today: ISODate) => {
  if (!end) return "";
  if (end === today) return "termina hoy";
  if (end === addDays(today, 1)) return "termina mañana";
  const sameMonth = end.slice(0, 7) === today.slice(0, 7);
  const parts = shortDate(end).split(" ");
  return `hasta ${weekdayShort(end)} ${parts[0]}${sameMonth ? "" : " " + parts[1]}`;
};

/** La obra de hoy y la siguiente de un equipo. `null` si los proyectos aún no están disponibles. */
export function teamAgenda(teamId: string, projects: Project[] | null, today: ISODate): Agenda | null {
  if (!projects) return null;
  const mine = projects.filter((p) => p.team_id === teamId && !p.archived);
  const byStart = (a: Project, b: Project) => (a.start_date ?? "9999").localeCompare(b.start_date ?? "9999");
  const current = mine.filter((p) => p.status_kind === "en_obra").sort(byStart)[0];
  const upcoming = mine.filter((p) => p.status_kind === "programado" && p.start_date).sort(byStart)[0];
  const late = current ? lateDays(current.status_kind, current.end_date, today) : 0;
  return {
    now: current
      ? {
          name: current.name,
          late: late > 0,
          sub: [current.place, late ? lateText(late) : untilLabel(current.end_date, today)].filter(Boolean).join(" · "),
        }
      : null,
    next: upcoming
      ? {
          name: upcoming.name,
          when: `${weekdayShort(upcoming.start_date!)} ${shortDate(upcoming.start_date!)} · ${plural(
            countWorkdays(upcoming.start_date!, upcoming.end_date ?? upcoming.start_date!),
            "día",
            "días",
          )}${upcoming.part ? " · " + upcoming.part.toLowerCase() : ""}`,
        }
      : null,
  };
}

/** "Dónde está hoy" de un empleado (columna de la tabla de Empleados). */
export function whereToday(e: Employee, data: EquipoData, today: ISODate) {
  const quiet = "#667085";
  if (e.state === "De baja") return { text: "Fuera de la empresa", sub: "Sin acceso móvil", fg: quiet };
  if (e.state === "Vacaciones") return { text: "De vacaciones", sub: "No cuenta para su equipo", fg: "#B54708" };
  const eff = rolesOf(e, data, today);
  if (eff.perms.is_supervisor) {
    const active = data.teams.filter((t) => t.active);
    const busy = data.projects ? active.filter((t) => teamAgenda(t.id, data.projects, today)?.now) : active;
    return {
      text: `Recorre ${data.projects ? plural(busy.length, "obra", "obras") : plural(busy.length, "equipo", "equipos")}`,
      sub: busy.map((t) => t.code).join(" · ") || "Sin obras hoy",
      fg: "#344054",
    };
  }
  const team = data.teams.find((t) => t.id === e.team_id);
  if (team) {
    const agenda = teamAgenda(team.id, data.projects, today);
    if (!agenda) return { text: `Equipo ${team.code}`, sub: team.name, fg: "#344054" };
    if (agenda.now) return { text: agenda.now.name, sub: agenda.now.sub, fg: agenda.now.late ? "#B54708" : "#095C4F" };
    return { text: "Sin obra hoy", sub: agenda.next ? `Sigue ${agenda.next.name}` : "Equipo libre", fg: quiet };
  }
  if (eff.perms.is_field) return { text: "Sin equipo", sub: "Asígnalo a un equipo", fg: quiet };
  return { text: "Oficina", sub: "En la oficina", fg: "#344054" };
}

/** Obras por empresa para la tabla de Empresas: activas, por programar y total (sin archivadas). */
export function companyCounts(c: Company, projects: Project[] | null) {
  if (!projects) return { active: null, waiting: null, total: c.project_count };
  const mine = projects.filter((p) => p.company_id === c.id && !p.archived);
  return {
    active: mine.filter((p) => p.status_kind === "programado" || p.status_kind === "en_obra").length,
    waiting: mine.filter((p) => p.status_kind === "por_programar" || p.status_kind === "en_pausa").length,
    total: mine.length,
  };
}


/** Lo que cada pestaña recibe de la pantalla: datos, búsqueda y cómo guardar con aviso y recarga. */
export type TabProps = {
  data: EquipoData;
  today: ISODate;
  query: string;
  /** Ejecuta una escritura; recarga y avisa. Devuelve `null` si falló (el error ya se mostró). */
  save: <T>(fn: () => Promise<T>, ok: string) => Promise<T | null>;
  /** Para los diálogos: recarga los datos y muestra el aviso tras guardar. */
  done: (message: string) => Promise<void>;
  reload: () => Promise<void>;
};
