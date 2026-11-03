import test from "node:test";
import assert from "node:assert/strict";
import { clampIndex, marqueeSpeed, marqueeTiming, nextIndex, paginate, MARQUEE_PAUSE_S, MAX_SCROLL_PX_PER_S, SCROLL_PX_PER_S } from "../src/mural/Rotate.js";
import { fitPieces, type Piece, type Rich } from "../src/mural/Fit.js";
import { planCalendar } from "../src/mural/Principal.js";
import { planTimeline } from "../src/mural/Timeline.js";
import type { CalBar, CalTeam, TimelineGroup, TimelineRow } from "../shared/mural-model.js";

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

// ---------- Avisos: se miden y se reparten, sin cortar ninguno ----------

/** Altura de prueba: 26 px por línea de 40 caracteres, monótona en el texto (como el navegador). */
const lines = (p: Piece<unknown>) => Math.ceil(((p.head ? p.head.length + 1 : 0) + p.body.length) / 40) * 26 + 1;
const notice = (body: string, head: string | null = null): Rich<string> => ({ head, body, data: body });
const words = (s: string) => s.split(/\s+/).filter(Boolean);
const heightOf = (page: Piece<unknown>[], gap: number) => page.reduce((s, p) => s + lines(p), 0) + gap * Math.max(0, page.length - 1);

test("avisos: un aviso largo se parte en trozos que caben en la página, sin perder ni repetir palabras", () => {
  const long = Array.from({ length: 80 }, (_, i) => `palabra${i}`).join(" ");
  const pages = fitPieces([notice(long, "Proyecto largo")], lines, 120, 8);
  assert.ok(pages.length > 1, "no cabe en una página");
  for (const page of pages) assert.ok(heightOf(page, 8) <= 120, `página de ${heightOf(page, 8)} px`);
  const pieces = pages.flat();
  assert.deepEqual(pieces.flatMap((p) => words(p.body)), words(long), "todas las palabras, en orden");
  assert.ok(pieces.every((p) => p.head === "Proyecto largo"), "el proyecto se repite en cada trozo");
  assert.deepEqual(pieces.map((p) => p.first), pieces.map((_, i) => i === 0), "solo el primero lleva el punto");
});

test("avisos: uno de 500 caracteres sale completo en trozos dentro de los 120 px del panel", () => {
  const text = "Revisar el tejado y la canaleta antes de la inspección del distribuidor, avisar al cliente y reservar el andamio. ".repeat(4).trim();
  assert.ok(text.length >= 440 && text.length <= 520, `${text.length} caracteres`);
  const pages = fitPieces([notice(text, "Villa Norte")], lines, 120, 8);
  for (const page of pages) assert.ok(heightOf(page, 8) <= 120);
  assert.deepEqual(pages.flat().flatMap((p) => words(p.body)), words(text));
});

test("avisos: los cortos se agrupan en una página mientras quepan", () => {
  const cortos = [notice("Uno"), notice("Dos", "Taller"), notice("Tres")];
  const pages = fitPieces(cortos, lines, 120, 8);
  assert.equal(pages.length, 1);
  assert.equal(pages[0].length, 3);
  const many = Array.from({ length: 10 }, (_, i) => notice(`Aviso ${i}`));
  const paged = fitPieces(many, lines, 60, 8);
  assert.ok(paged.length > 1, "no caben diez en 60 px");
  assert.deepEqual(paged.flat().map((p) => p.body), many.map((n) => n.body), "todos y en orden");
});

test("avisos con movimiento reducido: un trozo cada vez (maxPer 1), dentro del alto", () => {
  const long = Array.from({ length: 60 }, (_, i) => `w${i}`).join(" ");
  const pages = fitPieces([notice("Corto"), notice(long, "Largo")], lines, 52, 0, 1);
  assert.ok(pages.every((p) => p.length === 1), "uno por página");
  assert.ok(pages.every((p) => lines(p[0]) <= 52));
  assert.deepEqual(pages.flat().flatMap((p) => words(p.body)), [...words("Corto"), ...words(long)], "ningún texto se pierde");
});

