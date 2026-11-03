import { test, expect } from "@playwright/test";
import ExcelJS from "exceljs";
import { OFFICE } from "./global-setup";
import { BASE } from "../playwright.config";
import { adminApi, createLink, login } from "./helpers";

// Flujo completo de la demo (REQUISITOS F3): oficina → TV por SSE → móvil; revocación; importación.

test("la oficina renombra un proyecto y la TV y el móvil lo muestran sin recargar", async ({ page, browser, request }) => {
  await adminApi(request);
  const tv = await createLink(request, { kind: "tv", name: "TV E2E" });
  const employees = await (await request.get("/api/employees")).json();
  const starlin = employees.find((e: { name: string }) => e.name === "Starlin Reyes"); // técnico de E3
  const mobile = await createLink(request, { kind: "mobile", employee_id: starlin.id });

  const tvPage = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tvPage.goto(tv.path);
  await expect(tvPage).toHaveURL(new RegExp(`/tv/${tv.link.id}(#.*)?$`));
  await expect(tvPage.getByText("Sr. Herrera").first()).toBeVisible();

  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await phone.goto(mobile.path);
  await expect(phone).toHaveURL(/\/m$/);
  await phone.goto("/m/obras");
  await expect(phone.getByText("Sr. Herrera").first()).toBeVisible();

  await login(page, OFFICE);
  // La celda del nombre se localiza por su valor y se conserva el elemento: su etiqueta accesible
  // ("Proyecto N" o con el nombre real) y su valor cambian al escribir.
  const cell = (await page.locator('input[value="Sr. Herrera"]').first().elementHandle())!;
  await cell.fill("Sr. Herrera (techo norte)");
  await cell.press("Enter");

  await expect(tvPage.getByText("Sr. Herrera (techo norte)").first()).toBeVisible({ timeout: 15000 });
  await expect(phone.getByText("Sr. Herrera (techo norte)").first()).toBeVisible({ timeout: 15000 });

  // Revocar el enlace de la TV: la pantalla lo explica en su siguiente lectura (ACC-03).
  const revoke = await request.post(`/api/access-links/${tv.link.id}/revoke`, { headers: { Origin: BASE } });
  expect(revoke.ok()).toBeTruthy();
  await expect(tvPage.getByText(/enlace fue desactivado/i)).toBeVisible({ timeout: 15000 });
});

test("importar Excel con vista previa y aplicar (XLS)", async ({ page }) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Hoja1");
  ws.addRow(["Contratista", "Proyecto", "kWp", "Fecha de venta", "Lugar", "Encargado", "Cuadrilla/Equipo", "Inicio", "Fin", "Estado", "Observación"]);
  ws.addRow(["EcoSur", "Hotel Brisa E2E", "24,5", "20/10/2026", "Bávaro", "", "N/A", "N/A", "N/A", "Por programar", ""]);
  ws.addRow(["Solaris", "Fantasma", 5, null, "Haina", null, null, null, null, "Por programar", null]);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());

  await login(page, OFFICE);
  await page.getByRole("button", { name: "Importar Excel" }).first().click();
  await page.getByLabel("Archivo de Excel").setInputFiles({ name: "proyectos.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });
  await page.getByRole("button", { name: "Revisar archivo" }).click();
  const summary = page.getByRole("list", { name: "Resumen de la vista previa" });
  await expect(summary).toContainText("1");
  await expect(page.getByText(/Empresa desconocida/)).toBeVisible();
  await page.getByRole("button", { name: /Importar|Aplicar/ }).last().click();
  await page.getByRole("button", { name: "Cerrar" }).last().click();
  await expect(page.locator('input[value="Hotel Brisa E2E"]')).toBeVisible();
});
