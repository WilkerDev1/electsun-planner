import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ADMIN } from "./global-setup";
import { login } from "./helpers";

// v0.5 · Enlaces de TV con modo, título, ajustes propios y pausa reversible (ACC-07, ACC-08, MUR-09).

// Revisa solo la tarjeta (o el diálogo) bajo prueba: la vista previa escalada de la misma página es otra pantalla, con su propia revisión.
const serious = async (page: import("@playwright/test").Page, scope: string) =>
  (await new AxeBuilder({ page }).include(scope).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join(" | ")}`);

test("crear una TV Timeline con título, abrirla sin sesión, pausarla y reanudarla (ACC-08)", async ({ page, browser }) => {
  await login(page, ADMIN);
  await page.goto("/mural");
  const card = page.locator("#tv-links");
  await expect(card).toBeVisible();

  await card.getByLabel("Nombre de la nueva pantalla").fill("TV taller");
  await card.getByLabel("Título en la pantalla (opcional)").fill("Taller norte");
  const timeline = card.getByRole("button", { name: /Timeline/ });
  await timeline.click();
  await expect(timeline).toHaveAttribute("aria-pressed", "true");
  expect(await serious(page, "#tv-links")).toEqual([]);
  await card.getByRole("button", { name: "Crear enlace" }).click();

  const url = await page.getByRole("dialog").getByLabel("Enlace").inputValue();
  expect(url).toMatch(/\/tv\/[0-9a-f-]{36}#/);
  await page.getByRole("button", { name: "Listo" }).click();

  const row = card.locator("li", { hasText: "TV taller" });
  await expect(row.getByText("Timeline", { exact: true })).toBeVisible();
  await expect(row.getByText("Activa", { exact: true })).toBeVisible();
  await expect(row.getByText("Título: Taller norte")).toBeVisible();
  expect(await serious(page, "#tv-links")).toEqual([]);

  // La TV, en otro contexto y sin sesión.
  const tvContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv = await tvContext.newPage();
  await tv.goto(url);
  await expect(tv.getByText("Taller norte", { exact: true })).toBeVisible();
  await expect(tv.getByText(/\d+ en obra/)).toBeVisible(); // la cabecera del modo Timeline
  await expect(tv.getByText("Proyectos", { exact: true })).toHaveCount(0);

  // Pausar: la TV avisa sin perder la sesión.
  await row.getByRole("button", { name: "Pausar TV taller" }).click();
  await expect(row.getByText("En pausa", { exact: true })).toBeVisible();
  await expect(tv.getByText("Pantalla en pausa")).toBeVisible({ timeout: 15000 });

  // Reanudar: vuelve sola, sin tocar la TV.
  await row.getByRole("button", { name: "Reanudar TV taller" }).click();
  await expect(row.getByText("Activa", { exact: true })).toBeVisible();
  await expect(tv.getByText("Taller norte", { exact: true })).toBeVisible({ timeout: 15000 });

  // Configurar: el título nuevo y el otro modo llegan en vivo.
  await row.getByRole("button", { name: "Configurar TV taller" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Título en la pantalla").fill("Taller sur");
  await dlg.getByRole("group", { name: "Modo" }).getByRole("button", { name: "Principal", exact: true }).click();
  expect(await serious(page, "dialog")).toEqual([]);
  await dlg.getByRole("button", { name: "Guardar" }).click();
  await expect(row.getByText("Título: Taller sur")).toBeVisible();
  await expect(tv.getByText("Taller sur", { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(tv.getByText(/\d+ en obra/)).toHaveCount(0); // ya es Principal

  await tvContext.close();
});
