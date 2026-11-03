// Reglas compartidas por servidor, administración, mural y móvil (REQUISITOS §5 CAL y §4.3 VAL).
// Sin dependencias: fechas como texto ISO "aaaa-mm-dd" y aritmética en UTC para evitar saltos de horario.

export type ISODate = string;

export const TZ = "America/Santo_Domingo";

export const STATUS_KINDS = [
  "por_programar",
  "programado",
  "en_obra",
  "en_pausa",
  "terminado",
  "post_obra",
] as const;
export type StatusKind = (typeof STATUS_KINDS)[number];

/** Tipos que cuentan como obra activa y ocupan al equipo (EST-02). */
export const BUSY_KINDS: readonly StatusKind[] = ["programado", "en_obra"];

export const LEVELS = [
  "Supervisor",
  "Encargado",
  "Técnico",
  "Ayudante",
  "Oficina",
] as const;
export type Level = (typeof LEVELS)[number];

export const EMPLOYEE_STATES = ["Activo", "Vacaciones", "De baja"] as const;
export type EmployeeState = (typeof EMPLOYEE_STATES)[number];

export const SYSTEM_TYPES = ["neta", "hibrido"] as const;
export type SystemType = (typeof SYSTEM_TYPES)[number];

export const BRAND = "#EA6A1F";
export const TODAY_LINE = "#C2410C";

const DAY = 86_400_000;
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const WEEKDAYS_LONG = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS_LONG = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// ---------- Fechas ----------

export const isISODate = (v: unknown): v is ISODate =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && fromDays(toDays(v)) === v;

export function toDays(iso: ISODate): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY;
}

export const fromDays = (n: number): ISODate => new Date(n * DAY).toISOString().slice(0, 10);

export const addDays = (iso: ISODate, n: number): ISODate => fromDays(toDays(iso) + n);

export const diffDays = (a: ISODate, b: ISODate): number => toDays(b) - toDays(a);

/** 0 = domingo … 6 = sábado. */
export const weekday = (iso: ISODate): number => new Date(toDays(iso) * DAY).getUTCDay();

/** Lunes a sábado (CAL-01). */
export const isWorkday = (iso: ISODate): boolean => weekday(iso) !== 0;

export function mondayOf(iso: ISODate): ISODate {
  const w = weekday(iso);
  return addDays(iso, w === 0 ? -6 : 1 - w);
}

