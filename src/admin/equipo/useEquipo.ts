import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../../ui/api";
import type { Company, Employee, LevelItem, Team } from "../../../shared/contracts/equipo";
import type { Project } from "../../../shared/contracts/projects";
import type { EquipoData } from "./model";

/**
 * Carga empleados, equipos, empresas y (si ya existe) los proyectos para calcular la obra de cada equipo.
 * `GET /api/projects` puede no estar disponible todavía: en ese caso la pantalla degrada sin él.
 */
export function useEquipo() {
  const [data, setData] = useState<EquipoData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [employees, levels, teams, companies, projects] = await Promise.all([
        api<Employee[]>("/employees"),
        api<LevelItem[]>("/levels"),
        api<Team[]>("/teams"),
        api<Company[]>("/companies"),
        api<unknown>("/projects").then(
          (r) => (Array.isArray(r) ? (r as Project[]) : null),
          () => null,
        ),
      ]);
      setData({ employees, levels, levelsById: new Map(levels.map((l) => [l.id, l])), teams, companies, projects });
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar el equipo.");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, reload };
}
