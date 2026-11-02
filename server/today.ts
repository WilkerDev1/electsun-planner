import { TZ, todayIn } from "../shared/domain.js";

/** "Hoy" del servidor. PLANNER_TODAY fija el día en demos y pruebas (p. ej. 2026-10-27). */
export const serverToday = () => todayIn(TZ, new Date(), process.env.PLANNER_TODAY);
