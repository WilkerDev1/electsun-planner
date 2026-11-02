import test from "node:test";
import assert from "node:assert/strict";
import {
  addWorkdays,
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
  type Schedulable,
} from "../shared/domain.js";

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
  assert.equal(lateDays("en_obra", TODAY, TODAY), 0);
});

test("inicio en días naturales", () => {
  assert.equal(startsIn("2026-10-28", TODAY).text, "Inicia mañana");
  assert.equal(startsIn("2026-10-29", TODAY).text, "Inicia en 2 días");
  assert.equal(startsIn(TODAY, TODAY).text, "Inicia hoy");
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

test("preparación y motivo de espera (CAL-07)", () => {
  const p = { system_type: "neta" as const, prep_plans: true, prep_materials: false, prep_ede: false };
  assert.deepEqual(missingPrep(p), ["material", "EDE"]);
  assert.equal(waitReason(p), "Espera material y EDE");
  assert.equal(waitReason({ ...p, prep_plans: false }), "Espera planos, material y EDE");
  assert.equal(waitReason({ ...p, system_type: "hibrido", prep_materials: true }), "Lista para programar");
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
    team_id: null, pause_reason: "", system_type: "neta" as const, prep_plans: true, prep_materials: true, prep_ede: false,
  };
  const prog = { kind: "programado" as const, name: "Programado", requires_schedule: true, requires_reason: false };
  const r = validateProject(p, prog, [], TODAY);
  assert.equal(r.errors.length, 2);
  assert.match(r.warnings.join(" "), /anterior a la fecha de venta/);
  assert.match(r.warnings.join(" "), /preparación pendiente: falta EDE/);
  const pause = { kind: "en_pausa" as const, name: "En pausa", requires_schedule: false, requires_reason: true };
  assert.deepEqual(validateProject({ ...p, end_date: null }, pause, [], TODAY).errors, ["Falta el motivo de la pausa."]);
  const obra = { kind: "en_obra" as const, name: "En obra", requires_schedule: true, requires_reason: false };
  const late = validateProject({ ...p, team_id: "t", end_date: "2026-10-26", prep_ede: true }, obra, [], TODAY);
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
