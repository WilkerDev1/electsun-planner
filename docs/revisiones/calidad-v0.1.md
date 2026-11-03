# Revisión de calidad: electsun-planner (main, v0.1-demo)

## Resumen

Revisé en solo lectura el dominio compartido, los modelos de mural y móvil, las rutas del servidor y el cliente. Comprobé varios casos límite ejecutando `shared/` con `tsx` desde fuera del repo. También calculé contrastes y generé un build de producción en el scratchpad. `tsc --noEmit` no da errores y no hay `any` en `src`, `server` ni `shared`.

La lógica de fechas es sólida. Domingos, fin de mes y año, proyectos sin equipo, listas vacías y estados renombrados dan resultados correctos. Los problemas reales están en tres sitios:
- **Mural principal:** casi todo el texto del diseño por defecto está por debajo de 22 px.
- **Refresco en vivo:** el cliente puede dejar datos viejos en la TV, el móvil y la vista previa.
- **Incoherencias entre mural y móvil:** hay casos de fechas incompletas que cada vista resuelve a su manera.

Dos advertencias sobre lo que medí:
- `dist/` es un build de desarrollo, porque el E2E compila con `NODE_ENV=e2e`. Mi build de producción da 262 kB en el chunk principal (84 kB gzip). Los bundles no son un problema.
- `server/xlsx.ts` cambió en disco mientras revisaba. No lo cito en ningún hallazgo.

## Hallazgos

**[Alta] El mural principal incumple el mínimo de 22 px (NF-04, MUR-01)** — `src/mural/Principal.tsx` (líneas indicadas abajo) — `design` vale `principal` por defecto, así que la TV muestra por defecto un diseño casi todo por debajo del mínimo. A 3–4 m, nombres, fechas, estados y avisos quedan ilegibles. El diseño `Timeline.tsx` sí cumple, con un mínimo de 22 px.

| Tamaño | Textos (líneas) |
|---|---|
| 12 px | días de la semana del calendario (192) |
| 13 px | `progress.endText` (156), nota "Ver aviso" (129), código de equipo (144, 235), subtítulo de Por programar (329) |
| 14 px | cabecera de columnas (97), rango de fechas (182), leyenda (222) |
| 15 px | subtítulo de KPI (69), píldoras de resumen (93–94), lugar (132), estado (136), progreso (155), etiquetas de barra (254, 260), píldora de Por programar (292), "Esperando medidor" (314–315), "Actualizado" (348) |
| 16 px | fechas (151), equipo (145, 148), cuenta atrás (163), nombre en WaitingChip (327), "y N más" (111), número del día en el calendario (193), "Avisos" (338) |
| 17–18 px | etiqueta de KPI (68), subtítulo y fecha de cabecera (60, 77), sin datos (304, 340) |
| 20 px | nombre del proyecto (126), avisos (342), texto vacío (108) |

Arreglo:
- Definir una constante `MIN_PX = 22` y llevar todo ese texto a 22 px o más. Propongo 26–28 px para el nombre del proyecto y 22 px para todo lo secundario.
- Recortar columnas y filas para que quepa. Ya existe el "y N más".
- Retocar `LABEL_PX_PER_CHAR = 8.6` y `CAL_GRID_PX = 612` en `shared/mural-model.ts:212,215`, que suponen letra de 15 px.
- Añadir una prueba que falle si algún `fontSize` de `src/mural` baja de 22.

**[Media] `useLive` descarta los avisos de cambio mientras hay una petición en curso** — `src/ui/useLive.ts:53-56` — si llega `change` (o cambia `path`) mientras `inflight.current` es true, `load()` retorna sin hacer nada y la respuesta en curso puede ser anterior al cambio. Consecuencias:
- La TV o el móvil quedan con datos viejos hasta 60 s (MUR-10, MOV-09).
- En Configuración, `Preview` cambia de `path` con cada interruptor. Si hay una petición en vuelo, la vista previa no refleja el último ajuste.

Arreglo: guardar un flag `dirty` y repetir `load()` al terminar si se activó. Alternativa: abortar la petición anterior con `AbortController` y lanzar la nueva.

