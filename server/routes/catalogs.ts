import { Router } from "express";
import { pool } from "../db.js";
import { authenticated } from "../auth.js";
import { listCompanies, listEmployees, listStatuses, listTeams } from "../queries.js";

// Lecturas de catálogos (F0). Las escrituras las añaden las fases B (estados) y C (equipo) en sus routers.
export const statusesRead = Router();
statusesRead.get("/", authenticated, async (_req, res) => res.json(await listStatuses(pool)));

export const companiesRead = Router();
companiesRead.get("/", authenticated, async (_req, res) => res.json(await listCompanies(pool)));

export const teamsRead = Router();
teamsRead.get("/", authenticated, async (_req, res) => res.json(await listTeams(pool)));

export const employeesRead = Router();
employeesRead.get("/", authenticated, async (_req, res) => res.json(await listEmployees(pool)));
