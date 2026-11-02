import {
  addDays,
  countWorkdays,
  lateDays,
  lateText,
  plural,
  shortDate,
  weekdayShort,
  type EmployeeState,
  type ISODate,
  type Level,
} from "../../../shared/domain";
import type { Company, Employee, Team } from "../../../shared/contracts/equipo";
import type { Project } from "../../../shared/contracts/projects";

// Presentación de V4EquipoTablas: iconos, colores por nivel y estado, y la obra de cada equipo.

export type Tab = "empleados" | "equipos" | "empresas";
export const TABS: Tab[] = ["empleados", "equipos", "empresas"];

export type EquipoData = {
  employees: Employee[];
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

export const LEVEL_STYLE: Record<
  Level,
  { group: string; icon: string; fg: string; bg: string; border: string; avBg: string; avFg: string }
> = {
  Supervisor: { group: "Supervisión", icon: "M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z", fg: "#1F2A3D", bg: "#E8ECF2", border: "#D5DBE5", avBg: "#1F2A3D", avFg: "#FFFFFF" },
  Encargado: { group: "Encargados de equipo", icon: "M5 21V4M5 4h11l-2 4 2 4H5", fg: "#3538CD", bg: "#EEF0FE", border: "#DCE0FC", avBg: "#EEF0FE", avFg: "#3538CD" },
  Técnico: { group: "Técnicos", icon: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z", fg: "#344054", bg: "#FFFFFF", border: "#EAECF0", avBg: "#F2F4F7", avFg: "#344054" },
  Ayudante: { group: "Ayudantes", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1", fg: "#344054", bg: "#FFFFFF", border: "#EAECF0", avBg: "#F2F4F7", avFg: "#344054" },
  Oficina: { group: "Oficina", icon: ICON.companies, fg: "#344054", bg: "#FFFFFF", border: "#EAECF0", avBg: "#FFF1E7", avFg: "#9A3412" },
};

export const STATE_STYLE: Record<EmployeeState, { fg: string; bg: string; presence: string }> = {
  Activo: { fg: "#095C4F", bg: "#E0F4EF", presence: "#12B76A" },
  Vacaciones: { fg: "#B54708", bg: "#FFFAEB", presence: "#F79009" },
  "De baja": { fg: "#475467", bg: "#F2F4F7", presence: "#98A2B3" },
};

const mix = (hex: string, target: number, amount: number) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return "#" + c.map((v) => Math.round(v + (target - v) * amount).toString(16).padStart(2, "0")).join("");
};
/** Fondo y texto del monograma a partir del color de la empresa (como las parejas de V4EquipoTablas). */
export const monogram = (color: string) => ({ bg: mix(color, 255, 0.86), fg: mix(color, 0, 0.4) });

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
  if (e.level === "Supervisor") {
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
  if (e.level !== "Oficina") return { text: "Sin equipo", sub: "Asígnalo a un equipo", fg: quiet };
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
