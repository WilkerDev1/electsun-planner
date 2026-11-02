// Datos de demostración FICTICIOS (ALC-05). Las fechas están escritas para "hoy" = martes 27 oct 2026;
// server/seed.ts las desplaza semanas completas para que la demo siempre parezca actual.
import type { Level, EmployeeState, SystemType } from "./domain.js";

export const DEMO_TODAY = "2026-10-27";

export const demoCompanies = [
  { name: "Electsun", code: "EL", color: "#0EA5E9" },
  { name: "Compusol", code: "CO", color: "#EA580C" },
  { name: "EcoSur", code: "EC", color: "#CA8A04" },
  { name: "Enerval", code: "EN", color: "#7C3AED" },
  { name: "Evolta", code: "EV", color: "#16A34A" },
];

export const demoTeams = [
  { code: "E1", name: "Equipo 1", lead: "Ramón Tejada" },
  { code: "E2", name: "Equipo 2", lead: "Juan Carlos Méndez" },
  { code: "E3", name: "Equipo 3", lead: "Pedro Almonte" },
];

type DemoEmployee = { name: string; job: string; level: Level; team: string; state?: EmployeeState; phone: string };
export const demoEmployees: DemoEmployee[] = [
  { name: "Miguel Fermín", job: "Supervisor de obras", level: "Supervisor", team: "", phone: "809-555-0101" },
  { name: "Ramón Tejada", job: "Electricista", level: "Encargado", team: "E1", phone: "809-555-0102" },
  { name: "Juan Carlos Méndez", job: "Electricista", level: "Encargado", team: "E2", phone: "809-555-0103" },
  { name: "Pedro Almonte", job: "Electricista", level: "Encargado", team: "E3", phone: "809-555-0104" },
  { name: "Luis Peña", job: "Instalador", level: "Técnico", team: "E1", phone: "809-555-0105" },
  { name: "Kelvin Rosario", job: "Instalador", level: "Técnico", team: "E1", state: "Vacaciones", phone: "809-555-0106" },
  { name: "Wander Ortiz", job: "Instalador", level: "Técnico", team: "E2", phone: "809-555-0107" },
  { name: "Félix Santana", job: "Electricista", level: "Técnico", team: "E2", phone: "809-555-0108" },
  { name: "Starlin Reyes", job: "Instalador", level: "Técnico", team: "E3", phone: "809-555-0109" },
  { name: "Manuel Vargas", job: "Ayudante de montaje", level: "Ayudante", team: "E3", phone: "809-555-0110" },
  { name: "Yokasta Rodríguez", job: "Oficina administrativa", level: "Oficina", team: "", phone: "809-555-0111" },
  { name: "Carlos Batista", job: "Ingeniería", level: "Oficina", team: "", phone: "809-555-0112" },
  { name: "Ana Guzmán", job: "Compras", level: "Oficina", team: "", phone: "809-555-0113" },
];

export type DemoProject = {
  company: string;
  name: string;
  kwp: string;
  sale: string;
  place: string;
  team: string;
  start: string;
  end: string;
  status: string;
  notes?: string;
  mural?: boolean;
  priority?: boolean;
  pause?: string;
  part?: string;
  type: SystemType;
  prep: [boolean, boolean, boolean];
  actualEnd?: string;
};

