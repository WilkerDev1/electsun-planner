# Confirmación de hallazgos (subagentes Claude Sonnet 5.5, esfuerzo medio)

## Confirmación de `integ/hallazgos` frente a `main`

`tsc --noEmit` pasa sin errores. No ejecuté tests, Caddy ni Docker. El Caddyfile lo revisé solo leyéndolo, y no pude comprobar que los SHA de las acciones y los digests de las imágenes sean los de la versión que dicen.

### Hallazgos originales

| Hallazgo | Estado | Nota |
|---|---|---|
| Calidad: mural a 22 px | RESUELTO | Constantes en `Principal.tsx:11-24`. Lo comprueba `tests/mural-legibilidad.test.ts`. El reparto vertical suma 732 px (`:7`). |
| `useLive` descarta avisos | PARCIAL | Corrige con `dirty` y debounce (`useLive.ts:30-36,70-75`), pero falla al cambiar `path` (ver Regresiones). |
| `loadProjects` fuera de orden | RESUELTO | `loadSeq` y la guarda de `inflight` en `store.ts:39-47`. |
| Sesión caducada | RESUELTO | `api.ts:25` y `auth.tsx:26-28`. |
| Contraste AA | RESUELTO | `theme.css:13`; hoy en `#C2410C` en `Calendario.tsx:40-45` y `shared.tsx:8`. |
| Barras móviles de 44 px | RESUELTO | `Calendario.tsx:94-101`. |
| Obras que desaparecen | PARCIAL | Barra de solo atraso en `movil-model.ts:335-345`; equipo inactivo rechazado en `project-store.ts:109-115`. Las obras ya asignadas a un equipo inactivo siguen sin verse. |
| En obra sin fin | RESUELTO | `effectiveEnd` (`domain.ts:178`), `endOf` en el mural y VAL-01 (`domain.ts:357`). |
| `startsIn` negativo | RESUELTO | `domain.ts:166-176`. El KPI Próximos exige días ≥ 0 (`mural-model.ts:270`). |
| "Hoy" congelado | RESUELTO | Temporizador en `auth.tsx:30-34`. |
| Teclado y ARIA | RESUELTO | Menú de cuenta en `Dock.tsx:27-60`; `aria-selected` quitado y etiqueta con el nombre real en `Table.tsx`. |
| Rendimiento | RESUELTO | `navigateRef` (`index.tsx:21-23`), debounce y reloj aislado. |
| Avisos recortados (AVI-03) | RESUELTO | `Principal.tsx:364-366` (2 líneas, mínimo 120 px). |
| Pruebas y E2E | PARCIAL | Hay `e2e/requisitos.spec.ts` y pruebas nuevas. Sigue sin haber pruebas de cliente. |
| Duplicación | PARCIAL | `monogramColors`, `initials` y `Modal` unificados. `warningCodeOf` sigue leyendo el texto del aviso. |
| Seguridad: Excel (DoS) | RESUELTO | `xlsx.ts` y `mem_limit` en `compose.yaml` (`12a28e2`). |
| Login por cuenta y `/accept` | RESUELTO | `auth.ts` (`12a28e2`). |
| SSE por credencial | RESUELTO | `events.ts` (`12a28e2`). |
| `Cf-Connecting-Ip` | PARCIAL | Lógica correcta en `Caddyfile:19-33`, pero con un posible fallo de orden (ver Regresiones). |
| `.env` en el backup | RESUELTO | `backup.sh`; `BOOTSTRAP_PASSWORD` opcional en `compose.yaml:39`. |
| Dependencias | RESUELTO | multer y zod subidos, `npm audit` en `ci.yml`, Dependabot. |
| Caché con teléfonos | RESUELTO | `CACHE_TTL` en `useLive.ts:11`; se borra con 401 o 403. |
| Purga de sesiones | RESUELTO | `index.ts` (`12a28e2`). |
| `/healthz` y `/readyz` | PARCIAL | Mismo problema de orden en Caddy. |
| Cadena de suministro | RESUELTO | SHA y digests en `ci.yml`, `Dockerfile` y `compose.yaml`. |

### Regresiones

