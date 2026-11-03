import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../ui/api";
import type { ArchiveBulkResult, Project } from "../../../shared/contracts/projects";
import type { Status } from "../../../shared/contracts/statuses";
import type { Company, Employee, Team } from "../../../shared/contracts/equipo";
import type { PrepItem } from "../../../shared/contracts/prep";
import { mergeProject } from "../../../shared/domain";
import { chunk, isStaleResponse, type Catalogs, type EditPatch } from "./model";

// Datos de la pantalla Proyectos con guardado automático optimista (PRY-03, PRY-11).
// Cada cambio se aplica al instante en la tabla y se envía en segundo plano; los cambios seguidos sobre un mismo
// proyecto se agrupan en un solo PATCH para no chocar con su propia versión. Si el servidor rechaza el cambio,
// se vuelve a la última versión confirmada y se avisa.

export type SaveState = "idle" | "saving" | "saved" | "error";
type SavedProject = Project & { warnings?: string[]; coded_warnings?: { code: string; text: string }[] };
type Queue = { busy: boolean; pending: EditPatch | null };

const hasError = (w?: { code: string }[]) => !!w?.some((x) => x.code === "error");
/** Avisos del servidor por proyecto: `undefined` borra la clave (así `warnOf` no usa avisos viejos). */
const withWarnings = (prev: Record<string, string[]>, id: string, list: string[] | undefined) => {
  if (list === undefined) {
    if (!(id in prev)) return prev;
    const { [id]: _drop, ...rest } = prev;
    return rest;
  }
  return { ...prev, [id]: list };
};
const strip = ({ warnings: _w, coded_warnings: _c, ...project }: SavedProject): Project => project;

