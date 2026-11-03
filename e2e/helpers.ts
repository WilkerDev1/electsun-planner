import { expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { ADMIN } from "./global-setup";
import { BASE } from "../playwright.config";

export async function login(page: Page, who: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(who.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(who.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/proyectos/);
}

export async function adminApi(request: APIRequestContext) {
  const r = await request.post("/api/auth/login", { data: ADMIN, headers: { Origin: BASE } });
  expect(r.ok()).toBeTruthy();
}

export async function createLink(request: APIRequestContext, body: object) {
  const r = await request.post("/api/access-links", { data: body, headers: { Origin: BASE } });
  expect(r.ok(), await r.text()).toBeTruthy();
  return (await r.json()) as { link: { id: string }; path: string };
}

/** Enlace móvil del técnico Starlin Reyes (equipo E3 de la demo). */
export async function mobileLinkPath(request: APIRequestContext) {
  const employees = await (await request.get("/api/employees")).json();
  const starlin = employees.find((e: { name: string }) => e.name === "Starlin Reyes");
  return (await createLink(request, { kind: "mobile", employee_id: starlin.id })).path;
}

/** Abre un teléfono (390×844) ya activado con el enlace personal. */
export async function openPhone(browser: Browser, path: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto(path);
  await expect(page).toHaveURL(/\/m$/);
  return { context, page };
}
