import test from "node:test";
import assert from "node:assert/strict";
import {
  addWorkdays,
  effectiveEnd,
  initials,
  monogramColors,
  warningCodeOf,
  countWorkdays,
  dayOf,
  lateDays,
  lateText,
  longDate,
  missingPrep,
  mondayOf,
  normalizeDate,
  overrunBar,
  placeBar,
  startsIn,
  teamClash,
  todayIn,
  validateProject,
  waitReason,
  workdayIndex,
  colorDistance,
  reconcileSchedule,
  parseKwp,
  actualEndFor,
  mergeProject,
  prepRows,
  waitLabel,
  type PrepCatalogItem,
  type Schedulable,
} from "../shared/domain.js";

// Catálogo de preparación de la demo (migración 002) más un parámetro propio.
const PL: PrepCatalogItem = { id: "pl", code: "PL", name: "Planos y BOM", pending_label: "planos", applies_to: "todos" };
const MA: PrepCatalogItem = { id: "ma", code: "MA", name: "Materiales completos", pending_label: "material", applies_to: "todos" };
const EDE: PrepCatalogItem = { id: "ede", code: "EDE", name: "Carta de no objeción", pending_label: "EDE", applies_to: "neta" };
const PM: PrepCatalogItem = { id: "pm", code: "PM", name: "Permiso municipal", pending_label: "espera permiso", applies_to: "todos" };
const CAT = [PL, MA, EDE];
const prep = (...e: [string, boolean][]) => e.map(([item_id, done]) => ({ item_id, done }));

const TODAY = "2026-10-27"; // martes de la demo
const BASE = "2026-10-26"; // lunes

test("índice laborable: lunes a sábado, el domingo se pega al sábado", () => {
  assert.equal(workdayIndex("2026-10-26", BASE), 0);
  assert.equal(workdayIndex("2026-10-31", BASE), 5);
  assert.equal(workdayIndex("2026-11-01", BASE), 5);
  assert.equal(workdayIndex("2026-11-02", BASE), 6);
  assert.equal(workdayIndex("2026-10-24", BASE), -1);
  assert.equal(workdayIndex("2026-10-19", BASE), -6);
  assert.equal(mondayOf("2026-11-01"), "2026-10-26");
  assert.equal(mondayOf(TODAY), BASE);
});

test("conteo de días laborables", () => {
  assert.equal(countWorkdays("2026-10-26", "2026-10-31"), 6);
  assert.equal(countWorkdays("2026-10-31", "2026-11-01"), 1);
  assert.equal(countWorkdays("2026-11-01", "2026-11-02"), 1);
  assert.equal(countWorkdays("2026-10-30", "2026-10-29"), 0);
});

test("casos verificados del diseño (CAL-02)", () => {
  assert.equal(dayOf("2026-10-19", "2026-10-30", TODAY).text, "Día 8 de 11"); // Colegio Arcoíris
  assert.equal(dayOf("2026-10-19", "2026-11-06", TODAY).text, "Día 8 de 17"); // Taller Motormax
  assert.equal(lateDays("en_obra", "2026-10-26", TODAY), 1); // Granja Los Pinos
  assert.equal(lateText(1), "Atrasada · +1 día");
  assert.equal(lateText(3), "Atrasada · +3 días");
  assert.equal(lateDays("programado", "2026-10-26", TODAY), 0);
  assert.equal(lateDays("en_obra", "2026-10-25", TODAY), 2); // fin en domingo: cuentan lun 26 y mar 27
  assert.equal(lateDays("en_obra", "2026-10-25", "2026-10-26"), 1);
  assert.equal(lateDays("en_obra", TODAY, TODAY), 0);
});

test("inicio en días naturales", () => {
  assert.equal(startsIn("2026-10-28", TODAY).text, "Inicia mañana");
  assert.equal(startsIn("2026-10-29", TODAY).text, "Inicia en 2 días");
  assert.equal(startsIn(TODAY, TODAY).text, "Inicia hoy");
});

test("inicio ya pasado: «Debía iniciar» en vez de «Inicia hoy» (CAL-06)", () => {
  assert.deepEqual(startsIn("2026-10-20", TODAY), { days: -7, text: "Debía iniciar el mar 20 oct" });
  assert.equal(startsIn("2026-10-26", TODAY).text, "Debía iniciar el lun 26 oct");
});

test("fin efectivo para datos antiguos sin fin (VAL-01)", () => {
  assert.equal(effectiveEnd({ start_date: "2026-10-20", end_date: null }), "2026-10-20");
  assert.equal(effectiveEnd({ start_date: "2026-10-20", end_date: "2026-10-30" }), "2026-10-30");
  assert.equal(effectiveEnd({ start_date: "2026-10-20", end_date: "2026-10-10" }), "2026-10-20");
});

