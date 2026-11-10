import { defineConfig, devices } from "@playwright/test";

// E2E de la F3 contra una API real con la demo ficticia y hoy = 2026-10-27.
// Requiere `bash ops/test-db.sh` y la base planner_e2e_test (se crea en global-setup).
const PORT = 8098;
export const BASE = `http://127.0.0.1:${PORT}`;
export const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgres://planner:local-test-only@127.0.0.1:5544/planner_e2e_test";

export default defineConfig({
  testDir: "e2e",
  workers: 1,
  timeout: 45000,
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: BASE, locale: "es-DO", timezoneId: "America/Santo_Domingo", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "NODE_ENV=production npx vite build && npx tsx server/index.ts",
    url: `${BASE}/readyz`,
    timeout: 120000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: E2E_DB,
      PORT: String(PORT),
      APP_ORIGIN: BASE,
      PLANNER_TODAY: "2026-10-27",
      E2E_RELAX_LOGIN_LIMIT: "1",
    },
  },
});
