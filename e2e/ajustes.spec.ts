import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ADMIN, OFFICE } from "./global-setup";
import { login } from "./helpers";

// v0.3 · Ajustes: estados que se crean y se borran (EST-05), catálogo de preparación (PRY-12), logotipo y patrón (EQP-07, EQP-08).

// PNG de 1×1 con transparencia; el navegador lo amplía a un lienzo de prueba.
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const serious = async (page: import("@playwright/test").Page) =>
  (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join(" | ")}`);

test("Ajustes: estados, preparación, niveles, roles múltiples y axe (EST-05, PRY-12, NIV-01, EQP-01b, EQP-03b)", async ({ page }) => {
  await login(page, ADMIN);
  await page.getByRole("link", { name: "Ajustes" }).click();
  await expect(page).toHaveURL(/\/ajustes/);
  await expect(page.getByRole("heading", { name: "Estados" })).toBeVisible();
  expect(await serious(page)).toEqual([]);

  // Estado sin proyectos: se crea y se borra sin pedir reemplazo.
  await page.getByRole("button", { name: "Agregar estado" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Nombre", { exact: true }).fill("Revisión técnica");
  await page.getByRole("radio", { name: /En pausa/ }).check();
  expect(await serious(page)).toEqual([]);
  await dlg.getByRole("button", { name: "Agregar estado", exact: true }).click();
  await expect(page.getByText("Estado agregado")).toBeVisible();
  await page.getByRole("button", { name: "Borrar el estado Revisión técnica" }).click();
  await expect(page.getByText("Ningún proyecto usa este estado")).toBeVisible();
  await page.getByRole("button", { name: "Borrar estado", exact: true }).click();
  await expect(page.getByText("Estado borrado")).toBeVisible();

  // Un estado con proyectos obliga a elegir reemplazo.
  await page.getByRole("button", { name: /Borrar el estado Programado/ }).click();
  await expect(page.getByRole("button", { name: "Borrar estado", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");

  // Preparación: agregar y borrar un parámetro.
  await page.getByRole("button", { name: "Agregar parámetro" }).click();
  const dlg2 = page.getByRole("dialog");
  await dlg2.getByLabel(/^Código/).fill("ZZ");
  await dlg2.getByLabel("Nombre", { exact: true }).fill("Prueba de acceso");
  await dlg2.getByLabel(/^Motivo de espera/).fill("espera acceso");
  await dlg2.getByRole("button", { name: "Agregar parámetro", exact: true }).click();
  await expect(page.getByText("Parámetro agregado")).toBeVisible();
  expect(await serious(page)).toEqual([]);
  await page.getByRole("button", { name: "Borrar el parámetro Prueba de acceso" }).click();
  await page.getByRole("button", { name: "Borrar parámetro", exact: true }).click();
  await expect(page.getByText("Parámetro borrado")).toBeVisible();

  // Niveles: el nivel Oficina viene bloqueado en edición de nombre y permisos.
  await expect(page.getByRole("heading", { name: "Niveles" })).toBeVisible();
  await expect(page.getByLabel("Nombre del nivel Oficina")).toBeDisabled();
  await expect(page.getByRole("switch", { name: "Oficina: Lidera equipo" })).toBeDisabled();

  // Crear un nivel nuevo, renombrarlo y alternar un permiso.
  await page.getByRole("button", { name: "Agregar nivel" }).click();
  const dlg3 = page.getByRole("dialog");
  await dlg3.getByLabel("Nombre", { exact: true }).fill("Inspector");
  await dlg3.getByLabel(/^Título de grupo/).fill("Inspectores de calidad");
  expect(await serious(page)).toEqual([]);
  await dlg3.getByRole("button", { name: "Agregar nivel", exact: true }).click();
  await expect(page.getByText("Nivel agregado")).toBeVisible();

  const nameInput = page.getByLabel("Nombre del nivel Inspector");
  await nameInput.fill("Inspector solar");
  await nameInput.press("Enter");
  await expect(page.getByText("Nivel guardado")).toBeVisible();

  const leadToggle = page.getByRole("switch", { name: "Inspector solar: Lidera equipo" });
  await expect(leadToggle).toHaveAttribute("aria-checked", "false");
  await leadToggle.click();
  await expect(leadToggle).toHaveAttribute("aria-checked", "true");
  expect(await serious(page)).toEqual([]);

  // Equipo > Empleados: dos roles vigentes con fecha límite e insignia +1.
  await page.goto("/equipo/empleados");
  await page.getByRole("button", { name: "Editar a Luis Peña" }).click();

  const empDlg = page.getByRole("dialog");
  await empDlg.getByRole("button", { name: "+ Agregar otro rol" }).click();
  await empDlg.getByLabel("Nivel del rol 2").selectOption({ label: "Encargado" });
  await expect(empDlg.getByLabel("Equipo que lidera en el rol 2")).toBeVisible();
  await empDlg.getByLabel("Hasta del rol 2").fill("2099-12-31");
  expect(await serious(page)).toEqual([]);
  await empDlg.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Empleado guardado")).toBeVisible();

  const roleBtn = page.getByRole("button", { name: /Encargado \+1 · Roles de Luis Peña/ });
  await expect(roleBtn).toBeVisible();
  await expect(page.getByRole("button", { name: "hasta 31 dic", exact: true })).toBeVisible();
  await page.getByRole("group", { name: "Filtrar por nivel" }).getByRole("button", { name: "Técnico", exact: true }).click();
  await expect(roleBtn).toBeVisible();
  expect(await serious(page)).toEqual([]);
});

test("Ajustes: la oficina los ve en solo lectura", async ({ page }) => {
  await login(page, OFFICE);
  await page.goto("/ajustes");
  await expect(page.getByText("Solo la administración puede cambiar los ajustes")).toBeVisible();
  await expect(page.getByRole("button", { name: "Agregar estado" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Agregar parámetro" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Agregar nivel" })).toHaveCount(0);
});

test("Empresas: patrón y logotipo (EQP-07, EQP-08)", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/equipo/empresas");
  await page.getByRole("button", { name: /^Editar / }).first().click();
  const rayas = page.getByRole("button", { name: "Rayas finas" });
  await rayas.click();
  await expect(rayas).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Archivo del logotipo").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: Buffer.from(PNG, "base64") });
  await expect(page.getByRole("img", { name: /^Logotipo de / })).toBeVisible();
  expect(await serious(page)).toEqual([]);
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Empresa guardada")).toBeVisible();

  await page.getByRole("button", { name: /^Editar / }).first().click();
  await page.getByRole("button", { name: "Quitar logotipo" }).click();
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Empresa guardada")).toBeVisible();
});