**[Media] `loadProjects` puede pisar ediciones optimistas y llegar fuera de orden** — `src/admin/proyectos/store.ts:329-334, 358-373, 375-379` — `loadProjects` no tiene secuencia ni cancelación.
- Un refresco lanzado por SSE o por el sondeo antes de editar y que responde después sobrescribe `rows` y `confirmed` con una versión vieja. La fila vuelve atrás y el siguiente PATCH de la cola da un 409 falso.
- Al activar "Mostrar archivados", dos cargas con distinto `archivedRef` pueden terminar en orden inverso. La lista queda con la lista contraria a la casilla.

Arreglo: contador `loadSeq` que ignore respuestas obsoletas, y no aplicar la lista si `inflight > 0` al resolver.

**[Media] Sin tratamiento global de sesión caducada** — `src/ui/api.ts:22-26` y `src/ui/auth.tsx` — la sesión dura 12 h y `RequireAuth` solo lee `/auth/me` al montar. Con la sesión vencida, cada edición devuelve 401 ("Inicia sesión para continuar."), se revierte la fila y sale un toast. Las ediciones se pierden sin redirigir al login. Arreglo: en `api()`, ante 401 fuera de `/auth/*`, llamar a `refresh()` (que deja `user=null`) o navegar a `/login`.

**[Media] Contraste AA incumplido en texto con significado (NF-03)** — calculado con la fórmula WCAG:

| Texto | Ratio | Dónde |
|---|---|---|
| `text-faint` `#98A2B3` sobre blanco | 2,58:1 | `Table.tsx:183,186` (fechas vacías), `Table.tsx:208` ("—"), `Table.tsx:269` (`waitReason`, que sí informa), `TextField.tsx:28` (placeholder) |
| Blanco sobre `#EA6A1F`, 16 px/800 | 3,19:1 | "Avisos" (`Principal.tsx:338`), día de hoy (193) |
| Blanco sobre `#EA6A1F`, 18 px/800 | 3,19:1 | círculo de hoy (`Calendario.tsx:42`); 18 px no es "texto grande" (el umbral es 18,66 px en negrita) |

Los demás pares revisados pasan (≥ 4,5): `subtle`, `muted`, `warn/warn-soft`, `danger`, `ok/ok-soft` (4,58), `brand-ink` y los seis estados por defecto. El switch apagado (`#D0D5DD` sobre blanco, 1,47:1) y el icono de prioridad (`#98A2B3`, 2,58:1) fallan 3:1 como controles no textuales.

Arreglo:
- Subir `--color-faint` a `#667085` (4,97) para texto.
- Poner texto `#1B1F27` sobre el naranja, o usar `#C2410C` (5,18) como fondo con texto blanco.

**[Media] Las barras de la línea de tiempo móvil miden 30 px (MOV-06)** — `src/movil/Calendario.tsx:93-96` (`h-[30px]` dentro de una fila `h-10`) — son enlaces a la obra y quedan por debajo de 44 px en el único elemento táctil denso de `src/movil`. Arreglo: hacer la fila de 44 px y que el `Link` ocupe toda la altura, con la barra dibujada dentro. Alternativa: añadir un padding transparente de 7 px arriba y abajo.

**[Media] Obras que desaparecen de los calendarios** — verificado con `tsx`:
- `shared/movil-model.ts:342-344`: una obra en curso con atraso cuya barra planificada quedó fuera de la ventana de 3 semanas se salta en el timeline (`if (!bar.visible) continue`) antes de calcular el tramo de atraso. El agenda sí la lista: 0 barras frente a 1 ítem. El mural lo resuelve bien en `barOf` (`mural-model.ts:350`).
- `shared/mural-model.ts:373-374` y `shared/movil-model.ts:337-339` solo dibujan filas de equipos con `active`. `PATCH /api/projects` (`server/routes/projects.ts:300-325`) acepta `team_id` de un equipo inactivo. EQP-06 solo impide desactivar un equipo con obras ya asignadas. La obra sigue contando en los KPI y desaparece del calendario.

Arreglo: en el móvil, calcular `over` antes del `continue` y mostrar la barra si hay tramo de atraso. En el PATCH, rechazar `team_id` inactivo, salvo el que ya tenía el proyecto.