test("avisos: un texto que cabe entero en una página nueva no se parte en la actual", () => {
  // Quedan 26 px en la página (una línea) y el segundo aviso mide 2 líneas: cabe entero en una página nueva.
  const a = notice("x".repeat(40 * 4 - 1));
  const b = notice("y".repeat(40 * 2 - 1));
  const pages = fitPieces([a, b], lines, 26 * 4 + 1 + 8 + 27, 8);
  const bPieces = pages.flat().filter((p) => p.data === b.data);
  assert.equal(bPieces.length, 1, "entero");
  assert.equal(pages.flat().flatMap((p) => words(p.body)).length, 2);
});

test("avisos: sin avisos no hay páginas y un aviso vacío ocupa una sola página", () => {
  assert.deepEqual(fitPieces([], lines, 120, 8), []);
  const vacio = fitPieces([notice("", "Solo proyecto")], lines, 120, 8);
  assert.equal(vacio.flat().length, 1);
});

// ---------- Velocidad de la marquesina ----------

test("marquesina: a 60 px/s si una vuelta dura menos de 60 s; hasta 90 px/s si dura más", () => {
  assert.equal(marqueeSpeed(948), SCROLL_PX_PER_S);
  assert.equal(marqueeSpeed(3000), SCROLL_PX_PER_S);
  // 5400 px a 90 px/s son exactamente 60 s: por encima se sube la velocidad hasta el tope.
  assert.equal(marqueeSpeed(5400), MAX_SCROLL_PX_PER_S);
  assert.equal(marqueeSpeed(20000), MAX_SCROLL_PX_PER_S);
  const t = marqueeTiming(19000, 64);
  assert.equal(t.duration, MARQUEE_PAUSE_S + t.shift / MAX_SCROLL_PX_PER_S);
});

// ---------- Calendario: páginas por equipo sin cortar barras ----------

const bar = (id: string) => ({ id }) as unknown as CalBar;
const team = (code: string, n: number): CalTeam => ({ id: code, code, name: code, bars: Array.from({ length: n }, (_, i) => bar(`${code}-${i}`)) });
const calBars = (pages: ReturnType<typeof planCalendar>) => pages.flatMap((p) => p.sections.flatMap((s) => s.bars.map((b) => b.id)));

test("calendario: si todo cabe, una sola página con la altura de fila que la llena (30 a 40 px)", () => {
  const pages = planCalendar([team("E1", 2), team("E2", 1)], 500);
  assert.equal(pages.length, 1);
  assert.ok(pages[0].rowH >= 30 && pages[0].rowH <= 40);
  assert.equal(calBars(pages).length, 3);
});

test("calendario: si no caben las barras a 30 px, pagina por equipos sin perder ni repetir ninguna", () => {
  const teams = [team("E1", 4), team("E2", 4), team("E3", 4)];
  const area = 300;
  const pages = planCalendar(teams, area);
  assert.ok(pages.length > 1);
  assert.deepEqual(calBars(pages).sort(), teams.flatMap((t) => t.bars.map((b) => b.id)).sort());
  for (const p of pages) {
    const rows = p.sections.reduce((s, x) => s + Math.max(1, x.bars.length), 0);
    assert.ok(p.rowH >= 30, "nunca menos de 30 px por barra");
    assert.ok(rows * p.rowH + p.sections.length * 13 <= area, `página de ${rows * p.rowH} px`);
  }
});

test("calendario: un equipo con muchas barras se parte y repite su nombre en la página siguiente", () => {
  const pages = planCalendar([team("E1", 9)], 250);
  const sections = pages.flatMap((p) => p.sections);
  assert.ok(sections.length > 1, "partido en varias páginas");
  assert.ok(sections.every((s) => s.team.code === "E1"));
  assert.equal(sections[0].first, true);
  assert.ok(sections.slice(1).every((s) => s.first === false));
  assert.equal(calBars(pages).length, 9);
});

test("calendario: sin equipos no hay páginas", () => {
  assert.deepEqual(planCalendar([], 500), []);
});

// ---------- Timeline: filas del calendario de la izquierda ----------

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