export function useProjects(today: string, notify: (message: string, tone?: "ok" | "danger") => void) {
  const [rows, setRows] = useState<Project[] | null>(null);
  const [catalogs, setCatalogs] = useState<Catalogs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>("idle");
  const [lastError, setLastError] = useState<string | null>(null);
  const [serverWarnings, setServerWarnings] = useState<Record<string, string[]>>({});

  const confirmed = useRef(new Map<string, Project>());
  const queues = useRef(new Map<string, Queue>());
  const inflight = useRef(0);
  const lastActivity = useRef(0);
  const statusesRef = useRef<Map<string, Status>>(new Map());
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const loadSeq = useRef(0);
  const loadProjects = useCallback(async () => {
    const seq = ++loadSeq.current;
    const list = await api<Project[]>("/projects?archived=1");
    // Solo vale la última carga, y nunca mientras haya un guardado optimista en vuelo.
    if (seq !== loadSeq.current || inflight.current > 0) return;
    confirmed.current = new Map(list.map((p) => [p.id, p]));
    setRows(list);
    setServerWarnings({});
  }, []);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const [statuses, companies, teams, employees, prepItems] = await Promise.all([
        api<Status[]>("/statuses"),
        api<Company[]>("/companies"),
        api<Team[]>("/teams"),
        api<Employee[]>("/employees"),
        api<PrepItem[]>("/prep-items"),
      ]);
      statusesRef.current = new Map(statuses.map((s) => [s.id, s]));
      setCatalogs({ statuses, companies, teams, employees, prepItems });
      await loadProjects();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudieron cargar los proyectos.");
    }
  }, [loadProjects]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Cambios de otras personas (SSE) y respaldo cada 60 s. Se ignoran los ecos de los propios guardados.
  useEffect(() => {
    const refresh = () => {
      if (inflight.current > 0 || Date.now() - lastActivity.current < 1500) return;
      void loadProjects().catch(() => undefined);
    };
    const source = new EventSource("/api/events");
    source.addEventListener("change", refresh);
    const poll = setInterval(() => document.visibilityState === "visible" && refresh(), 60000);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      source.close();
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadProjects]);

  /** Vuelve a pedir una fila (tras un 409 o para abrir un proyecto archivado). */
  const refreshRow = useCallback(async (id: string) => {
    const fresh = await api<Project>(`/projects/${id}`);
    confirmed.current.set(id, fresh);
    setRows((prev) => (prev?.some((r) => r.id === id) ? prev.map((r) => (r.id === id ? fresh : r)) : [...(prev ?? []), fresh]));
    return fresh;
  }, []);

  const flush = useCallback(
    async (id: string) => {
      const q = queues.current.get(id)!;
      q.busy = true;
      inflight.current++;
      setSave("saving");
      try {
        while (q.pending) {
          const body = q.pending;
          q.pending = null;
          const base = confirmed.current.get(id);
          if (!base) break;
          try {
            lastActivity.current = Date.now();
            const saved = await api<SavedProject>(`/projects/${id}`, { method: "PATCH", body: { ...body, version: base.version } });
            lastActivity.current = Date.now();
            const project = strip(saved);
            // Una respuesta antigua no pisa un estado más nuevo (por ejemplo, un archivado ya aplicado).
            if (isStaleResponse(confirmed.current.get(id)?.version, project.version)) continue;
            confirmed.current.set(id, project);
            setServerWarnings((prev) => withWarnings(prev, id, saved.warnings ?? []));
            setLastError(null);
            // Si hay más cambios en cola, la fila sigue mostrando la versión optimista.
            setRows((prev) =>
              prev ? prev.map((r) => (r.id === id ? (q.pending ? { ...r, version: project.version, updated_at: project.updated_at } : project) : r)) : prev,
            );
          } catch (e) {
            q.pending = null;
            const message = e instanceof ApiError ? e.message : "Sin conexión. No se guardó el cambio.";
            if (e instanceof ApiError && e.status === 409) {
              notifyRef.current("Otra persona cambió este proyecto. Se cargó la versión más reciente.", "danger");
              await refreshRow(id).catch(() => undefined);
            } else {
              notifyRef.current(message, "danger");
              const back = confirmed.current.get(id);
              if (back) setRows((prev) => (prev ? prev.map((r) => (r.id === id ? back : r)) : prev));
            }
            setLastError(message);
            setSave("error");
            return;
          }
        }
        setSave("saved");
      } finally {
        q.busy = false;
        inflight.current--;
      }
    },
    [refreshRow],
  );

  /** Espera a que termine el guardado en vuelo de estas filas, para usar su versión ya confirmada. */
  const waitIdle = useCallback(async (ids: string[]) => {
    const limit = Date.now() + 10000;
    while (Date.now() < limit && ids.some((id) => queues.current.get(id)?.busy || queues.current.get(id)?.pending)) {
      await new Promise((r) => setTimeout(r, 25));
    }
  }, []);

  /** Aplica el cambio ya y lo guarda en segundo plano. */
  const patch = useCallback(
    (id: string, fields: EditPatch) => {
      setRows((prev) =>
        prev
          ? prev.map((r) => {
              if (r.id !== id) return r;
              const kind = (fields.status_id ? statusesRef.current.get(fields.status_id)?.kind : undefined) ?? r.status_kind;
              return { ...mergeProject(r, fields as Partial<Project>, kind, today), status_kind: kind };
            })
          : prev,
      );
      setServerWarnings((prev) => withWarnings(prev, id, undefined));
      const q = queues.current.get(id) ?? { busy: false, pending: null };
      queues.current.set(id, q);
      q.pending = { ...q.pending, ...fields };
      if (!q.busy) void flush(id);
    },
    [flush, today],
  );

  const create = useCallback(async (companyId: string, name: string): Promise<Project | null> => {
    try {
      setSave("saving");
      lastActivity.current = Date.now();
      const created = strip(await api<SavedProject>("/projects", { body: { company_id: companyId, name } }));
      lastActivity.current = Date.now();
      confirmed.current.set(created.id, created);
      setRows((prev) => [created, ...(prev ?? [])]);
      setSave("saved");
      return created;
    } catch (e) {
      setSave("error");
      notifyRef.current(e instanceof ApiError ? e.message : "No se pudo crear el proyecto.", "danger");
      return null;
    }
  }, []);

  const setArchived = useCallback(
    async (id: string, archived: boolean) => {
      await waitIdle([id]);
      const base = confirmed.current.get(id);
      try {
        lastActivity.current = Date.now();
        const saved = await api<SavedProject>(`/projects/${id}/${archived ? "archive" : "unarchive"}`, { body: { version: base?.version } });
        const done = strip(saved);
        lastActivity.current = Date.now();
        confirmed.current.set(id, done);
        setServerWarnings((prev) => withWarnings(prev, id, archived ? undefined : saved.warnings ?? []));
        setRows((prev) => (prev ? prev.map((r) => (r.id === id ? done : r)) : prev));
        notifyRef.current(
          archived
            ? "Proyecto archivado"
            : hasError(saved.coded_warnings)
              ? `Restaurado. Revisa los avisos de ${done.name}`
              : "Proyecto desarchivado",
        );
        return true;
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) await refreshRow(id).catch(() => undefined);
        notifyRef.current(e instanceof ApiError ? e.message : "No se pudo completar la acción.", "danger");
        return false;
      }
    },
    [refreshRow, waitIdle],
  );

  /** Archiva o restaura varios proyectos de una vez (PRY-10b). Devuelve cuántos cambiaron, o null si falló. */
  const archiveMany = useCallback(async (ids: string[], archived: boolean): Promise<number | null> => {
    await waitIdle(ids);
    let changed = 0;
    let withErrors = 0;
    let failed: string | null = null;
    // El servidor admite hasta 200 ids por llamada: se trocea y se avisa si algún lote falla.
    for (const batch of chunk(ids)) {
      try {
        lastActivity.current = Date.now();
        const out = await api<ArchiveBulkResult>("/projects/archive-bulk", { body: { ids: batch, archived } });
        lastActivity.current = Date.now();
        const byId = new Map(out.projects.map((p) => [p.id, strip(p)]));
        for (const [id, p] of byId) confirmed.current.set(id, p);
        setServerWarnings((prev) => {
          let next = prev;
          for (const id of byId.keys()) next = withWarnings(next, id, archived ? undefined : out.warnings?.[id]?.warnings ?? []);
          return next;
        });
        for (const id of byId.keys()) if (!archived && hasError(out.warnings?.[id]?.coded_warnings)) withErrors++;
        setRows((prev) => (prev ? prev.map((r) => byId.get(r.id) ?? r) : prev));
        changed += out.changed;
      } catch (e) {
        failed = e instanceof ApiError ? e.message : "No se pudo completar la acción.";
        break;
      }
    }
    if (failed !== null) {
      const review = withErrors ? ` Revisa los avisos de ${withErrors} ${withErrors === 1 ? "proyecto restaurado" : "proyectos restaurados"}.` : "";
      notifyRef.current(changed > 0 ? `${failed} Se completaron ${changed} de ${ids.length}.${review}` : failed, "danger");
      await loadProjects().catch(() => undefined);
      return changed > 0 ? changed : null;
    }
    if (withErrors) notifyRef.current(withErrors === 1 ? "Restaurado. Revisa los avisos de 1 proyecto" : `Restaurados. Revisa los avisos de ${withErrors} proyectos`);
    return changed;
  }, [loadProjects, waitIdle]);

  return {
    rows,
    catalogs,
    error,
    save,
    lastError,
    serverWarnings,
    patch,
    create,
    setArchived,
    archiveMany,
    refreshRow,
    reload: loadAll,
    reloadProjects: loadProjects,
  };
}