**[Media] Obra "en obra" sin fecha de fin: tres vistas distintas** — `shared/movil-model.ts:179-181`, `shared/mural-model.ts:288-292`, `shared/domain.ts:146-150` — con `start_date=2026-10-20`, `end_date=null` y hoy 27 oct:
- el móvil muestra "Atrasada · +6 días", porque toma `end=start`;
- el mural muestra "Día 1 de 1" con `late: 0`;
- el calendario del mural no dibuja barra, porque `barOf` no genera el tramo de atraso.

Una importación de Excel con Inicio sin Fin ni Días deja ese estado (`reconcileSchedule` no calcula el fin). Arreglo: elegir una regla y ponerla en `shared/domain.ts`, por ejemplo `effectiveEnd(p)`. Mejor aún: exigir fin o días para pasar a `en_obra` (VAL-01).

**[Baja] "Inicia hoy" en proyectos con inicio ya pasado y "Día 0 de N"** — `shared/domain.ts:153-158` (`startsIn`), usado en `shared/mural-model.ts:322`; `shared/domain.ts:146-150` (`dayOf`) en `shared/mural-model.ts:290-292` — `startsIn` devuelve "Inicia hoy" para `days <= 0`. Un "programado" con inicio hace 7 días (nadie lo pasó a "En obra") se ve en la TV como "Inicia hoy" y cuenta en el KPI "Próximos". Un "en obra" con inicio futuro muestra "Día 0 de 5". El móvil lo hace bien ("Debía iniciar el lun 26"). Arreglo: devolver una etiqueta distinta con `days < 0` ("Debía iniciar el lun 20") y excluirlos del KPI, o avisarlo con VAL.

**[Baja] "Hoy" del cliente queda congelado** — `src/ui/auth.tsx:116-132` y `src/admin/proyectos/index.tsx:18` — `today` viene de `/auth/me` una sola vez. Con la pestaña abierta pasada la medianoche, "Atrasada · +N", los avisos y los valores optimistas (`actual_end`, `mural_until`) usan el día anterior hasta recargar. El servidor y el mural usan el día correcto. Arreglo: recalcular `today` con `todayIn()` en un timer a medianoche (como `msToMidnight` en `src/mural/index.tsx:156`).

**[Baja] Accesibilidad de teclado y ARIA** —
- `src/ui/Dock.tsx:55-70`: el menú de cuenta usa `role="menu"` sin flechas, sin Escape, sin foco al abrir y sin cierre al hacer clic fuera. Arreglo: usar botones normales con `aria-expanded` y cerrar con Escape y `blur`, o implementar el patrón de menú completo.
- `src/admin/proyectos/Table.tsx:316`: `aria-selected` en un `role="row"` dentro de `role="table"` no es válido. Arreglo: quitarlo o usar `role="grid"`.
- `src/admin/proyectos/Table.tsx:339`: el campo de nombre se etiqueta "Proyecto N" por posición, que cambia al filtrar. Arreglo: etiquetar con el nombre real.
- Los diálogos nativos `<dialog>` sí atrapan el foco y cierran con Esc: bien.

**[Baja] Rendimiento (NF-05)** — no hay N+1; el mural se mide en el test de 500 proyectos. Lo que sobra:
- `src/mural/index.tsx:66,197`: `useNow(1000)` vuelve a renderizar todo `MuralScreen` cada segundo. Arreglo: aislar el reloj y la línea de hoy en un componente propio, o memoizar `ActiveList`, `Calendar` y `Waiting`.
- `src/admin/proyectos/index.tsx:68-87`: `open`, `close` y `pickStatus` dependen de `navigate`, que en `BrowserRouter` cambia con cada ruta (`useNavigateUnstable`, dependencia `locationPathname`). Así se invalida el `memo` de las 500 filas al abrir o cerrar el panel. Arreglo: llamar a `navigate` desde un ref.
- Cada `publishChange` hace que todas las TV y teléfonos pidan el modelo completo. No hay coalescencia ni caché por `currentVersion()`. Arreglo: debounce de 1–2 s en el cliente.
- `server/xlsx.ts`: al aplicar, `insertProject` y `saveProject` hacen 3 consultas por fila. Es aceptable, pero medible con importaciones grandes.

