import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export const CANVAS_W = 1920;
export const CANVAS_H = 1080;

/**
 * Lienzo fijo de 1920×1080 escalado con `transform: scale()` para ocupar su contenedor sin deformarse (MUR-01).
 * El contenedor decide el tamaño: la pantalla completa en la TV o el marco de la vista previa.
 */
export function ScaledCanvas({ children, className = "", style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(Math.min(el.clientWidth / CANVAS_W, el.clientHeight / CANVAS_H));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className={`relative overflow-hidden ${className}`} style={style}>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: CANVAS_W,
          height: CANVAS_H,
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: "center",
          visibility: scale ? "visible" : "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}