1. **`Caddyfile:9-10`, `Caddyfile:19-33`.** `respond /healthz 404` y `respond /readyz 404` quedan fuera de los `handle`. En Caddy, `handle` se evalúa antes que `respond`, y el `handle {}` sin matcher atrapa todo. Esos 404 probablemente ya no se ejecutan y las sondas vuelven a llegar a la API. Compruébalo con `caddy adapt` o con `curl` a `/readyz`. Corrección: poner las sondas dentro de un `handle /healthz /readyz`, antes de los otros.
2. **`useLive.ts:60`.** El `finally` llama a `load()` con la ruta de la petición que acaba de terminar. Si `path` cambia mientras hay una petición en curso (la vista previa de Configuración), el reintento pide la ruta vieja y la vista previa queda desactualizada hasta el sondeo de 60 s. Corrección: guardar `load` en un ref.
3. **`src/admin/proyectos/index.tsx:80-82`.** `pickStatus` no comprueba fin o días. Pasar una obra a En obra con inicio y equipo, pero sin fin ni días, se aplica y luego el servidor responde 422 y se revierte. Corrección: añadir `s.requires_schedule && !p.end_date && !p.estimated_days && "el fin o los días"`.
4. **`Caddyfile:18`.** Un valor mal escrito en `BEHIND_CLOUDFLARE` (por ejemplo `yes`) hace que Caddy ignore `Cf-Connecting-Ip`, sin ningún aviso. Local sí funciona con `false`. Mejor invertir la condición: solo `false` desactiva la comprobación.
5. **Menor, `mural-model.ts:189`.** `endOf` duplica `effectiveEnd` de `domain.ts`.
6. **Menor, `Principal.tsx` (`CAL_ROW_MIN`).** Con muchos equipos y barras, el calendario recorta filas sin mostrar "y N más". Nada sale del lienzo de 1920×1080.

### Requisitos a actualizar (`docs/REQUISITOS.md`)

- **VAL-01 (l.184):** añadir "y fecha de fin o días estimados".
- **MUR-02 (l.242):** Próximos = programados con inicio entre hoy y 14 días; los de inicio pasado no cuentan.
- **MUR-03 (l.246):** programado con inicio pasado muestra "Debía iniciar el …"; en obra sin fin se trata como fin = inicio.
- **CAL-02 (l.308):** `startsIn` con días negativos devuelve "Debía iniciar el …".
- **MOV-04 y MOV-06 (l.280-284):** barras del calendario de ≥ 44 px, y obras atrasadas fuera de la ventana mostradas solo con su tramo de atraso.
- **EQP-06 (equipos):** un equipo inactivo no admite obras nuevas, ni en la tabla ni en la importación.

### Veredicto

**CAMBIOS.** Corrige las regresiones 1 y 2, y de paso la 3. Con eso apruebo.

---

## Revisión del commit 77d5460

**1. Caddyfile: sin problemas bloqueantes.**
- `route` mantiene el orden escrito: sondas con 404, filtro de Cloudflare y después el proxy.
- `{$VAR:default}` se sustituye como texto al leer el Caddyfile, también dentro de los backticks.
- Si la variable viene vacía o con un valor distinto de `false` (`False`, `0`, un espacio), la expresión `!= 'false'` deja el filtro activo. Falla cerrado, que es lo correcto.
- `@cf` y `@local` son exclusivos y exhaustivos, así que siempre responde un solo proxy.
- `flush_interval -1` sigue en ambos proxies, de modo que SSE no se rompe. `header_up` pisa el X-Forwarded-For.
- `Caddyfile:25-26` (baja): `respond /healthz` es una coincidencia exacta. `/healthz/` llega al upstream, que probablemente no lo sirve. Se podría usar `/healthz*`.
- `Caddyfile:15-16` (informativa): `@cf` y `@local` se declaran fuera de `route`, lo cual es válido. Solo `@sin_ip_cf` repite la expresión, que se podría reutilizar.

**2. `useLive.ts`: correcto.**
- El cambio de `path`, el reintento tras `dirty`, el desmontaje y el debounce se comportan bien. `dirty` se reinicia al empezar cada petición, así que no hay bucle infinito.
- Tras desmontar puede salir una petición extra, y con StrictMode no cambia nada.
- `useLive.ts:65` (baja): `latest.current = load` se asigna durante el render. La regla `react-hooks/refs` de React 19 podría quejarse. Lo más limpio es hacerlo en un `useEffect` o `useLayoutEffect`.
- Ya existía antes: una respuesta de la ruta anterior puede mostrarse un instante tras cambiar de `path`.

**3. `pickStatus`: coherente con `validateProject` (VAL-01).**
- `!p.end_date && !p.estimated_days` coincide con `domain.ts:357`. `tsc --noEmit` pasa sin errores.
- Con el panel abierto no hay discrepancia de mensajes relevante: la UI junta los tres requisitos y el servidor los reporta uno a uno.

**4. `REQUISITOS.md`: coincide con el código.**
- `Debía iniciar el` (`domain.ts:170`), `effectiveEnd` (`domain.ts:183`), 7 filas (`ACTIVE_ROWS`), `assertTeamAssignable` y el área táctil `h-11` (44 px) están en el código.
- No verifiqué el filtro de MUR-02 "hoy..+14 días", ni la regla de la barra solo con atraso de MOV-04. Hay que mirarlos a mano.

**Veredicto: APROBAR** (solo observaciones menores).
