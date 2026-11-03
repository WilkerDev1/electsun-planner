import test from "node:test";
import assert from "node:assert/strict";
import { clampIndex, marqueeTiming, nextIndex, paginate, MARQUEE_PAUSE_S, SCROLL_PX_PER_S } from "../src/mural/Rotate.js";
import { packNotices, planTimeline } from "../src/mural/Timeline.js";
import type { NoticeLine, TimelineGroup, TimelineRow } from "../shared/mural-model.js";

// MUR (rotación): páginas, índice que se conserva al cambiar los datos y tiempos de la marquesina.
// Funciones puras: no necesitan navegador ni base de datos.

test("paginate: divide en páginas de N y deja la última parcial (MUR, Rotate)", () => {
  assert.deepEqual(paginate([], 7), []);
  assert.deepEqual(paginate([1, 2, 3], 7), [[1, 2, 3]]);
  assert.deepEqual(paginate([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 7), [
    [1, 2, 3, 4, 5, 6, 7],
    [8, 9, 10],
  ]);
  assert.deepEqual(paginate([1, 2, 3, 4], 2), [
    [1, 2],
    [3, 4],
  ]);
  // Un tamaño no válido se trata como 1: nunca se pierde ningún elemento.
  assert.deepEqual(paginate([1, 2], 0), [[1], [2]]);
  assert.deepEqual(paginate([1, 2], -3), [[1], [2]]);
});

test("paginate no altera la lista de origen", () => {
  const src = [1, 2, 3];
  paginate(src, 2);
  assert.deepEqual(src, [1, 2, 3]);
});

test("el índice se conserva al cambiar el número de páginas y nunca queda fuera (usePages)", () => {
  // Misma cantidad de páginas: se queda donde estaba.
  assert.equal(clampIndex(2, 3), 2);
  // Llegan más datos: sigue en la página actual, sin volver a la 1.
  assert.equal(clampIndex(1, 5), 1);
  // Se reducen las páginas: queda en la última disponible.
  assert.equal(clampIndex(2, 2), 1);
  assert.equal(clampIndex(4, 1), 0);
  // Sin páginas, siempre 0.
  assert.equal(clampIndex(3, 0), 0);
  assert.equal(clampIndex(-1, 3), 0);
});

test("la rotación avanza en bucle y con una sola página no se mueve", () => {
  assert.equal(nextIndex(0, 3), 1);
  assert.equal(nextIndex(1, 3), 2);
  assert.equal(nextIndex(2, 3), 0);
  assert.equal(nextIndex(0, 1), 0);
  assert.equal(nextIndex(0, 0), 0);
  // Un índice fuera de rango (datos que se redujeron) se corrige antes de avanzar.
  assert.equal(nextIndex(7, 3), 0);
});

test("marquesina: 60 px/s en el lienzo de 1920, con 2 s de pausa al empezar cada vuelta", () => {
  assert.equal(SCROLL_PX_PER_S, 60);
  assert.equal(MARQUEE_PAUSE_S, 2);
  // Una copia de 900 px más 48 de separación: 948 px a 60 px/s, 15,8 s de recorrido más 2 s de pausa.
  const t = marqueeTiming(900, 48);
  assert.equal(t.shift, 948);
  assert.ok(Math.abs(t.duration - (2 + 948 / 60)) < 1e-9);
  // La pausa ocupa su parte exacta del ciclo.
  assert.ok(Math.abs(t.holdPct - (2 / t.duration) * 100) < 1e-9);
  assert.ok(t.holdPct > 0 && t.holdPct < 100);
});

test("marquesina: la velocidad se puede cambiar sin tocar el resto del cálculo", () => {
  const t = marqueeTiming(600, 0, 120, 0);
  assert.equal(t.duration, 5);
  assert.equal(t.holdPct, 0);
});

// ---------- Calendario del timeline: filas que no caben pasan de página ----------

const row = (id: string): TimelineRow => ({
  id,
  team: "E1",
  name: id,
  priority: false,
  dot: "#16A34A",
  pattern: "solido",
  place: "Lugar",
  when: "Hoy",
  whenSub: "",
  late: 0,
  bar: { col: 0, span: 1, clipStart: false, clipEnd: false, text: "" },
  over: null,
});
const group = (key: "obra" | "prog", n: number): TimelineGroup => ({
  key,
  label: key === "obra" ? "EN OBRA" : "PRÓXIMOS",
  fg: "#000",
  solid: "#111",
  rows: Array.from({ length: n }, (_, i) => row(`${key}-${i}`)),
});
const allRows = (pages: { rows: TimelineRow[] }[][]) => pages.flat().flatMap((s) => s.rows.map((r) => r.id));

test("timeline: si todo cabe encogiendo hasta 0,9, va en una sola página", () => {
  const pages = planTimeline([group("obra", 2), group("prog", 3)], 1000);
  assert.equal(pages.length, 1);
  assert.equal(allRows(pages).length, 5);
  assert.ok(pages[0].every((s) => s.scale >= 0.9 && s.scale <= 1));
});

test("timeline: si no cabe, pagina sin ocultar filas ni repetir ninguna", () => {
  const groups = [group("obra", 6), group("prog", 9)];
  const pages = planTimeline(groups, 584);
  assert.ok(pages.length > 1, "hay varias páginas");
  const ids = allRows(pages);
  assert.equal(ids.length, 15);
  assert.equal(new Set(ids).size, 15);
  // Cada página respeta el área: suma de alturas naturales y etiquetas.
  for (const page of pages) {
    const h = page.reduce((s, sec) => s + 40 + sec.rows.length * (sec.group.key === "obra" ? 80 : 64), 0);
    assert.ok(h <= 584, `página de ${h} px`);
    assert.ok(page.every((s) => s.scale === 1), "a tamaño natural");
    assert.ok(page.every((s) => s.rows.length > 0), "ninguna etiqueta queda sola");
  }
});

test("timeline: un grupo que sigue en otra página repite su etiqueta", () => {
  const pages = planTimeline([group("obra", 12)], 584);
  assert.ok(pages.length >= 2);
  assert.ok(pages.every((p) => p.length === 1 && p[0].group.key === "obra"));
});

test("timeline: sin filas no hay páginas", () => {
  assert.deepEqual(planTimeline([group("obra", 0), group("prog", 0)], 584), []);
});

// ---------- Avisos de la derecha: páginas que no cortan ningún aviso ----------

const notice = (text: string, project: string | null = null): NoticeLine => ({ project, text, general: project === null });

test("avisos del timeline: se agrupan sin cortar ninguno y con un límite de líneas por página", () => {
  const lines = [notice("Corto"), notice("Otro corto", "Taller"), notice("x".repeat(140), "Proyecto largo"), notice("Final")];
  const pages = packNotices(lines);
  assert.deepEqual(pages.flat(), lines, "todos, en orden");
  for (const p of pages) {
    const used = p.reduce((s, n) => s + Math.max(1, Math.ceil(((n.project ? n.project.length + 1 : 0) + n.text.length) / 44)), 0);
    assert.ok(used <= 4 || p.length === 1, `página de ${used} líneas`);
  }
  assert.ok(pages.length >= 2, "el aviso largo no cabe con los demás");
});

test("avisos del timeline: sin avisos no hay páginas", () => {
  assert.deepEqual(packNotices([]), []);
});
