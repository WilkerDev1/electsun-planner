// Modelo de la vista móvil (CAL-09, GET /api/view/movil). Lo calcula `mobileModel` en shared/movil-model.ts
// y lo pintan las pantallas de src/movil. Solo contiene lo que el empleado puede ver (MOV-08).
import type { EmployeeState, ISODate, Level } from "../domain.js";
import type { CompanyPattern } from "../pattern.js";

export type MovilCompany = {
  name: string;
  code: string;
  color: string;
  /** Patrón del color (EQP-08). */
  pattern: CompanyPattern;
  /** Logotipo de la empresa, que sustituye al monograma (EQP-07); null si no tiene. */
  logo_url: string | null;
};

/** Persona de un equipo. `phone` solo viene para quien el empleado puede llamar (MOV-08). */
export type MovilPerson = {
  id: string;
  name: string;
  initials: string;
  level: Level;
  /** Todos los niveles vigentes hoy, el principal primero (EQP-01b). */
  level_names?: Level[];
  state: EmployeeState;
  is_lead: boolean;
  is_me: boolean;
  phone: string | null;
};

export type MovilTeam = {
  id: string;
  code: string;
  name: string;
  members: MovilPerson[];
};

export type MovilContact = { name: string; phone: string | null };

/** Obra en una lista (Hoy, Obras, Calendario). */
export type MovilJob = {
  id: string;
  name: string;
  company: MovilCompany;
  place: string;
  kwp: string | null;
  team_code: string | null;
  /** Es de mi equipo. */
  mine: boolean;
  priority: boolean;
  kind: "en_obra" | "programado";
  /** "Instalando" para obras en curso; el nombre del estado para las programadas. */
  status_label: string;
  /** Texto corto de la fase ("Parte 1"), o vacío. */
  part: string;
  start_date: ISODate;
  end_date: ISODate;
  /** "19 – 30 oct", "30 oct – 2 nov" o "Jue 29 oct". */
  dates_text: string;
  days_total: number;
  /** "11 días". */
  duration_text: string;
  /** Día en curso (1…N) si la obra ya empezó. */
  day: number | null;
  /** Días laborables de atraso (CAL-06); 0 si va a tiempo. */
  late_days: number;
  /** "Día 8 de 11", "Atrasada · +1 día" o "Inicia mañana". */
  when_text: string;
  /** "hasta el vie 30", "termina hoy", "debía terminar el lun 26"; vacío si todavía no empieza. */
  end_text: string;
  /** Avance 0…1 (1 si va atrasada). */
  progress: number;
};

export type SegmentState = "done" | "today" | "todo";

export type MovilPrepItem = { code: string; name: string; done: boolean; applies: boolean };

export type MovilDetail = MovilJob & {
  /** Un bloque por día laborable de la obra. */
  segments: SegmentState[];
  start_text: string;
  end_text_long: string;
  /** Observación de la oficina. */
  notes: string;
  /** Preparación pendiente: "Espera planos y material", o "Lista". */
  prep_text: string;
  prep_ready: boolean;
  /** Parámetros de preparación que lleva la obra; `applies: false` se muestra apagado y no cuenta como pendiente. */
  prep: MovilPrepItem[];
  /** Enlace a Google Maps con el lugar; null si no hay lugar. */
  map_url: string | null;
  lead: MovilContact | null;
  supervisor: MovilContact | null;
  team: MovilTeam | null;
};

export type WeekDayState = "obra" | "programado" | "libre";

export type MovilDay = {
  date: ISODate;
  /** "LUN" … "SÁB" */
  dow: string;
  day: number;
  is_today: boolean;
  is_past: boolean;
};

export type AgendaItem = {
  id: string;
  name: string;
  team_code: string | null;
  mine: boolean;
  kind: "en_obra" | "programado";
  /** Lugar y fase: "La Romana · Parte 1". */
  sub: string;
  /** "Día 3/11", "1 día" o "Atrasada". */
  tag: string;
  tone: "obra" | "programado" | "atrasada";
};

export type AgendaDay = MovilDay & { items: AgendaItem[] };

export type TimelineBar = {
  id: string;
  name: string;
  kind: "en_obra" | "programado";
  dates_text: string;
  /** Columna (día laborable) donde empieza y cuántas ocupa, dentro de `timeline.days`. */
  col: number;
  span: number;
  clip_start: boolean;
  clip_end: boolean;
  /** Columnas ya trabajadas (hasta hoy). */
  done_cols: number;
  /** Tramo de atraso, desde el día siguiente al fin previsto hasta hoy. */
  overrun: { col: number; span: number } | null;
};

export type TimelineLane = {
  team_id: string;
  team_code: string;
  mine: boolean;
  bars: TimelineBar[];
};

export type MovilNotice = { title: string; text: string };

export type MovilView = {
  today: ISODate;
  /** "Martes 27 de octubre" */
  date_text: string;
  me: {
    id: string;
    name: string;
    first_name: string;
    initials: string;
    level: Level;
    team_id: string | null;
    team_code: string | null;
  };
  /** Mi equipo, con encargado e integrantes; null si no tiene. */
  team: (MovilTeam & { lead: MovilPerson | null }) | null;
  hoy: {
    /** La obra de mi equipo hoy. */
    current: MovilDetail | null;
    /** Lunes a sábado de esta semana. */
    week: (MovilDay & { state: WeekDayState })[];
    next: MovilJob[];
    notices: MovilNotice[];
  };
  obras: {
    en_obra: MovilJob[];
    proximas: MovilJob[];
    por_programar: number;
    en_pausa: number;
  };
  calendario: {
    agenda: AgendaDay[];
    timeline: {
      from: ISODate;
      weeks: number;
      days: MovilDay[];
      /** Índice de la columna de hoy en `days`. */
      today_col: number;
      lanes: TimelineLane[];
    };
    teams: { id: string; code: string; mine: boolean }[];
  };
  /** Detalle de cada obra en curso o programada, por id (MOV-05). */
  detail: Record<string, MovilDetail>;
};
