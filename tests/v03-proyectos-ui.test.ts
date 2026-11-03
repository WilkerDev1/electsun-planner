import { test } from "node:test";
import assert from "node:assert/strict";
import { avisoOpenByDefault, avisoShort, parseAvisos, readAvisoPref, saveAvisoPref, sortedPrep, staleFinished, withPrepItem, AVISO_SEP } from "../src/admin/proyectos/model";
import type { Project } from "../shared/contracts/projects";

// Lógica de la pantalla Proyectos de la v0.3: avisos plegables (VAL-10), preparación opcional (PRY-12) y archivado (PRY-10).

const catalog = [{ id: "a" }, { id: "b" }, { id: "c" }];
const proj = (o: Partial<Project>) => ({ prep: [], archived: false, status_kind: "terminado", actual_end: null, end_date: null, ...o }) as Project;

test("PRY-12: agregar un parámetro lo deja pendiente y en el orden del catálogo; quitarlo lo borra", () => {
  const p = { prep: [{ item_id: "c", done: true }] };
  assert.deepEqual(withPrepItem(p, "a", true, catalog), [{ item_id: "a", done: false }, { item_id: "c", done: true }]);
  assert.deepEqual(withPrepItem(p, "c", true, catalog), p.prep);
  assert.deepEqual(withPrepItem(p, "c", false, catalog), []);
  assert.deepEqual(sortedPrep([{ item_id: "b", done: false }, { item_id: "a", done: true }], catalog).map((e) => e.item_id), ["a", "b"]);
});

test("VAL-10: los avisos se abren solos si hay un error o un atraso, y no si son informativos", () => {
  const atraso = parseAvisos(["Atrasada · +2 días laborables", "Villa ya está en E1 esos días."].join(AVISO_SEP));
  assert.deepEqual(atraso.map((a) => a.code), ["atrasada", "choque_equipo"]);
  assert.equal(avisoOpenByDefault(atraso), true);
  assert.equal(avisoOpenByDefault(parseAvisos("Falta el motivo de la pausa.")), true);
  assert.equal(avisoOpenByDefault(parseAvisos("X con preparación pendiente: falta planos.")), false);
  assert.deepEqual(parseAvisos(""), []);
  const a = atraso[0]!;
  assert.equal(avisoShort(a, { status_kind: "en_obra", end_date: "2020-01-01" }, "2020-01-03"), "Atrasada · +2");
});

test("VAL-10: la preferencia de abrir o cerrar no rompe sin almacenamiento", () => {
  assert.equal(readAvisoPref("x"), null);
  assert.doesNotThrow(() => saveAvisoPref("x", true));
  const store = new Map<string, string>();
  (globalThis as { window?: unknown }).window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } };
  try {
    assert.equal(readAvisoPref("p1"), null);
    saveAvisoPref("p1", false);
    assert.equal(readAvisoPref("p1"), false);
    saveAvisoPref("p1", true);
    assert.equal(readAvisoPref("p1"), true);
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
});

test("PRY-10: sugiere archivar solo los terminados con más de 30 días", () => {
  const rows = [
    proj({ id: "viejo", actual_end: "2026-09-01" }),
    proj({ id: "previsto", end_date: "2026-09-20" }),
    proj({ id: "reciente", actual_end: "2026-10-20" }),
    proj({ id: "ya", actual_end: "2026-01-01", archived: true }),
    proj({ id: "activo", status_kind: "en_obra", end_date: "2026-01-01" }),
    proj({ id: "sinfecha" }),
  ];
  assert.deepEqual(staleFinished(rows, "2026-10-27").map((p) => p.id), ["viejo", "previsto"]);
});
