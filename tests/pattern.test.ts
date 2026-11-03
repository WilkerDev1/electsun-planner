// Patrones de color de empresa (EQP-08) y marca de empresa (EQP-07): unitarias, sin base de datos.
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AA,
  COMPANY_PATTERNS,
  DEFAULT_PATTERN,
  PATTERN_LABELS,
  contrastRatio,
  isCompanyPattern,
  luminance,
  patternStyle,
  patternTones,
} from "../shared/pattern.js";
import { CompanyMark, monogramStyle } from "../src/ui/CompanyMark.js";

test("el catálogo tiene 7 patrones y cada uno su etiqueta en español (EQP-08)", () => {
  assert.deepEqual([...COMPANY_PATTERNS], ["solido", "rayas", "rayas_finas", "puntos", "cuadricula", "zigzag", "diagonal_cruzada"]);
  assert.equal(DEFAULT_PATTERN, "solido");
  for (const p of COMPANY_PATTERNS) assert.ok(PATTERN_LABELS[p].length > 0);
  assert.equal(PATTERN_LABELS.solido, "Sólido");
  assert.ok(isCompanyPattern("puntos"));
  assert.ok(!isCompanyPattern("estrellas"));
  assert.ok(!isCompanyPattern(null));
});

test("contraste y luminancia (WCAG)", () => {
  assert.equal(luminance("#000000"), 0);
  assert.equal(luminance("#FFFFFF"), 1);
  assert.equal(Math.round(contrastRatio("#000000", "#FFFFFF")), 21);
  assert.equal(contrastRatio("#336699", "#336699"), 1);
});

test("patrón por defecto: color liso, sin dibujo, con texto legible (EQP-08)", () => {
  const s = patternStyle({ color: "#0ea5e9" });
  assert.equal(s.backgroundColor, "#0EA5E9");
  assert.equal(s.backgroundImage, "none");
  assert.ok(contrastRatio(s.textColor, s.backgroundColor) >= AA);
  assert.deepEqual(patternStyle({ color: "#0EA5E9", pattern: "solido" }), s);
  assert.deepEqual(patternStyle({ color: "#0EA5E9", pattern: null }), s);
  assert.deepEqual(patternStyle({ color: "#0EA5E9", pattern: "desconocido" }), s); // lo desconocido cae al sólido
});

