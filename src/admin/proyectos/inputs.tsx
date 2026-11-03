import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";

// Campos con guardado automático: el texto se ve al instante y se envía al dejar de escribir o al salir del campo.

type Draft = { value: string; commit: (v: string) => void; delay: number; valid?: (v: string) => boolean };

function useDraft({ value, commit, delay, valid }: Draft) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef({ draft, value, commit, valid });
  latest.current = { draft, value, commit, valid };

  // Si el valor cambia desde fuera (otra persona, otro campo) y no estamos escribiendo, se actualiza.
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const { draft: d, value: v, commit: c, valid: ok } = latest.current;
    if (d !== v && (!ok || ok(d))) c(d);
  }, []);
  // Al desmontar (cerrar el panel, cambiar de proyecto) se guarda lo pendiente.
  useEffect(() => flush, [flush]);

  return {
    value: draft,
    onChange: (v: string) => {
      setDraft(v);
      latest.current.draft = v;
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      flush();
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) flush();
      if (e.key === "Escape") {
        clearTimeout(timer.current);
        setDraft(latest.current.value);
        latest.current.draft = latest.current.value;
      }
    },
  };
}

type TextProps = Omit<ComponentProps<"input">, "value" | "onChange"> & {
  value: string;
  onCommit: (v: string) => void;
  valid?: (v: string) => boolean;
  delay?: number;
};
export function AutoText({ value, onCommit, valid, delay = 700, ...rest }: TextProps) {
  const d = useDraft({ value, commit: onCommit, delay, valid });
  return <input {...rest} value={d.value} onChange={(e) => d.onChange(e.target.value)} onFocus={d.onFocus} onBlur={d.onBlur} onKeyDown={d.onKeyDown} />;
}

type AreaProps = Omit<ComponentProps<"textarea">, "value" | "onChange"> & {
  value: string;
  onCommit: (v: string) => void;
  delay?: number;
};
export function AutoArea({ value, onCommit, delay = 900, ...rest }: AreaProps) {
  const d = useDraft({ value, commit: onCommit, delay });
  return <textarea {...rest} value={d.value} onChange={(e) => d.onChange(e.target.value)} onFocus={d.onFocus} onBlur={d.onBlur} onKeyDown={d.onKeyDown} />;
}

/** Fecha completa y razonable (el navegador emite fechas parciales mientras se teclea el año). */
const plausibleDate = (v: string) => v === "" || (/^\d{4}-\d{2}-\d{2}$/.test(v) && v >= "2000-01-01" && v <= "2100-12-31");

type DateProps = Omit<ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value: string | null;
  onCommit: (v: string | null) => void;
};
export function AutoDate({ value, onCommit, ...rest }: DateProps) {
  const d = useDraft({ value: value ?? "", commit: (v) => onCommit(v || null), delay: 500, valid: plausibleDate });
  return <input {...rest} type="date" value={d.value} min="2000-01-01" max="2100-12-31" onChange={(e) => d.onChange(e.target.value)} onFocus={d.onFocus} onBlur={d.onBlur} onKeyDown={d.onKeyDown} />;
}