// Mismos 18 proyectos que design/v4/V4Proyectos.dc.html.
export const demoProjects: DemoProject[] = [
  { company: "EcoSur", name: "Colegio Arcoíris", kwp: "97.28", sale: "2026-10-13", place: "La Romana", team: "E1", start: "2026-10-19", end: "2026-10-30", status: "En obra", priority: true, type: "hibrido", prep: [true, true, false] },
  { company: "Electsun", name: "Taller Motormax", kwp: "73.08", sale: "2026-09-23", place: "Punta Cana", team: "E2", start: "2026-10-19", end: "2026-11-06", status: "En obra", notes: "Faltan grapas; llegan mié 28 en la mañana", mural: true, type: "neta", prep: [true, true, true] },
  { company: "Electsun", name: "Granja Los Pinos", kwp: "12.29", sale: "2026-07-27", place: "Monte Cristi", team: "E3", start: "2026-10-22", end: "2026-10-26", status: "En obra", type: "hibrido", prep: [true, true, false] },
  { company: "Enerval", name: "Carla Méndez", kwp: "13.00", sale: "2026-10-05", place: "Santo Domingo", team: "E3", start: "2026-10-29", end: "2026-10-29", status: "Programado", notes: "Se instala primero la parte 1 (8 paneles)", mural: true, part: "Parte 1", type: "neta", prep: [true, true, true] },
  { company: "Enerval", name: "Tomás Rivera", kwp: "12.35", sale: "2026-10-05", place: "Santo Domingo", team: "E3", start: "2026-10-30", end: "2026-10-30", status: "Programado", notes: "Se instala primero la parte 1 (11 paneles)", mural: true, part: "Parte 1", type: "neta", prep: [true, true, true] },
  { company: "Compusol", name: "Lucía Esther Gómez Paredes", kwp: "8.19", sale: "2026-10-12", place: "Santo Domingo", team: "E1", start: "2026-11-02", end: "2026-11-02", status: "Programado", type: "neta", prep: [true, false, true] },
  { company: "Evolta", name: "Rafael Castillo Medina", kwp: "17.26", sale: "2026-10-15", place: "La Vega", team: "E3", start: "2026-11-03", end: "2026-11-04", status: "Programado", type: "hibrido", prep: [true, true, false] },
  { company: "Compusol", name: "Andrés Polanco Ruiz", kwp: "15.24", sale: "2026-10-09", place: "Santo Domingo", team: "E1", start: "2026-11-04", end: "2026-11-06", status: "Programado", type: "neta", prep: [true, true, true] },
  { company: "Compusol", name: "Sr. Herrera", kwp: "17.00", sale: "2026-10-13", place: "Punta Cana", team: "E3", start: "2026-11-05", end: "2026-11-06", status: "Programado", type: "neta", prep: [true, true, true] },
  { company: "Electsun", name: "Paola Núñez", kwp: "6.77", sale: "2026-10-09", place: "Santo Domingo Norte", team: "", start: "", end: "", status: "Por programar", priority: true, type: "neta", prep: [true, false, false] },
  { company: "Evolta", name: "Kevin Almánzar", kwp: "5.36", sale: "2026-10-12", place: "Haina", team: "", start: "", end: "", status: "Por programar", type: "hibrido", prep: [false, false, false] },
  { company: "Evolta", name: "Héctor Liriano Sosa", kwp: "7.14", sale: "2026-10-13", place: "San Cristóbal", team: "", start: "", end: "", status: "En pausa", pause: "Esperando documentos del cliente", type: "neta", prep: [true, true, false] },
  { company: "Evolta", name: "Oficina Evolta", kwp: "6.50", sale: "2026-10-17", place: "Santo Domingo", team: "", start: "", end: "", status: "Por programar", type: "neta", prep: [true, true, false] },
  { company: "Evolta", name: "Proyecto Elena Cabrera", kwp: "12.70", sale: "2026-10-17", place: "Arroyo Hondo", team: "", start: "", end: "", status: "Por programar", type: "hibrido", prep: [true, false, false] },
  { company: "Evolta", name: "Villa Serena (Mario Abreu)", kwp: "14.61", sale: "2026-10-17", place: "Santo Domingo Este", team: "", start: "", end: "", status: "Por programar", type: "neta", prep: [true, true, true] },
  { company: "EcoSur", name: "Lácteos del Valle", kwp: "69.12", sale: "2026-09-10", place: "La Romana", team: "E2", start: "2026-09-14", end: "2026-09-25", status: "Terminado", type: "hibrido", prep: [true, true, false], actualEnd: "2026-09-25" },
  { company: "Compusol", name: "Panadería La Espiga", kwp: "17.60", sale: "2026-09-10", place: "Santiago", team: "E1", start: "2026-09-02", end: "2026-09-04", status: "Terminado", type: "neta", prep: [true, true, true], actualEnd: "2026-09-04" },
  { company: "Compusol", name: "Dulcería Mirabal", kwp: "8.61", sale: "2026-09-09", place: "Bonao", team: "E3", start: "2026-10-05", end: "2026-10-06", status: "Esperando medidor", type: "neta", prep: [true, true, true], actualEnd: "2026-10-06" },
];

export const demoNotices = [
  { text: "Reunión de seguridad el sábado a las 8:00 en la oficina", days: 5 },
  { text: "Usar arnés en todos los techos de más de 2 m", days: 30 },
];
