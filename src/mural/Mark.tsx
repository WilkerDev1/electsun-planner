import { useState, type CSSProperties } from "react";
import { patternStyle, type CompanyPattern } from "../../shared/pattern";
import { monogramStyle } from "../ui/CompanyMark";
import type { CompanyTint } from "../../shared/mural-model";

// Marca de empresa para el mural (EQP-07, EQP-08): logotipo si lo hay; si falla (TV sin internet, caché vacía) o no hay,
// el monograma con su color y patrón. Variante local de CompanyMark: el texto del mural nunca baja de 22 px (MUR-01).

type MarkCompany = Pick<CompanyTint, "code" | "name" | "color" | "pattern" | "logo_url">;

export function MuralMark({ company, size = 46, round = true }: { company: MarkCompany; size?: number; round?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  const url = company.logo_url;
  const box: CSSProperties = { width: size, height: size, flexShrink: 0, borderRadius: round ? "50%" : 12, boxSizing: "border-box" };
  if (url && failed !== url)
    return (
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        decoding="async"
        draggable={false}
        onError={() => setFailed(url)}
        style={{ ...box, objectFit: "contain", background: "#FFFFFF", border: "1px solid #D0D5DD", padding: 3 }}
      />
    );
  return (
    <div
      aria-hidden
      style={{ ...box, ...monogramStyle(company, size), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em" }}
    >
      {company.code}
    </div>
  );
}

/** Punto de color de empresa con su patrón (más grande que un punto liso para que el dibujo se distinga a distancia). */
export function PatternDot({ color, pattern, size = 18 }: { color: string; pattern?: CompanyPattern | null; size?: number }) {
  const s = patternStyle({ color, pattern }, Math.max(0.6, size / 24));
  return (
    <span
      aria-hidden
      style={{
        width: size, height: size, flexShrink: 0, borderRadius: "50%", boxSizing: "border-box",
        border: "1px solid rgba(27,31,39,0.35)",
        backgroundColor: s.backgroundColor, backgroundImage: s.backgroundImage, backgroundSize: s.backgroundSize, backgroundPosition: s.backgroundPosition,
      }}
    />
  );
}
