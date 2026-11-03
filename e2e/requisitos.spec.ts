import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ADMIN } from "./global-setup";
import { BASE } from "../playwright.config";
import { adminApi, createLink, login, mobileLinkPath, openPhone } from "./helpers";

// Requisitos [M] sin prueba de navegador hasta ahora: NF accesibilidad (WCAG 2.1 AA), PWA (MOV-09),
// mural sin conexión (MUR-11), panel de edición (PRY-06) y cuentas por invitación (AUT-03).

/**
 * Reglas de axe desactivadas por ruta porque la causa está en archivos de otro encargo (src/**),
 * que este encargo no puede tocar. Cada una queda anotada para arreglarla en su archivo.
 */
const KNOWN: Record<string, string[]> = {};

async function serious(page: Page, disabled: string[] = []) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .disableRules(disabled)
    .analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join(" | ")}`);
}

test.describe("accesibilidad (axe, sin violaciones serias ni críticas)", () => {
  test("/login", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
    expect(await serious(page)).toEqual([]);
  });

  for (const ruta of ["/proyectos", "/equipo", "/mural"]) {
    test(ruta, async ({ page }) => {
      await login(page, ADMIN);
      await page.goto(ruta);
      await expect(page.getByRole("main").or(page.locator("main")).first()).toBeVisible();
      await expect(page.getByText("Cargando")).toHaveCount(0);
      expect(await serious(page, KNOWN[ruta])).toEqual([]);
    });
  }

  test("PWA /m a 390×844", async ({ browser, request }) => {
    await adminApi(request);
    const { context, page } = await openPhone(browser, await mobileLinkPath(request));
    await expect(page.getByText("Sr. Herrera").first()).toBeVisible();
    expect(await serious(page)).toEqual([]);
    await context.close();
  });
});

test("PWA: el manifiesto es válido y el service worker se registra en /m (MOV-09)", async ({ browser, request }) => {
  await adminApi(request);
  const { context, page } = await openPhone(browser, await mobileLinkPath(request));
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBeTruthy();
  const manifest = await (await page.request.get(href!)).json();
  expect(manifest.name).toBeTruthy();
  expect(manifest.display).toMatch(/standalone|fullscreen|minimal-ui/);
  expect(manifest.icons.length).toBeGreaterThan(0);
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope.startsWith(BASE)).toBeTruthy();
  const state = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return (reg.active ?? reg.waiting ?? reg.installing)?.state ?? null;
  });
  expect(state).toBeTruthy();
  await context.close();
});

test("el mural de TV sigue mostrando datos y avisa «Sin conexión» al perder la red (MUR-11)", async ({ browser, request }) => {
  await adminApi(request);
  const tv = await createLink(request, { kind: "tv", name: "TV sin red" });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  await page.goto(tv.path);
  // El mural rota: «Sr. Herrera» puede estar en otra página. Se espera a que aparezca en el ciclo (MUR-14), sin rebajar la comprobación.
  await expect(page.getByText("Sr. Herrera").first()).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/Actualizado/)).toBeVisible();

  await context.setOffline(true);
  // Sin red, la pantalla lo detecta en su siguiente lectura; se adelanta con el evento del navegador.
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByText(/Sin conexión/)).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Sr. Herrera").first()).toBeVisible({ timeout: 30000 });

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByText(/Actualizado/)).toBeVisible({ timeout: 15000 });
  await context.close();
});

test("el panel de edición recalcula el fin previsto al cambiar los días estimados (PRY-06)", async ({ page }) => {
  await login(page, ADMIN);
  // Un proyecto con inicio, sea cual sea (otros casos de este archivo comparten la base).
  const lista = (await (await page.request.get("/api/projects")).json()) as { name: string; start_date: string | null }[];
  const nombre = lista.find((p) => p.start_date)!.name;
  await page.getByRole("button", { name: `Editar ${nombre}`, exact: true }).click();
  const panel = page.getByRole("complementary", { name: "Editar proyecto" });
  await expect(panel).toBeVisible();
  const fin = panel.getByText(/^Fin previsto ·/);
  const days = panel.getByLabel("Días estimados");

  await days.fill("2");
  await days.press("Enter");
  await expect(fin).not.toContainText("pon inicio y días");
  const corto = await fin.innerText();
  await days.fill("20");
  await days.press("Enter");
  await expect(fin).not.toHaveText(corto);
  const largo = await fin.innerText();
  expect(largo).not.toBe(corto);

  // El cambio quedó guardado en el servidor.
  await expect.poll(async () => (await (await page.request.get("/api/projects")).json()).find((p: { name: string }) => p.name === nombre)?.estimated_days).toBe(20);
});

test("un administrador invita, la persona activa su cuenta en otro contexto y entra (AUT-03)", async ({ page, browser }) => {
  const correo = "nuevo.oficina@example.test";
  const clave = "una-clave-larga-segura-1";
  await login(page, ADMIN);
  await page.goto("/cuentas");
  await page.getByRole("button", { name: "Invitar" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nombre").fill("Persona Nueva");
  await dialog.getByLabel("Correo").fill(correo);
  await dialog.getByRole("button", { name: "Crear invitación" }).click();
  const enlace = await page.getByLabel("Enlace", { exact: true }).inputValue();
  expect(enlace).toContain("/activar#");

  const otro = await browser.newContext();
  const nueva = await otro.newPage();
  await nueva.goto(enlace);
  await expect(nueva.getByRole("heading", { name: "Activa tu cuenta" })).toBeVisible();
  await nueva.getByLabel("Nombre").fill("Persona Nueva");
  await nueva.getByLabel("Contraseña", { exact: true }).fill(clave);
  await nueva.getByLabel("Repite la contraseña").fill(clave);
  await nueva.getByRole("button", { name: /Activar/ }).click();
  await expect(nueva).toHaveURL(/\/proyectos/);
  // El enlace es de un solo uso y ya no deja el secreto en la barra de direcciones.
  expect(nueva.url()).not.toContain("#");

  // Puede volver a entrar con su correo y contraseña desde cero.
  const tercero = await browser.newContext();
  const pagina = await tercero.newPage();
  await login(pagina, { email: correo, password: clave });
  await otro.close();
  await tercero.close();
});
