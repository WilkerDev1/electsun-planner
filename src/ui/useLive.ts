import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";

type LiveState<T> = { data: T | null; error: ApiError | null; fetchedAt: Date | null; offline: boolean; revoked: boolean };

/**
 * Datos de una vista en vivo (mural TV y móvil, MUR-10/11, MOV-07/09):
 * pide `path`, se suscribe a /api/events (con `eventsQuery`), consulta cada 60 s como respaldo
 * y guarda la última respuesta en localStorage para mostrarla sin conexión.
 */
const CACHE_TTL = 14 * 86400000;
export const CHANGE_DEBOUNCE = 1000;

export function useLive<T>(path: string, cacheKey: string, eventsQuery = "") {
  const [state, setState] = useState<LiveState<T>>(() => {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const { data, at } = JSON.parse(raw);
        // Pasados 14 días la copia local (con teléfonos del equipo) se descarta.
        if (Date.now() - new Date(at).getTime() > CACHE_TTL) localStorage.removeItem(cacheKey);
        else return { data, error: null, fetchedAt: new Date(at), offline: true, revoked: false };
      }
    } catch {
      /* sin almacenamiento */
    }
    return { data: null, error: null, fetchedAt: null, offline: false, revoked: false };
  });
  const inflight = useRef(false);
  const dirty = useRef(false);
  // El reintento tras `dirty` debe pedir la ruta actual, no la de la petición que acaba de terminar.
  const latest = useRef<() => Promise<void>>(async () => {});

  const load = useCallback(async (): Promise<void> => {
    // Si llega un cambio con una petición en curso, se repite al terminar para no quedarse con datos viejos.
    if (inflight.current) {
      dirty.current = true;
      return;
    }
    inflight.current = true;
    dirty.current = false;
    try {
      const data = await api<T>(path);
      const at = new Date();
      setState({ data, error: null, fetchedAt: at, offline: false, revoked: false });
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ data, at: at.toISOString() }));
      } catch {
        /* sin almacenamiento */
      }
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, "Sin conexión");
      if (err.status === 401 || err.status === 403)
        try {
          localStorage.removeItem(cacheKey);
        } catch {
          /* sin almacenamiento */
        }
      const denied = err.status === 401 || err.status === 403;
      // Sin permiso (revocado o en pausa) no se conservan datos: un fallo de red posterior no debe volver a mostrarlos.
      // Ante un error de red o 5xx sí se conserva la última copia (modo sin conexión).
      setState((s) => ({ ...s, ...(denied ? { data: null, fetchedAt: null } : {}), error: err, offline: err.status === 0, revoked: denied }));
    } finally {
      inflight.current = false;
      if (dirty.current) void latest.current();
    }
  }, [path, cacheKey]);
  useLayoutEffect(() => {
    latest.current = load;
  }, [load]);

  useEffect(() => {
    void load();
    const poll = setInterval(load, 60000);
    let source: EventSource | null = null;
    let retry = 1000;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    // Varios avisos seguidos (una importación, muchos guardados) se juntan en una sola recarga, 1 s después del último.
    let changeTimer: ReturnType<typeof setTimeout> | undefined;
    const onChange = () => {
      clearTimeout(changeTimer);
      changeTimer = setTimeout(() => void load(), CHANGE_DEBOUNCE);
    };
    const connect = () => {
      source = new EventSource("/api/events" + eventsQuery);
      source.addEventListener("ready", () => {
        retry = 1000;
      });
      source.addEventListener("change", onChange);
      source.addEventListener("revoked", () => void load());
      source.onerror = () => {
        source?.close();
        retryTimer = setTimeout(connect, retry);
        retry = Math.min(retry * 2, 30000);
      };
    };
    connect();
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", load);
    return () => {
      clearInterval(poll);
      clearTimeout(retryTimer);
      clearTimeout(changeTimer);
      source?.close();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", load);
    };
  }, [load, eventsQuery]);

  return { ...state, reload: load };
}