test("monograma e iniciales: una sola fórmula (MUR-13)", () => {
  assert.deepEqual(monogramColors("#EA6A1F"), monogramColors("#ea6a1f"));
  const m = monogramColors("#0F766E");
  assert.match(m.bg, /^#[0-9A-F]{6}$/);
  assert.match(m.fg, /^#[0-9A-F]{6}$/);
  assert.notEqual(m.bg, m.fg);
  assert.deepEqual(monogramColors("rojo"), { bg: "#F2F4F7", fg: "#475467" });
  assert.deepEqual(monogramColors(undefined), monogramColors(null));
  assert.equal(initials("Sr. Herrera"), "H");
  assert.equal(initials("Lucía Esther Gómez"), "LE");
});

test("fin previsto con días estimados (CAL-05)", () => {
  assert.equal(addWorkdays("2026-10-19", 11), "2026-10-30");
  assert.equal(addWorkdays("2026-10-30", 2), "2026-10-31");
  assert.equal(addWorkdays("2026-10-31", 2), "2026-11-02"); // salta el domingo
  assert.equal(addWorkdays("2026-11-01", 1), "2026-11-02"); // empieza en domingo
  assert.equal(addWorkdays("2026-10-29", 1), "2026-10-29");
});

test("barras del calendario (CAL-03)", () => {
  const a = placeBar("2026-10-19", "2026-10-30", BASE, 2);
  assert.deepEqual(a, { visible: true, col: 0, span: 5, clipStart: true, clipEnd: false, labelInside: true });
  const b = placeBar("2026-11-05", "2026-11-12", BASE, 2);
  assert.deepEqual(b, { visible: true, col: 9, span: 3, clipStart: false, clipEnd: true, labelInside: false });
  assert.equal(placeBar("2026-11-16", null, BASE, 2).visible, false);
  assert.equal(placeBar("2026-11-16", null, BASE, 4).visible, true);
  assert.equal(placeBar("2026-11-01", "2026-11-01", BASE, 2).visible, false); // solo domingo
  const over = overrunBar("2026-10-26", TODAY, BASE, 2);
  assert.deepEqual(over && [over.col, over.span], [1, 1]);
});

test("preparación y motivo de espera (CAL-07, PRY-12)", () => {
  const p = { system_type: "neta" as const, prep: prep(["pl", true], ["ma", false], ["ede", false]) };
  assert.deepEqual(missingPrep(p, CAT), ["material", "EDE"]);
  assert.equal(waitReason(p, CAT), "Espera material y EDE");
  assert.equal(waitReason({ ...p, prep: prep(["pl", false], ["ma", false], ["ede", false]) }, CAT), "Espera planos, material y EDE");
  // Un parámetro que no aplica al tipo no cuenta como pendiente.
  assert.equal(waitReason({ system_type: "hibrido", prep: prep(["pl", true], ["ma", true], ["ede", false]) }, CAT), "Lista para programar");
  // Los que el proyecto no eligió no cuentan; sin ninguno no hay nada pendiente.
  assert.equal(waitReason({ system_type: "neta", prep: prep(["pl", true]) }, CAT), "Lista para programar");
  assert.deepEqual(missingPrep({ system_type: "neta", prep: [] }, CAT), []);
  assert.deepEqual(missingPrep(p, []), []);
  // Un parámetro propio: «espera permiso» se une sin repetir el verbo.
  assert.equal(waitReason({ system_type: "neta", prep: prep(["pl", false], ["pm", false]) }, [...CAT, PM]), "Espera planos y permiso");
  assert.equal(waitLabel("Falta material"), "material");
  assert.equal(waitLabel("  espera EDE "), "EDE");
  assert.equal(waitLabel("planos"), "planos");
});

test("filas de preparación: elegido, hecho y si aplica (PRY-12)", () => {
  const rows = prepRows({ system_type: "hibrido", prep: prep(["pl", true], ["ede", false]) }, CAT);
  assert.deepEqual(rows.map((r) => [r.item.code, r.selected, r.done, r.applies, r.pending]), [
    ["PL", true, true, true, false],
    ["MA", false, false, true, false],
    ["EDE", true, false, false, false],
  ]);
});

test("choque de equipo (VAL-06)", () => {
  const base: Schedulable = { id: "a", name: "A", team_id: "t1", start_date: "2026-10-29", end_date: "2026-10-30", kind: "programado" };
  const others: Schedulable[] = [
    { id: "b", name: "B", team_id: "t1", start_date: "2026-10-22", end_date: "2026-10-29", kind: "en_obra" },
    { id: "c", name: "C", team_id: "t1", start_date: "2026-10-29", end_date: null, kind: "terminado" },
  ];
  assert.equal(teamClash(base, others)?.id, "b");
  assert.equal(teamClash(base, [others[1]]), null);
  assert.equal(teamClash({ ...base, kind: "por_programar" }, others), null);
  assert.equal(teamClash(base, [{ ...others[0], archived: true }]), null);
});

test("normalización de fechas (VAL-05, XLS-04)", () => {
  for (const v of ["NA", "N/A", "n/a", "-", "", "  ", null]) assert.equal(normalizeDate(v), null);
  assert.equal(normalizeDate("2026-10-27"), "2026-10-27");
  assert.equal(normalizeDate("27/10/2026"), "2026-10-27");
  assert.equal(normalizeDate("5/9/26"), "2026-09-05");
  assert.equal(normalizeDate(46322), "2026-10-27");
  assert.equal(normalizeDate("31/02/2026"), undefined);
  assert.equal(normalizeDate("mañana"), undefined);
});

test("validación del proyecto (VAL)", () => {
  const p = {
    id: "x", name: "X", sale_date: "2026-10-20", start_date: "2026-10-19", end_date: "2026-10-18",
    team_id: null, pause_reason: "", system_type: "neta" as const, prep: prep(["pl", true], ["ma", true], ["ede", false]),
  };
  const prog = { kind: "programado" as const, name: "Programado", requires_schedule: true, requires_reason: false };
  const r = validateProject(p, prog, [], TODAY, undefined, CAT);
  assert.equal(r.errors.length, 2);
  assert.match(r.warnings.join(" "), /anterior a la fecha de venta/);
  assert.match(r.warnings.join(" "), /preparación pendiente: falta EDE/);
  const pause = { kind: "en_pausa" as const, name: "En pausa", requires_schedule: false, requires_reason: true };
  assert.deepEqual(validateProject({ ...p, end_date: null }, pause, [], TODAY).errors, ["Falta el motivo de la pausa."]);
  const obra = { kind: "en_obra" as const, name: "En obra", requires_schedule: true, requires_reason: false };
  const late = validateProject({ ...p, team_id: "t", end_date: "2026-10-26", prep: prep(["pl", true], ["ma", true], ["ede", true]) }, obra, [], TODAY, undefined, CAT);
  assert.deepEqual(late.errors, []);
  assert.match(late.warnings.join(" "), /Atrasada · \+1 día: debía terminar el lun 26 oct/);
});

test("hoy en Santo Domingo y textos", () => {
  assert.equal(todayIn("America/Santo_Domingo", new Date("2026-10-28T02:00:00Z")), "2026-10-27");
  assert.equal(todayIn(undefined, new Date(), "2026-10-27"), "2026-10-27");
  assert.equal(longDate(TODAY), "Martes 27 de octubre");
  assert.ok(colorDistance("#EA6A1F", "#EA580C") < 40);
  assert.ok(colorDistance("#EA6A1F", "#0EA5E9") > 150);
});

test("fechas coherentes de la programación (CAL-05)", () => {
  const prev = { start_date: "2026-10-29", end_date: "2026-10-29", estimated_days: 1 };
  assert.deepEqual(reconcileSchedule(prev, { estimated_days: 3 }), { start_date: "2026-10-29", end_date: "2026-10-31", estimated_days: 3 });
  assert.deepEqual(reconcileSchedule(prev, { end_date: "2026-11-02" }), { start_date: "2026-10-29", end_date: "2026-11-02", estimated_days: 4 });
  const long = { start_date: "2026-10-29", end_date: "2026-11-02", estimated_days: 4 };
  assert.deepEqual(reconcileSchedule(long, { start_date: "2026-11-02" }), { start_date: "2026-11-02", end_date: "2026-11-05", estimated_days: 4 });
  assert.equal(reconcileSchedule(long, { start_date: "2026-11-02", end_date: "2026-11-04" }).estimated_days, 3); // manda el fin
  assert.equal(reconcileSchedule(long, { end_date: "2026-10-20" }).estimated_days, 4); // fin anterior: no toca los días
  assert.deepEqual(reconcileSchedule(long, { start_date: null }), { start_date: null, end_date: null, estimated_days: 4 });
  assert.equal(reconcileSchedule(long, { end_date: null }).estimated_days, null);
  assert.deepEqual(reconcileSchedule({ start_date: null, end_date: null, estimated_days: null }, { start_date: "2026-10-27" }), { start_date: "2026-10-27", end_date: null, estimated_days: null });
  assert.equal(reconcileSchedule({ start_date: "2026-10-27", end_date: "2026-10-30", estimated_days: null }, { start_date: "2026-10-28" }).estimated_days, 3);
});

test("kWp y fin real", () => {
  assert.equal(parseKwp("12,5"), "12.50");
  assert.equal(parseKwp(97.28), "97.28");
  assert.equal(parseKwp("8.19 kWp"), "8.19");
  assert.equal(parseKwp("N/A"), null);
  assert.equal(parseKwp(""), null);
  assert.equal(parseKwp("mucho"), undefined);
  assert.equal(actualEndFor("terminado", null, TODAY), TODAY);
  assert.equal(actualEndFor("post_obra", "2026-10-06", TODAY), "2026-10-06");
  assert.equal(actualEndFor("en_obra", "2026-10-06", TODAY), null);
});

test("mergeProject normaliza como el servidor (PRY-01, PRY-12)", () => {
  const prev = {
    start_date: "2026-10-19" as string | null, end_date: "2026-10-30" as string | null, estimated_days: 11 as number | null,
    system_type: "neta" as "neta" | "hibrido", prep: prep(["pl", true], ["ma", true], ["ede", true]),
    status_id: "a", actual_end: null as string | null, show_on_mural: false, mural_until: null as string | null,
  };
  // La preparación no se toca al cambiar el tipo (los que no aplican simplemente no cuentan) y se reemplaza completa.
  assert.deepEqual(mergeProject(prev, { system_type: "hibrido" }, "en_obra", TODAY).prep, prev.prep);
  assert.deepEqual(mergeProject(prev, { prep: prep(["pl", false]) }, "en_obra", TODAY).prep, prep(["pl", false]));
  const done = mergeProject(prev, { status_id: "b" }, "terminado", TODAY);
  assert.equal(done.actual_end, TODAY);
  assert.equal(mergeProject(done, { status_id: "a" }, "en_obra", TODAY).actual_end, null);
  assert.equal(mergeProject(prev, { show_on_mural: true }, "en_obra", TODAY).mural_until, "2026-11-03");
  assert.equal(mergeProject({ ...prev, mural_until: "2026-10-20" }, { show_on_mural: true }, "en_obra", TODAY).mural_until, "2026-11-03");
});

test("en obra sin fin ni días no se guarda (VAL-01)", () => {
  const p = {
    id: "x", name: "X", sale_date: null, start_date: "2026-10-20", end_date: null, estimated_days: null as number | null,
    team_id: "t", pause_reason: "", system_type: "hibrido" as const, prep: prep(["pl", true], ["ma", true]),
  };
  const obra = { kind: "en_obra" as const, name: "En obra", requires_schedule: true, requires_reason: false };
  assert.deepEqual(validateProject(p, obra, [], TODAY).errors, ["Para estar En obra necesita fecha de fin o días estimados."]);
  assert.deepEqual(validateProject({ ...p, estimated_days: 5 }, obra, [], TODAY).errors, []);
  assert.deepEqual(validateProject({ ...p, end_date: "2026-10-30" }, obra, [], TODAY).errors, []);
  // Sin inicio o sin equipo sigue mandando el mensaje de siempre.
  assert.match(validateProject({ ...p, team_id: null }, obra, [], TODAY).errors[0], /fecha de inicio y equipo/);
  const porProgramar = { kind: "por_programar" as const, name: "Por programar", requires_schedule: false, requires_reason: false };
  assert.deepEqual(validateProject(p, porProgramar, [], TODAY).errors, []);
});

test("los avisos llevan código y coinciden con su texto (VAL-06, CAL-06)", () => {
  const p = {
    id: "x", name: "X", sale_date: "2026-10-25", start_date: "2026-10-20", end_date: "2026-10-26", estimated_days: 6,
    team_id: "t", pause_reason: "", system_type: "neta" as const, prep: prep(["pl", true], ["ma", true], ["ede", false]),
  };
  const obra = { kind: "en_obra" as const, name: "En obra", requires_schedule: true, requires_reason: false };
  const other: Schedulable = { id: "o", name: "Otra", team_id: "t", start_date: "2026-10-22", end_date: "2026-10-23", kind: "en_obra" };
  const v = validateProject(p, obra, [other], TODAY, () => "E1", CAT);
  assert.deepEqual(v.coded.map((w) => w.code).sort(), ["atrasada", "choque_equipo", "inicio_antes_venta", "prep_pendiente"]);
  assert.deepEqual(v.warnings, v.coded.map((w) => w.text));
  for (const w of v.coded) assert.equal(warningCodeOf(w.text), w.code);
  assert.equal(warningCodeOf("Otra cosa"), undefined);
});