test("cada patrón dibuja con gradientes repetidos y mantiene el color base (EQP-08)", () => {
  const images = new Set<string>();
  for (const pattern of COMPANY_PATTERNS) {
    const s = patternStyle({ color: "#7C3AED", pattern });
    assert.equal(s.backgroundColor, "#7C3AED");
    if (pattern === "solido") continue;
    assert.match(s.backgroundImage, /gradient\(/);
    assert.ok(s.backgroundImage.includes(s.patternColor), `${pattern} usa el tono del dibujo`);
    assert.notEqual(s.patternColor, s.backgroundColor);
    images.add(s.backgroundImage);
  }
  assert.equal(images.size, 6, "los seis patrones con dibujo son distintos entre sí");
  // La escala cambia el tamaño del dibujo, no el tono.
  const big = patternStyle({ color: "#7C3AED", pattern: "puntos" }, 2);
  const small = patternStyle({ color: "#7C3AED", pattern: "puntos" }, 1);
  assert.notEqual(big.backgroundSize, small.backgroundSize);
  assert.equal(big.patternColor, small.patternColor);
});

test("el dibujo es un tono más claro u oscuro del mismo color, con diferencia moderada (EQP-08)", () => {
  for (const color of ["#0EA5E9", "#EA580C", "#CA8A04", "#7C3AED", "#16A34A", "#F4F5F7", "#101828"]) {
    const { patternColor } = patternTones(color);
    const diff = Math.abs(luminance(patternColor) - luminance(color));
    assert.ok(diff >= 0.03, `${color}: se ve (${diff.toFixed(3)})`);
    assert.ok(diff <= 0.45, `${color}: no es un cambio brusco (${diff.toFixed(3)})`);
  }
  // Con texto blanco el dibujo se oscurece (más contraste); con texto negro se aclara.
  assert.ok(luminance(patternTones("#1D4ED8").patternColor) < luminance("#1D4ED8"));
  assert.ok(luminance(patternTones("#EA580C").patternColor) > luminance("#EA580C"));
  assert.equal(patternTones("#F2F4F7").textColor, "#000000");
  assert.equal(patternTones("#1F2A3D").textColor, "#FFFFFF");
});

test("extremos: blanco, negro y grises medios siguen mostrando el dibujo y el texto cumple AA (EQP-08)", () => {
  for (const color of ["#FFFFFF", "#000000", "#808080", "#767676", "#777777", "#757575", "#FEFEFE", "#010101"]) {
    const s = patternStyle({ color, pattern: "rayas" });
    assert.ok(contrastRatio(s.textColor, s.backgroundColor) >= AA, `${color}: texto sobre el fondo`);
    assert.ok(contrastRatio(s.textColor, s.patternColor) >= AA, `${color}: texto sobre el dibujo`);
    assert.ok(Math.abs(luminance(s.patternColor) - luminance(color)) >= 0.03, `${color}: el dibujo se distingue`);
  }
  // Color mal escrito: gris de respaldo, sin romper.
  const bad = patternStyle({ color: "rojo", pattern: "puntos" });
  assert.equal(bad.backgroundColor, "#98A2B3");
});

test("barrido de colores: el texto recomendado cumple AA contra el fondo y contra el dibujo (EQP-08)", () => {
  const steps = [0, 51, 102, 128, 153, 204, 255];
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  let checked = 0;
  for (const r of steps) for (const g of steps) for (const b of steps) {
    const color = `#${hex(r)}${hex(g)}${hex(b)}`.toUpperCase();
    const { textColor, patternColor } = patternTones(color);
    assert.ok(contrastRatio(textColor, color) >= AA, `${color}: texto sobre el fondo`);
    assert.ok(contrastRatio(textColor, patternColor) >= AA, `${color}: texto sobre el dibujo`);
    checked++;
  }
  assert.equal(checked, 343);
});

test("monograma: texto legible sobre el fondo suave y su dibujo (EQP-08)", () => {
  for (const color of ["#0EA5E9", "#EA580C", "#CA8A04", "#7C3AED", "#16A34A", "#FFFFFF", "#000000"]) {
    for (const pattern of COMPANY_PATTERNS) {
      const css = monogramStyle({ color, pattern }, 32);
      const fill = patternStyle({ color: String(css.backgroundColor), pattern });
      assert.ok(contrastRatio(String(css.color), String(css.backgroundColor)) >= AA, `${color}/${pattern}`);
      assert.ok(contrastRatio(String(css.color), fill.patternColor) >= AA, `${color}/${pattern} sobre el dibujo`);
    }
  }
});

test("CompanyMark: logotipo con alt igual al nombre, o monograma con su sigla (EQP-07)", () => {
  const base = { name: "Compusol", code: "CO", color: "#EA580C", pattern: "rayas" };
  const logo = renderToStaticMarkup(createElement(CompanyMark, { company: { ...base, logo_url: "/api/companies/x/logo?v=abc" }, size: 40 }));
  assert.match(logo, /<img /);
  assert.match(logo, /alt="Compusol"/);
  assert.match(logo, /src="\/api\/companies\/x\/logo\?v=abc"/);
  assert.match(logo, /object-fit:contain/);
  assert.match(logo, /background:#FFFFFF/);
  assert.match(logo, /width="40"/);

  const mono = renderToStaticMarkup(createElement(CompanyMark, { company: { ...base, logo_url: null }, size: 40 }));
  assert.match(mono, /^<span /);
  assert.match(mono, /role="img"/);
  assert.match(mono, /aria-label="Compusol"/);
  assert.match(mono, />CO<\/span>$/);
  assert.match(mono, /repeating-linear-gradient/); // su patrón
  assert.match(mono, /width:40px;height:40px/);

  // Sin patrón ni logotipo: monograma liso.
  const plain = renderToStaticMarkup(createElement(CompanyMark, { company: { name: "Evolta", code: "EV", color: "#16A34A" } }));
  assert.ok(!plain.includes("gradient"));

  // Acompañando al nombre escrito: se oculta a lectores de pantalla.
  const deco = renderToStaticMarkup(createElement(CompanyMark, { company: { ...base, logo_url: "/x?v=1" }, decorative: true }));
  assert.match(deco, /alt=""/);
  assert.match(renderToStaticMarkup(createElement(CompanyMark, { company: base, decorative: true })), /aria-hidden="true"/);
});
