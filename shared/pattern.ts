// Patrones de color de empresa (EQP-08). Función pura, sin dependencias: la usan el servidor (catálogo cerrado),
// las pantallas (estilo CSS) y las pruebas (contraste).

export const COMPANY_PATTERNS = [
  "solido",
  "rayas",
  "rayas_finas",
  "puntos",
  "cuadricula",
  "zigzag",
  "diagonal_cruzada",
] as const;
export type CompanyPattern = (typeof COMPANY_PATTERNS)[number];

/** Etiqueta en español de cada patrón, para el selector. */
export const PATTERN_LABELS: Record<CompanyPattern, string> = {
  solido: "Sólido",
  rayas: "Rayas",
  rayas_finas: "Rayas finas",
  puntos: "Puntos",
  cuadricula: "Cuadrícula",
  zigzag: "Zigzag",
  diagonal_cruzada: "Diagonal cruzada",
};

export const DEFAULT_PATTERN: CompanyPattern = "solido";

export const isCompanyPattern = (v: unknown): v is CompanyPattern =>
  typeof v === "string" && (COMPANY_PATTERNS as readonly string[]).includes(v);

/** Contraste mínimo AA para texto normal. */
export const AA = 4.5;

const FALLBACK_COLOR = "#98A2B3";
const HEX = /^#[0-9a-f]{6}$/i;

const rgbOf = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const hexOf = (rgb: number[]) => "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();

/** Luminancia relativa WCAG de un color #rrggbb (0 = negro, 1 = blanco). */
export function luminance(hex: string): number {
  const [r, g, b] = rgbOf(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razón de contraste WCAG entre dos colores #rrggbb (1…21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Mezcla `hex` con `to` (t = 0 deja `hex`, t = 1 da `to`). */
function mix(hex: string, to: string, t: number): string {
  const a = rgbOf(hex);
  const b = rgbOf(to);
  return hexOf(a.map((v, i) => v + (b[i] - v) * t));
}

const LIGHT_TEXT = "#FFFFFF";
const DARK_TEXT = "#000000";
/** Cuánto se acerca el dibujo al blanco o al negro: una diferencia moderada. */
const SHIFT = 0.2;
/** Diferencia mínima de luminancia para que el dibujo se vea sobre el fondo. */
const MIN_VISIBLE = 0.03;

/**
 * Color del dibujo y del texto para un fondo. El texto es blanco o negro (el de más contraste con el fondo, siempre ≥ 4,58)
 * y el dibujo se aleja del texto, de modo que el contraste del texto con el dibujo nunca es menor que con el fondo.
 * Con fondos casi blancos o casi negros el dibujo no puede alejarse más: va hacia el texto, hasta donde siga cumpliendo AA.
 */
export function patternTones(base: string): { textColor: string; patternColor: string } {
  const color = HEX.test(base) ? base.toUpperCase() : FALLBACK_COLOR;
  const textColor = contrastRatio(color, LIGHT_TEXT) >= contrastRatio(color, DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT;
  const away = mix(color, textColor === DARK_TEXT ? LIGHT_TEXT : DARK_TEXT, SHIFT);
  if (Math.abs(luminance(away) - luminance(color)) >= MIN_VISIBLE) return { textColor, patternColor: away };
  for (const t of [SHIFT, 0.15, 0.1, 0.07]) {
    const toward = mix(color, textColor, t);
    if (contrastRatio(toward, textColor) >= AA) return { textColor, patternColor: toward };
  }
  return { textColor, patternColor: away };
}

export type PatternStyle = {
  backgroundColor: string;
  /** Gradientes repetidos, o "none" si el patrón es sólido. */
  backgroundImage: string;
  backgroundSize: string;
  backgroundPosition: string;
  /** Texto recomendado sobre este fondo: cumple AA contra el color base y contra el dibujo. */
  textColor: string;
  /** Tono del dibujo (más claro u oscuro que el color base). */
  patternColor: string;
};

/**
 * Estilo CSS de un color con su patrón: `style={{ backgroundColor, backgroundImage, backgroundSize, backgroundPosition, color: textColor }}`.
 * `scale` agranda o encoge el dibujo (1 = marcas de unos 6 px; usa 0,5 en puntos de 10 px y 2 en tarjetas grandes).
 */
export function patternStyle(
  company: { color: string; pattern?: CompanyPattern | string | null },
  scale = 1,
): PatternStyle {
  const backgroundColor = HEX.test(company.color) ? company.color.toUpperCase() : FALLBACK_COLOR;
  const { textColor, patternColor: p } = patternTones(backgroundColor);
  const px = (n: number) => `${Math.max(0.5, Math.round(n * scale * 100) / 100)}px`;
  const base = { backgroundColor, textColor, patternColor: p };
  switch (isCompanyPattern(company.pattern) ? company.pattern : DEFAULT_PATTERN) {
    case "rayas":
      return {
        ...base,
        backgroundImage: `repeating-linear-gradient(135deg, ${p} 0, ${p} ${px(3)}, transparent ${px(3)}, transparent ${px(7)})`,
        backgroundSize: "auto",
        backgroundPosition: "0 0",
      };
    case "rayas_finas":
      return {
        ...base,
        backgroundImage: `repeating-linear-gradient(90deg, ${p} 0, ${p} ${px(1)}, transparent ${px(1)}, transparent ${px(4)})`,
        backgroundSize: "auto",
        backgroundPosition: "0 0",
      };
    case "puntos":
      return {
        ...base,
        backgroundImage: `radial-gradient(circle, ${p} ${px(1.4)}, transparent ${px(1.7)})`,
        backgroundSize: `${px(6)} ${px(6)}`,
        backgroundPosition: "0 0",
      };
    case "cuadricula":
      return {
        ...base,
        backgroundImage: `linear-gradient(${p} ${px(1)}, transparent ${px(1)}), linear-gradient(90deg, ${p} ${px(1)}, transparent ${px(1)})`,
        backgroundSize: `${px(6)} ${px(6)}`,
        backgroundPosition: "0 0",
      };
    case "zigzag": {
      const h = px(4);
      return {
        ...base,
        backgroundImage: `linear-gradient(135deg, ${p} 25%, transparent 25%), linear-gradient(225deg, ${p} 25%, transparent 25%), linear-gradient(315deg, ${p} 25%, transparent 25%), linear-gradient(45deg, ${p} 25%, transparent 25%)`,
        backgroundSize: `${px(8)} ${px(8)}`,
        backgroundPosition: `-${h} 0, -${h} 0, 0 0, 0 0`,
      };
    }
    case "diagonal_cruzada":
      return {
        ...base,
        backgroundImage: `repeating-linear-gradient(45deg, ${p} 0, ${p} ${px(1)}, transparent ${px(1)}, transparent ${px(6)}), repeating-linear-gradient(-45deg, ${p} 0, ${p} ${px(1)}, transparent ${px(1)}, transparent ${px(6)})`,
        backgroundSize: "auto",
        backgroundPosition: "0 0",
      };
    default:
      return { ...base, backgroundImage: "none", backgroundSize: "auto", backgroundPosition: "0 0" };
  }
}
