import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

// Capa flotante anclada a un botón (menú de fila, selector de preparación). Va en un portal con posición fija
// para que la tabla, que hace scroll, no la recorte. Escape o un clic fuera la cierran y el foco vuelve al botón.

type Props = {
  anchor: RefObject<HTMLElement | null>;
  onClose: () => void;
  role: "menu" | "dialog";
  label: string;
  width?: number;
  children: ReactNode;
};

export function Floating({ anchor, onClose, role, label, width = 240, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useLayoutEffect(() => {
    const a = anchor.current;
    const box = ref.current;
    if (!a || !box) return;
    const r = a.getBoundingClientRect();
    const h = box.offsetHeight;
    const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8));
    const below = r.bottom + 6;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 6) : below;
    setPos({ top, left });
  }, [anchor, width]);

  useEffect(() => {
    const el = anchor.current;
    const close = (restore: boolean) => {
      closeRef.current();
      if (restore) el?.focus();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(true);
      } else if (role === "menu" && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
        if (!items.length) return;
        e.preventDefault();
        const at = items.indexOf(document.activeElement as HTMLElement);
        items[(at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      } else if (e.key === "Tab" && role === "menu") close(false);
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !el?.contains(t)) close(false);
    };
    const onScroll = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    ref.current?.querySelector<HTMLElement>('[role="menuitem"], input, button, a')?.focus();
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [anchor, role]);

  return createPortal(
    <div
      ref={ref}
      role={role}
      aria-label={label}
      className="fixed z-50 rounded-xl border border-line bg-white p-1.5 text-sm shadow-[0_12px_32px_rgba(16,24,40,0.16)]"
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, width, visibility: pos ? "visible" : "hidden" }}
    >
      {children}
    </div>,
    document.body,
  );
}