**[Baja] El pie del mural recorta avisos largos (AVI-03)** — `src/mural/Principal.tsx:342` — los avisos van en `nowrap` con `flexShrink: 0`, salvo el último, dentro de un contenedor con `overflow: hidden`. Con textos largos (hasta 140 caracteres), el segundo se recorta y el tercero queda con ancho cero, sin indicación. Arreglo: dos líneas, o recorte con elipsis en todos y un "+N".

**[Baja] Pruebas y E2E no cubren varios requisitos [M]**
- Requisitos [M] sin ID citado en `tests/` ni `e2e/` (algunos pueden estar probados sin citarse): ACC-07, AUT-01/02/05/08/09, AVI-03, CAL-01/04, EST-03, MOV-01/06/07, MUR-07/11/12/13, NF-02/03/04/06/07/08, PRY-02/06/07/08/09, VAL-02/03/04/07/08.
- No existe ninguna prueba de cliente. Hay 2 flujos E2E y ninguno de accesibilidad, legibilidad del mural, modo sin conexión ni PWA.
- `playwright.config.ts` compila con `NODE_ENV=e2e`. Eso genera React en modo desarrollo y el chunk `jsx-dev-runtime` (confirmado en `dist/`: 457 kB frente a 262 kB en producción). El E2E no ejercita el bundle que se despliega. Arreglo: `NODE_ENV=production` en el `build` del `webServer`.
- Pruebas que añadiría:
  - una prueba estática de `fontSize >= 22` en `src/mural`;
  - `axe` en Playwright;
  - casos de dominio para `end_date=null`, `programado` con inicio pasado y `team_id` inactivo.

**[Baja] Duplicación entre cliente y servidor, y código muerto**
- Cuatro cálculos del color del monograma con coeficientes distintos: `shared/mural-model.ts:171-176` (0,35/0,85), `src/movil/ui.tsx:18-23` (0,5/0,86), `src/admin/proyectos/model.ts:575-584` (0,42/0,88) y `src/admin/equipo/model.ts:61-65` (0,4/0,86). La misma empresa se ve distinta en TV, móvil y tabla. Arreglo: una función en `shared/domain.ts`.
- `initials` está duplicado en `src/ui/components.tsx:289-290` y `shared/movil-model.ts:98-106`.
- Hay tres implementaciones de modal: `src/admin/cuentas/Modal.tsx`, `src/admin/equipo/ui.tsx:82` e `ImportDialog.tsx`.
- `isClashWarning` (`src/admin/proyectos/model.ts:606`) depende del texto del aviso. Arreglo: que `validateProject` devuelva códigos.
- Exportaciones sin uso: `TODAY_COLOR`, `ApiErrorBody`, `WithWarnings` y `EmployeePatch`. Este último está sin usar porque `server/routes/employees.ts:147` redefine su propio `Patch`.
- Hay 4 `eslint-disable` en `src/admin/proyectos`, pero el repo no tiene ESLint.

## Veredicto

**APROBAR CON CAMBIOS.** La base de dominio y servidor es buena, pero no cierres la demo sin tres cosas:
1. Corregir las fuentes del mural principal, que incumple un requisito [M] que se ve a simple vista.
2. Arreglar el guard `inflight` de `useLive` y la carga sin secuencia de `useProjects`, que causan datos viejos en pantalla.
3. Unificar el tratamiento de fechas incompletas entre mural y móvil: obra en curso sin fin, barras de atraso fuera de ventana y equipo inactivo.

El resto (contraste, objetivos táctiles, sesión caducada, pruebas) puede ir en la fase siguiente, salvo `faint` y los textos blancos sobre naranja, que son un cambio de tokens de una línea.

Archivos citados, bajo `/home/ishiro/Proyectos/1_Principales/electsun-planner/`:
- `src/mural/Principal.tsx`
- `src/ui/useLive.ts`
- `src/admin/proyectos/store.ts`
- `src/ui/api.ts`
- `shared/movil-model.ts`
- `shared/mural-model.ts`
- `shared/domain.ts`
- `playwright.config.ts`

_Revisor: subagente Claude Sonnet 5.5, esfuerzo medio, solo lectura._
