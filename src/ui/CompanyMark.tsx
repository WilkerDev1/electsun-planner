import { useState, type CSSProperties } from "react";
import { monogramColors } from "../../shared/domain";
import { AA, contrastRatio, patternStyle, type CompanyPattern } from "../../shared/pattern";

// Marca de una empresa en cualquier pantalla (EQP-07, EQP-08): su logotipo si lo tiene; si no, el monograma de 2 letras
// con su color y su patrón. Pieza compartida por el mural, la tabla, el móvil y los ajustes.

export type CompanyMarkData = {
  name: string;
  code: string;
  color: string;
  pattern?: CompanyPattern | string | null;
  logo_url?: string | null;
};

/** Estilo del monograma: fondo suave del color de la empresa con su patrón, y un texto que se lee sobre ambos (AA). */
export function monogramStyle(company: Pick<CompanyMarkData, "color" | "pattern">, size: number): CSSProperties {
  const soft = monogramColors(company.color);
  const fill = patternStyle({ color: soft.bg, pattern: company.pattern }, Math.max(0.6, size / 32));
  // El texto del mismo tono (oscuro) si cumple AA sobre el fondo y sobre el dibujo; si no, el recomendado (blanco o negro).
  const color =
    contrastRatio(soft.fg, fill.backgroundColor) >= AA && contrastRatio(soft.fg, fill.patternColor) >= AA ? soft.fg : fill.textColor;
  return {
    backgroundColor: fill.backgroundColor,
    backgroundImage: fill.backgroundImage,
    backgroundSize: fill.backgroundSize,
    backgroundPosition: fill.backgroundPosition,
    color,
  };
}

type Props = {
  company: CompanyMarkData;
  /** Lado en píxeles. */
  size?: number;
  /** Esquinas: círculo o cuadrado redondeado (por defecto). */
  shape?: "round" | "square";
  className?: string;
  /** La mark acompaña al nombre escrito al lado: se oculta a lectores de pantalla en vez de repetirlo. */
  decorative?: boolean;
};

export function CompanyMark({ company, size = 32, shape = "square", className = "", decorative = false }: Props) {
  // Si la imagen no carga (sin conexión, archivo borrado), se vuelve al monograma hasta que cambie el logotipo.
  const [failed, setFailed] = useState<string | null>(null);
  const radius = shape === "round" ? "9999px" : Math.max(4, Math.round(size / 4)) + "px";
  const box: CSSProperties = { width: size, height: size, borderRadius: radius, flex: "none" };
  const url = company.logo_url ?? null;

  if (url && failed !== url)
    return (
      <img
        src={url}
        alt={decorative ? "" : company.name}
        width={size}
        height={size}
        decoding="async"
        draggable={false}
        onError={() => setFailed(url)}
        className={`inline-block border border-line ${className}`.trim()}
        style={{ ...box, objectFit: "contain", background: "#FFFFFF" }}
      />
    );

  return (
    <span
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": company.name })}
      className={`inline-flex select-none items-center justify-center font-extrabold leading-none ${className}`.trim()}
      style={{ ...box, ...monogramStyle(company, size), fontSize: Math.max(10, Math.round(size * 0.4)) }}
    >
      {company.code}
    </span>
  );
}