/** Fecha de hoy en la zona de la empresa. `override` permite fijar el día en demos y pruebas. */
export function todayIn(tz = TZ, now = new Date(), override?: string | null): ISODate {
  if (override && isISODate(override)) return override;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Índice de día laborable respecto de un lunes `base`. El domingo comparte índice con el sábado (CAL-01). */
export function workdayIndex(d: ISODate, base: ISODate): number {
  const days = diffDays(base, d);
  const w = Math.floor(days / 7);
  return w * 6 + Math.min(days - w * 7, 5);
}

/** Días laborables en el intervalo cerrado [a, b] (CAL-02). */
export function countWorkdays(a: ISODate, b: ISODate): number {
  if (b < a) return 0;
  const base = mondayOf(a);
  return workdayIndex(b, base) - workdayIndex(a, base) + (isWorkday(a) ? 1 : 0);
}

/** El día laborable número `n`, contando `start` como el día 1 (CAL-05). */
export function addWorkdays(start: ISODate, n: number): ISODate {
  let d = isWorkday(start) ? start : addDays(start, 1);
  let left = Math.max(1, Math.floor(n)) - 1;
  while (left > 0) {
    d = addDays(d, 1);
    if (isWorkday(d)) left--;
  }
  return d;
}

export const estimatedEnd = (start: ISODate, days: number): ISODate => addWorkdays(start, days);

// ---------- Textos ----------

export const shortDate = (iso: ISODate): string =>
  `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

/** "vie 30 oct" */
export const dayLabel = (iso: ISODate): string => `${WEEKDAYS[weekday(iso)]} ${shortDate(iso)}`;

export const weekdayShort = (iso: ISODate): string => WEEKDAYS[weekday(iso)];

/** "Martes 27 de octubre" */
export function longDate(iso: ISODate): string {
  const s = `${WEEKDAYS_LONG[weekday(iso)]} ${Number(iso.slice(8, 10))} de ${MONTHS_LONG[Number(iso.slice(5, 7)) - 1]}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function rangeLabel(start: ISODate | null, end: ISODate | null): string {
  if (!start) return "";
  if (!end || end === start) return shortDate(start);
  return `${shortDate(start)} – ${shortDate(end)}`;
}

/** "planos, material y EDE" */
export function joinEs(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/** Iniciales de un nombre: las dos primeras palabras, sin "Sr.". */
export const initials = (name: string) =>
  name.replace(/^Sr\.\s*/, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

/** Fondo claro y texto oscuro del mismo tono para el monograma de una empresa (MUR-13). Una sola fórmula para todas las vistas. */
export function monogramColors(hex: string | null | undefined): { bg: string; fg: string } {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return { bg: "#F2F4F7", fg: "#475467" };
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const mix = (to: number, t: number) =>
    "#" + rgb.map((v) => Math.round(v + (to - v) * t).toString(16).padStart(2, "0")).join("").toUpperCase();
  return { bg: mix(255, 0.87), fg: mix(0, 0.42) };
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// ---------- Progreso y atraso ----------

/** "Día X de N" para una obra en curso (CAL-02). */
export function dayOf(start: ISODate, end: ISODate | null, today: ISODate) {
  const total = countWorkdays(start, end ?? start);
  const day = Math.min(countWorkdays(start, today), Math.max(total, 1));
  return { day, total, text: `Día ${day} de ${total}`, ratio: total ? Math.min(1, day / total) : 0 };
}

/** Días naturales hasta el inicio, como en el mural: "Inicia hoy", "Inicia mañana", "Inicia en N días". */
export function startsIn(start: ISODate, today: ISODate) {
  const days = diffDays(today, start);
  const text =
    days < 0
      ? `Debía iniciar el ${dayLabel(start)}`
      : days === 0
        ? "Inicia hoy"
        : days === 1
          ? "Inicia mañana"
          : `Inicia en ${days} días`;
  return { days, text };
}

/**
 * Fin que usan todas las vistas (VAL-01): el fin previsto o, en datos antiguos sin fin, el día de inicio.
 * Un fin anterior al inicio no es válido y también cuenta como el inicio.
 */
export function effectiveEnd(p: { start_date: ISODate; end_date: ISODate | null }): ISODate {
  return p.end_date && p.end_date >= p.start_date ? p.end_date : p.start_date;
}

/** Días laborables de atraso: obra "en_obra" cuyo fin previsto ya pasó (CAL-06). */
export function lateDays(kind: StatusKind, end: ISODate | null, today: ISODate): number {
  if (kind !== "en_obra" || !end || end >= today) return 0;
  return countWorkdays(addDays(end, 1), today);
}

export const lateText = (n: number) => `Atrasada · +${plural(n, "día", "días")}`;

// ---------- Preparación (CAL-07, PRY-12) ----------

/** A qué tipo de sistema aplica un parámetro de preparación. */
export const PREP_APPLIES = ["todos", "neta", "hibrido"] as const;
export type PrepAppliesTo = (typeof PREP_APPLIES)[number];

/** Parámetro del catálogo de preparación. Los ítems de la API traen además `default_on`, `sort`, etc. */
export type PrepCatalogItem = {
  id: string;
  code: string;
  name: string;
  /** Motivo de espera: «planos», «espera permiso». */
  pending_label: string;
  applies_to: PrepAppliesTo;
};

/** Parámetro que un proyecto lleva y si ya está hecho. Solo están los que se eligieron para ese proyecto. */
export type PrepEntry = { item_id: string; done: boolean };

export type Prep = { system_type: SystemType; prep: PrepEntry[] };

/** Un parámetro aplica a los proyectos de su tipo; `todos` aplica siempre. */
export const prepApplies = (item: Pick<PrepCatalogItem, "applies_to">, type: SystemType): boolean =>
  item.applies_to === "todos" || item.applies_to === type;

export type PrepRow<I extends PrepCatalogItem = PrepCatalogItem> = {
  item: I;
  /** El proyecto lo lleva (se eligió para él). */
  selected: boolean;
  /** Marcado como hecho. */
  done: boolean;
  /** Aplica al tipo de sistema del proyecto; si no, la interfaz lo muestra apagado y no cuenta como pendiente. */
  applies: boolean;
  /** Elegido, aplica y no está hecho. */
  pending: boolean;
};

/** Una fila por parámetro del catálogo, en el orden en que llega el catálogo. */
export function prepRows<I extends PrepCatalogItem>(p: Prep, catalog: readonly I[]): PrepRow<I>[] {
  const mine = new Map(p.prep.map((e) => [e.item_id, e.done]));
  return catalog.map((item) => {
    const selected = mine.has(item.id);
    const done = mine.get(item.id) === true;
    const applies = prepApplies(item, p.system_type);
    return { item, selected, done, applies, pending: selected && applies && !done };
  });
}

/** «espera permiso» → «permiso»: los motivos se unen tras un solo «Espera». */
export const waitLabel = (label: string): string => label.trim().replace(/^(?:espera|falta|faltan)\s+/i, "");

/** Motivos de lo que falta: planos, material… Sin parámetros elegidos (o ninguno que aplique) no falta nada. */
export function missingPrep(p: Prep, catalog: readonly PrepCatalogItem[]): string[] {
  return prepRows(p, catalog)
    .filter((r) => r.pending)
    .map((r) => waitLabel(r.item.pending_label));
}

export function waitReason(p: Prep, catalog: readonly PrepCatalogItem[]): string {
  const m = missingPrep(p, catalog);
  return m.length ? `Espera ${joinEs(m)}` : "Lista para programar";
}

// ---------- Calendario (CAL-03) ----------

export type BarPlacement = {
  visible: boolean;
  col: number;
  span: number;
  clipStart: boolean;
  clipEnd: boolean;
  labelInside: boolean;
};

/**
 * Coloca una barra [start, end] en una cuadrícula de `weeks` semanas (6 columnas por semana) que empieza el lunes `from`.
 * La barra que viene de antes del rango lleva la esquina izquierda recta (`clipStart`).
 */
export function placeBar(start: ISODate, end: ISODate | null, from: ISODate, weeks: number): BarPlacement {
  const cols = weeks * 6;
  let s = workdayIndex(start, from);
  if (!isWorkday(start)) s += 1;
  const e = workdayIndex(end ?? start, from);
  if (e < 0 || s > cols - 1 || e < s)
    return { visible: false, col: 0, span: 0, clipStart: false, clipEnd: false, labelInside: false };
  const col = Math.max(0, s);
  const last = Math.min(cols - 1, e);
  const span = last - col + 1;
  return { visible: true, col, span, clipStart: s < 0, clipEnd: e > cols - 1, labelInside: span >= 5 };
}

/** Tramo de atraso entre el día siguiente al fin previsto y hoy, para dibujarlo discontinuo. */
export function overrunBar(end: ISODate, today: ISODate, from: ISODate, weeks: number): BarPlacement | null {
  if (end >= today) return null;
  const bar = placeBar(addDays(end, 1), today, from, weeks);
  return bar.visible ? bar : null;
}

/** Las columnas (días laborables) de una cuadrícula de `weeks` semanas desde el lunes `from`. */
export function gridDays(from: ISODate, weeks: number): ISODate[] {
  const out: ISODate[] = [];
  for (let w = 0; w < weeks; w++) for (let d = 0; d < 6; d++) out.push(addDays(from, w * 7 + d));
  return out;
}

// ---------- Choques y validación (VAL) ----------

export type Schedulable = {
  id: string;
  name: string;
  team_id: string | null;
  start_date: ISODate | null;
  end_date: ISODate | null;
  archived?: boolean;
  kind: StatusKind;
};

/** Otro proyecto activo del mismo equipo cuyas fechas se solapan (VAL-06, CAL-04). */
export function teamClash<T extends Schedulable>(p: Schedulable, others: T[]): T | null {
  if (!p.team_id || !p.start_date || !BUSY_KINDS.includes(p.kind)) return null;
  const a1 = p.start_date;
  const a2 = p.end_date ?? p.start_date;
  return (
    others.find(
      (o) =>
        o.id !== p.id &&
        !o.archived &&
        o.team_id === p.team_id &&
        o.start_date &&
        BUSY_KINDS.includes(o.kind) &&
        o.start_date <= a2 &&
        (o.end_date ?? o.start_date) >= a1,
    ) ?? null
  );
}

const EMPTY_DATE = /^(n\/?a|-+|—|sin fecha|pendiente)?$/i;

/** Normaliza una fecha de Excel o de un formulario (VAL-05, XLS-04). Devuelve `undefined` si no se entiende. */
export function normalizeDate(v: unknown): ISODate | null | undefined {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 20000 || v > 80000) return undefined;
    return fromDays(Math.floor(v) - 25569); // serie de Excel (1900)
  }
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (EMPTY_DATE.test(s)) return null;
  if (isISODate(s)) return s;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (!m) return undefined;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const iso = `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return isISODate(iso) ? iso : undefined;
}

export type StatusRules = { kind: StatusKind; name: string; requires_schedule: boolean; requires_reason: boolean };

export type ValidatableProject = Prep & {
  id: string;
  name: string;
  sale_date: ISODate | null;
  start_date: ISODate | null;
  end_date: ISODate | null;
  team_id: string | null;
  pause_reason: string;
  /** Días laborables estimados; con inicio, bastan para calcular el fin (VAL-01). */
  estimated_days?: number | null;
  archived?: boolean;
};

/** `error` solo sale al desarchivar: un dato que la validación rechazaría hoy, devuelto como aviso sin bloquear. */
export type WarningCode = "inicio_antes_venta" | "choque_equipo" | "prep_pendiente" | "atrasada" | "error";
export type CodedWarning = { code: WarningCode; text: string };

/** `warnings` conserva solo los textos; `coded` lleva los mismos avisos, en el mismo orden, con su código. */
export type Validation = { errors: string[]; warnings: string[]; coded: CodedWarning[] };

/**
 * Código de un aviso a partir de su texto, para quien solo recibe `warnings: string[]` (respuesta del PATCH).
 * Vive junto a `validateProject` y sus pruebas comprueban que cubre cada aviso que ese genera.
 */
export function warningCodeOf(text: string): WarningCode | undefined {
  if (text.startsWith("El inicio es anterior a la fecha de venta")) return "inicio_antes_venta";
  if (/ ya está en .+ esos días\.$/.test(text)) return "choque_equipo";
  if (/ con preparación pendiente: falta /.test(text)) return "prep_pendiente";
  if (text.startsWith("Atrasada · +")) return "atrasada";
  return undefined;
}

/** Errores bloquean el guardado; avisos no (VAL-10). */
export function validateProject(
  p: ValidatableProject,
  status: StatusRules,
  others: Schedulable[],
  today: ISODate,
  teamCode: ((id: string) => string) | undefined,
  prepCatalog: readonly PrepCatalogItem[],
): Validation {
  const errors: string[] = [];
  const coded: CodedWarning[] = [];
  const warn = (code: WarningCode, text: string) => coded.push({ code, text });
  if (status.requires_schedule && (!p.start_date || !p.team_id))
    errors.push(`Para estar ${status.name} necesita fecha de inicio y equipo.`);
  else if (status.requires_schedule && !p.end_date && !p.estimated_days)
    errors.push(`Para estar ${status.name} necesita fecha de fin o días estimados.`);
  if (status.requires_reason && !p.pause_reason.trim()) errors.push("Falta el motivo de la pausa.");
  if (p.start_date && p.end_date && p.end_date < p.start_date)
    errors.push("La fecha de fin es anterior al inicio.");
  if (p.start_date && p.sale_date && p.start_date < p.sale_date)
    warn("inicio_antes_venta", "El inicio es anterior a la fecha de venta. Revisa las fechas.");
  const clash = teamClash({ ...p, kind: status.kind }, others);
  if (clash)
    warn("choque_equipo", `${teamCode?.(p.team_id!) ?? "El equipo"} ya está en ${clash.name} esos días.`);
  const miss = missingPrep(p, prepCatalog);
  if (BUSY_KINDS.includes(status.kind) && miss.length)
    warn("prep_pendiente", `${status.name} con preparación pendiente: falta ${joinEs(miss)}.`);
  const late = lateDays(status.kind, p.end_date, today);
  if (late) warn("atrasada", `${lateText(late)}: debía terminar el ${dayLabel(p.end_date!)}.`);
  return { errors, warnings: coded.map((w) => w.text), coded };
}

/** Texto plano sin tildes y en minúsculas, para buscar y comparar cabeceras de Excel. */
export const fold = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

/** Distancia RGB simple entre dos colores #rrggbb (EQP-05). */
export function colorDistance(a: string, b: string): number {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [rgb(a), rgb(b)];
  return Math.sqrt(x.reduce((s, v, i) => s + (v - y[i]) ** 2, 0));
}

// ---------- Edición de proyectos (F1·B: PRY, CAL-05, VAL-05, VAL-09) ----------
// Las usan el servidor (PATCH, importación) y el cliente (guardado optimista), para que ambos calculen igual.

export type Schedule = { start_date: ISODate | null; end_date: ISODate | null; estimated_days: number | null };

/**
 * Mantiene coherentes inicio, días y fin (CAL-05): si cambian el inicio o los días se recalcula el fin;
 * si el fin se cambia a mano se recalculan los días. Con fin y días a la vez, manda el fin.
 */
export function reconcileSchedule(prev: Schedule, patch: Partial<Schedule>): Schedule {
  const next: Schedule = {
    start_date: patch.start_date !== undefined ? patch.start_date : prev.start_date,
    end_date: patch.end_date !== undefined ? patch.end_date : prev.end_date,
    estimated_days: patch.estimated_days !== undefined ? patch.estimated_days : prev.estimated_days,
  };
  const { start_date: s, end_date: e } = next;
  if (patch.end_date !== undefined) {
    if (e === null) next.estimated_days = null;
    else if (s && e >= s) next.estimated_days = countWorkdays(s, e);
  } else if (patch.start_date !== undefined || patch.estimated_days !== undefined) {
    if (s && next.estimated_days) next.end_date = estimatedEnd(s, next.estimated_days);
    else if (!s && patch.start_date !== undefined) next.end_date = null;
    else if (s && e && e >= s) next.estimated_days = countWorkdays(s, e);
  }
  return next;
}

/** Tipos que cierran la obra y fijan el fin real. */
export const FINISHED_KINDS: readonly StatusKind[] = ["terminado", "post_obra"];

/** Fin real al cambiar de estado: se conserva o se fija en `fallback` si el estado cierra la obra; si no, se limpia. */
export const actualEndFor = (kind: StatusKind, prev: ISODate | null, fallback: ISODate): ISODate | null =>
  FINISHED_KINDS.includes(kind) ? (prev ?? fallback) : null;

/** kWp como texto con 2 decimales. `null` si está vacío o es "N/A"; `undefined` si no se entiende. Acepta coma decimal. */
export function parseKwp(v: unknown): string | null | undefined {
  if (v === null || v === undefined) return null;
  let s: string;
  if (typeof v === "number") s = String(v);
  else if (typeof v === "string") s = v.trim().replace(/\s*kwp$/i, "").replace(",", ".");
  else return undefined;
  if (EMPTY_DATE.test(s)) return null;
  if (!/^\d+(\.\d+)?$/.test(s)) return undefined;
  const n = Number(s);
  return n > 999999.99 ? undefined : n.toFixed(2);
}

export type MergeableProject = Schedule & {
    status_id: string;
    actual_end: ISODate | null;
    show_on_mural: boolean;
    mural_until: ISODate | null;
  };

/**
 * Aplica un cambio a un proyecto con todas las normalizaciones: fechas coherentes (CAL-05),
 * fin real al cerrar o reabrir la obra y "hasta" del mural (+7 días). `prep` se reemplaza completo si viene en el cambio.
 * `kind` es el tipo del estado resultante.
 */
export function mergeProject<T extends MergeableProject>(
  prev: T,
  patch: Partial<T>,
  kind: StatusKind,
  today: ISODate,
  finishedOn: ISODate = today,
): T {
  const next: T = { ...prev, ...patch, ...reconcileSchedule(prev, patch) };
  if (patch.status_id !== undefined && patch.status_id !== prev.status_id)
    next.actual_end = actualEndFor(kind, prev.actual_end, finishedOn);
  if (patch.show_on_mural === true && !prev.show_on_mural && patch.mural_until === undefined && (!next.mural_until || next.mural_until < today))
    next.mural_until = addDays(today, 7);
  return next;
}
