import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// MUR-01, NF-04: el mural se lee desde lejos; ningún texto de src/mural baja de 22 px.
// Prueba estática: revisa el código fuente, no el navegador.

const DIR = join(import.meta.dirname, "..", "src", "mural");
const MIN_PX = 22;
const files = readdirSync(DIR).filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"));

test("hay archivos del mural que revisar", () => {
  assert.ok(files.includes("Principal.tsx") && files.includes("Timeline.tsx"));
});

for (const f of files) {
  const src = readFileSync(join(DIR, f), "utf8");

  test(`${f}: ningún fontSize ni text-[Npx] baja de ${MIN_PX} px`, () => {
    const low: string[] = [];
    for (const m of src.matchAll(/fontSize:\s*"?(\d+(?:\.\d+)?)(?:px)?"?/g)) if (Number(m[1]) < MIN_PX) low.push(m[0]);
    for (const m of src.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) if (Number(m[1]) < MIN_PX) low.push(m[0]);
    // Tamaños declarados en tablas (p. ej. `name: 30` en Timeline) que luego se pasan a fontSize.
    for (const m of src.matchAll(/\bname:\s*(\d+)\b/g)) if (Number(m[1]) < MIN_PX) low.push(m[0]);
    assert.deepEqual(low, []);
  });

  test(`${f}: no usa tamaños relativos que puedan bajar de ${MIN_PX} px`, () => {
    assert.equal(/fontSize:\s*"[\d.]+(?:em|rem|%)"/.test(src), false);
    assert.equal(/text-(?:xs|sm|base)\b/.test(src), false);
  });
}

test("el texto blanco del mural no va sobre el naranja #EA6A1F (3,19:1); se usa #C2410C (5,18:1)", () => {
  for (const f of ["Principal.tsx", "Timeline.tsx"]) {
    const src = readFileSync(join(DIR, f), "utf8");
    for (const line of src.split("\n")) {
      if (/color:\s*"#FFFFFF"/.test(line) && /background:\s*(ACCENT|"#EA6A1F")/.test(line)) assert.fail(`${f}: ${line.trim().slice(0, 80)}`);
    }
  }
});
