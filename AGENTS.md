# AGENTS.md — Electsun Planner

Guía para cualquier agente (Claude, Codex, Antigravity/Gemini, etc.) que trabaje en este repo, solo o en equipo. Es la fuente única: `CLAUDE.md` solo la importa.

## Qué es

"El Excel, pero cómodo": mural de TV (solo lectura, sin login), administración web y vista móvil PWA para técnicos. Principio guía: si una función no mejora lo que se ve en la TV o no acelera la actualización, no entra.

Lectura previa obligatoria, en este orden:
1. `docs/REQUISITOS.md` — requisitos con ID estable (`PRY-03`, `HIS-01`…). Cítalos en commits, pruebas e informes.
2. `docs/CONVENCIONES.md` — qué archivos son de quién y reglas de servidor/cliente.
3. `docs/PLAN.md` — estado de las fases.
4. `docs/revisiones/` — auditorías previas. No repitas hallazgos ya corregidos; verifica contra el código actual.

## Stack y comandos

React 19 + Vite + Tailwind 4 (PWA) · Express 5 + PostgreSQL 16 + zod · Docker Compose + Caddy.

```bash
npm install
bash ops/test-db.sh      # Postgres de pruebas en 127.0.0.1:5544 (una vez)
npm run typecheck
npm test                 # unitarias + integración (planner_test)
npm run test:e2e         # Playwright (flujo, axe, PWA, mural)
npx vite build
bash ops/local.sh        # demo completa en Docker, http://localhost:8091
```

Antes de dar algo por terminado: `typecheck`, `npm test` y `vite build` sin errores. Si algo falla, repórtalo con la salida; no lo ocultes.

## Mapa del código

| Ruta | Contenido |
|---|---|
| `shared/` | `domain.ts` (calendario laborable, atraso, validaciones), `contracts/` (zod), `mural-model.ts`, `movil-model.ts` |
| `server/` | API Express, `routes/` por módulo, auth, audit, SSE (`events.ts`) |
| `src/` | `admin/`, `mural/` (TV), `movil/` (PWA), `ui/` (tema, componentes, `api()`) |
| `migrations/` | SQL numerado; una migración nueva por cambio de esquema |
| `design/v4/` | Artboards de referencia. No inventes estilos nuevos |
| `tests/`, `e2e/` | Integración/unitarias y Playwright |

## Reglas que no se negocian

- **Datos ficticios únicamente.** El repo es público. Nunca leas, copies ni subas `.env`, `privado/` ni el Excel real.
- **Servidor:** valida con zod (`shared/contracts`); errores con `httpError`; escrituras en `transaction()` con `audit()` (HIS-01); tras escribir algo visible en mural/móvil llama a `publishChange()` (API-01); "hoy" siempre con `serverToday()`.
- **Cliente:** API solo vía `api()` de `src/ui/api.ts`; tokens de `theme.css`; accesibilidad (nombres, foco, táctil ≥ 44 px).
- **Fechas, atraso y preparación** salen de `shared/domain.ts`; nunca los dupliques.
- **Idioma:** textos de producto en español simple (RD), zona `America/Santo_Domingo`, semana lunes–sábado.
- **Piezas compartidas** (ver tabla en `CONVENCIONES.md`): no se editan fuera de su fase; anota el cambio necesario en tu resumen.
- **Git:** no hagas push, tags, ni despliegues sin que el usuario lo pida. Fase F4 (despliegue) solo con confirmación explícita.

## Trabajo en equipo entre agentes

- **Un dueño por archivo.** Antes de editar, revisa `git status` y la tabla de propiedad de `CONVENCIONES.md`. Si otro agente toca el mismo archivo, para y avisa.
- **Aislamiento:** tareas que escriben código en paralelo van en worktrees separados (`.claude/worktrees/`, ignorado por git), una rama por agente, integradas por el agente coordinador.
- **Roles:** implementación (edita su alcance), revisión/auditoría (solo lectura, escribe un único informe en `docs/revisiones/`), pruebas (solo `tests/` y `e2e/`).
- **Informes de revisión:** `docs/revisiones/<tema>-<versión>.md`, en español, hallazgos por severidad con `archivo:línea`, escenario concreto de fallo y corrección. Solo hallazgos verificados leyendo el código.
- **Entrega de cada agente:** resumen final con (1) archivos cambiados, (2) IDs de requisito cubiertos, (3) comandos ejecutados y su resultado, (4) cambios pedidos a piezas compartidas, (5) lo que no pudo hacer.
- **Commits:** mensajes en español, con IDs de requisito; un commit por cambio lógico. El coordinador firma la integración.
- **Prompts reutilizables** de fases anteriores viven en `.claude/prompts/` (local, no versionado).

## Cuándo preguntar al usuario

Solo ante decisiones que le tocan a él: alcance fuera de `REQUISITOS.md`, cambios de esquema que rompen datos, despliegue, o cualquier acción irreversible. Lo demás se resuelve con los valores por defecto de este documento.
