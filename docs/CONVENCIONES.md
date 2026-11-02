# Convenciones para las fases en paralelo

Lee primero `docs/REQUISITOS.md`. Cita los IDs de requisito en commits y pruebas.

## Qué es de quién

Las piezas compartidas se cerraron en la F0. **No las edites** salvo que tu fase lo diga; si necesitas un cambio, anótalo en el resumen final.

| Compartido (F0, no tocar) | |
|---|---|
| `migrations/001_base.sql` | Si necesitas columnas nuevas, crea `migrations/00N_<fase>.sql` (numera: A=002, B=003, C=004, D=005, E=006) |
| `shared/domain.ts` | Reglas comunes. Puedes añadir funciones nuevas al final con sus pruebas en `tests/domain.test.ts`, sin cambiar las existentes |
| `shared/contracts/{common,auth,access,statuses,projects,equipo}.ts` | Contratos. Solo se amplían con campos opcionales |
| `server/{index,db,auth,audit,events,queries,seed,today}.ts`, `server/routes/{auth,catalogs}.ts` | Infraestructura |
| `src/main.tsx`, `src/ui/*` | Rutas, tema, dock, cliente de API, `useLive` |

| Fase | Puede crear y editar |
|---|---|
| F1·A Cuentas y acceso | `server/routes/{accounts,access-links,access}.ts`, `src/admin/cuentas/**`, `src/auth/**`, `tests/accounts.test.ts` |
| F1·B Proyectos | `server/routes/{projects,statuses}.ts`, `server/xlsx.ts`, `src/admin/proyectos/**`, `tests/projects.test.ts` |
| F1·C Equipo | `server/routes/{employees,teams,companies}.ts`, `src/admin/equipo/**`, `tests/equipo.test.ts` |
| F2·D Mural TV | `server/routes/{mural,notices,view-mural}.ts`, `shared/mural-model.ts`, `shared/contracts/mural.ts`, `src/mural/**`, `src/admin/mural/**`, `tests/mural.test.ts` |
| F2·E Móvil | `server/routes/view-movil.ts`, `shared/movil-model.ts`, `shared/contracts/movil.ts`, `src/movil/**`, el bloque `VitePWA` de `vite.config.ts`, `public/icons/**`, `tests/movil.test.ts` |

## Reglas del servidor

- Valida cada cuerpo con zod (`shared/contracts`). Errores con `httpError(status, mensaje)` de `server/db.ts`.
- Escrituras en `transaction()`, con `audit()` de `server/audit.ts` (HIS-01) en la misma transacción.
- Tras confirmar una escritura que cambia lo que ven el mural o el móvil, llama a `publishChange()` de `server/events.ts` (API-01).
- Permisos: `authenticated` y `admin` de `server/auth.ts` (ROL-02). Dispositivos: `device("tv" | "mobile")`.
- "Hoy" siempre con `serverToday()` (respeta `PLANNER_TODAY`).
- Lecturas comunes en `server/queries.ts` (`listProjects`, `listStatuses`…).
- Mensajes para personas, en español y en tono simple.

## Reglas del cliente

- Llama a la API con `api()` de `src/ui/api.ts`. Tipos desde `shared/contracts`.
- Usa los tokens de `src/ui/theme.css` (clases `bg-canvas`, `text-ink`, `border-line`, `text-subtle`…) y las piezas de `src/ui/components.tsx`.
- Reproduce los artboards de `design/v4/` (el bloque `<script>` tiene los datos y la lógica de demo; `<x-dc>` el layout). No inventes estilos nuevos.
- Accesibilidad: controles con nombre, `aria-pressed` en botones de alternar, foco visible, áreas táctiles ≥ 44 px en móvil.
- Los cálculos de fechas, atraso y preparación salen de `shared/domain.ts`, nunca duplicados.

## Pruebas

- `bash ops/test-db.sh` una vez; luego `npm test`. Cada archivo de integración usa `setup()` de `tests/helpers.ts` (demo ficticia con hoy = 2026-10-27, cuentas admin y oficina).
- Antes de terminar: `npm run typecheck`, `npm test` y `npx vite build` sin errores.
