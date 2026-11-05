import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ADMIN } from "./global-setup";
import { login } from "./helpers";

// Pantalla Proyectos de la v0.3: avisos plegables (VAL-10), preparación opcional (PRY-12) y archivar (PRY-10).

async function violations(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
}

test("un aviso cuelga de su proyecto y se abre y se cierra (VAL-10)", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/proyectos");
  // aria-controls solo existe con el panel abierto: el disparador se fija por su aria-label (title "Ver/Ocultar los avisos").
  const label = await page.locator('button[aria-expanded][title$="los avisos"]').first().getAttribute("aria-label");
  expect(label).toBeTruthy();
  const trigger = page.getByRole("button", { name: label!, exact: true });
  await expect(trigger).toBeVisible();
  const abierto = (await trigger.getAttribute("aria-expanded")) === "true";
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", abierto ? "false" : "true");
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", abierto ? "true" : "false");
  // La preferencia se recuerda al recargar.
  await trigger.click();
  const after = await trigger.getAttribute("aria-expanded");
  await page.reload();
  await expect(page.getByRole("button", { name: label!, exact: true })).toHaveAttribute("aria-expanded", after!);
  expect(await violations(page)).toEqual([]);
});

test("la preparación se agrega, se marca y se quita por proyecto (PRY-12)", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/proyectos");
  const fila = page.getByRole("row").filter({ has: page.getByLabel("Seleccionar Villa Serena") }).first();
  await fila.getByRole("button", { name: /Elegir parámetros de preparación/ }).click();
  const dialogo = page.getByRole("dialog", { name: /Parámetros de preparación/ });
  await dialogo.getByLabel(/^PL · /).check();
  await expect(fila.getByRole("button", { name: /falta · Villa Serena/ })).toHaveCount(1);
  await fila.getByRole("button", { name: /falta · Villa Serena/ }).click();
  await expect(fila.getByRole("button", { name: /listo · Villa Serena/ })).toHaveCount(1);
  // Tocar la ficha cierra el selector; se vuelve a abrir para quitar el parámetro.
  await fila.getByRole("button", { name: /Elegir parámetros de preparación/ }).click();
  await dialogo.getByLabel(/^PL · /).uncheck();
  await expect(fila.getByRole("button", { name: /(listo|falta) · Villa Serena/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialogo).toHaveCount(0);
});

test("archivar con deshacer, ver archivados y restaurar en bloque (PRY-10, PRY-10b)", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/proyectos");
  await page.getByRole("button", { name: /^Más acciones de Villa Serena/ }).click();
  await page.getByRole("menuitem", { name: "Archivar" }).click();
  await expect(page.getByText("Proyecto archivado")).toBeVisible();
  await page.getByRole("button", { name: "Deshacer" }).click();
  await expect(page.getByLabel("Seleccionar Villa Serena")).toBeVisible();

  await page.getByRole("button", { name: /^Más acciones de Villa Serena/ }).click();
  await page.getByRole("menuitem", { name: "Archivar" }).click();
  await expect(page.getByLabel("Seleccionar Villa Serena")).toHaveCount(0);
  await page.getByRole("button", { name: /^Archivados/ }).click();
  await expect(page.getByLabel("Seleccionar Villa Serena")).toBeVisible();
  expect(await violations(page)).toEqual([]);
  await page.getByLabel("Seleccionar Villa Serena").check();
  await page.getByRole("button", { name: /^Restaurar seleccionados \(1\)/ }).click();
  await page.getByRole("button", { name: /^Todos/ }).click();
  await expect(page.getByLabel("Seleccionar Villa Serena")).toBeVisible();
});

test("pasar a Programado sin fin previsto ni días estimados muestra el aviso en el panel (VAL-01)", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/proyectos");
  await page.getByRole("button", { name: "Editar Paola Núñez", exact: true }).click();
  const panel = page.getByRole("complementary", { name: "Editar proyecto" });
  await expect(panel).toBeVisible();

  await panel.getByLabel("Equipo").selectOption({ label: "E1" });
  const startInput = panel.getByLabel("Inicio");
  await startInput.fill("2026-11-02");
  await startInput.press("Enter");

  await panel.getByRole("button", { name: "Programado", exact: true }).click();
  await expect(panel.getByText(/completa primero el fin previsto o los días estimados/i)).toBeVisible();
});
