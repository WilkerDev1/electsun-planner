import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../ui/api";
import type { ArchiveBulkResult, Project } from "../../../shared/contracts/projects";
import type { Status } from "../../../shared/contracts/statuses";
import type { Company, Employee, Team } from "../../../shared/contracts/equipo";
import type { PrepItem } from "../../../shared/contracts/prep";
import { mergeProject } from "../../../shared/domain";
import type { Catalogs, EditPatch } from "./model";

// Datos de la pantalla Proyectos con guardado automático optimista (PRY-03, PRY-11).
// Cada cambio se aplica al instante en la tabla y se envía en segundo plano; los cambios seguidos sobre un mismo
// proyecto se agrupan en un solo PATCH para no chocar con su propia versión. Si el servidor rechaza el cambio,
// se vuelve a la última versión confirmada y se avisa.

export type SaveState = "idle" | "saving" | "saved" | "error";
type SavedProject = Project & { warnings?: string[] };
type Queue = { busy: boolean; pending: EditPatch | null };

const strip = ({ warnings: _w, ...project }: SavedProject): Project => project;

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
            confirmed.current.set(id, project);
            setServerWarnings({ [id]: saved.warnings ?? [] });
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
      setServerWarnings({});
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
      const base = confirmed.current.get(id);
      try {
        lastActivity.current = Date.now();
        const done = strip(
          await api<SavedProject>(`/projects/${id}/${archived ? "archive" : "unarchive"}`, { body: { version: base?.version } }),
        );
        lastActivity.current = Date.now();
        confirmed.current.set(id, done);
        setRows((prev) => (prev ? prev.map((r) => (r.id === id ? done : r)) : prev));
        notifyRef.current(archived ? "Proyecto archivado" : "Proyecto desarchivado");
        return true;
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) await refreshRow(id).catch(() => undefined);
        notifyRef.current(e instanceof ApiError ? e.message : "No se pudo completar la acción.", "danger");
        return false;
      }
    },
    [refreshRow],
  );

  /** Archiva o restaura varios proyectos de una vez (PRY-10b). Devuelve cuántos cambiaron, o null si falló. */
  const archiveMany = useCallback(async (ids: string[], archived: boolean): Promise<number | null> => {
    try {
      lastActivity.current = Date.now();
      const out = await api<ArchiveBulkResult>("/projects/archive-bulk", { body: { ids, archived } });
      lastActivity.current = Date.now();
      const byId = new Map(out.projects.map((p) => [p.id, strip(p)]));
      for (const [id, p] of byId) confirmed.current.set(id, p);
      setRows((prev) => (prev ? prev.map((r) => byId.get(r.id) ?? r) : prev));
      return out.changed;
    } catch (e) {
      notifyRef.current(e instanceof ApiError ? e.message : "No se pudo completar la acción.", "danger");
      await loadProjects().catch(() => undefined);
      return null;
    }
  }, [loadProjects]);

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
