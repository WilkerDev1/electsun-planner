# Revisión de `feat/v04-rotacion` (mural: rotación de lo que no cabe)

Alcance: `git diff main..feat/v04-rotacion` (6 archivos) frente a `.claude/prompts/v04-rotacion.md`, con la sección "Añadido". Revisión estática y de solo lectura: no ejecuté pruebas, servidor ni navegador. Las alturas y anchos son cuentas a mano sobre el código (fuente 22 px, lienzo 1920×1080). Los números de línea son de la rama `feat/v04-rotacion`, salvo los marcados `main`.

## Hallazgos

### Alta

**A1. Un aviso largo desborda el cuadro de avisos del timeline y no se rota ni se corta.**
- Archivos: `src/mural/Timeline.tsx:105-122` (`packNotices`), `:335-355` (panel), `:376-385` (`NoticeText`).
- Escenario:
  - Las observaciones de proyecto llegan al mural con hasta 500 caracteres (`shared/contracts/projects.ts:57` en main, `notes: max(500)`). Los avisos generales llevan hasta 140 (AVI-02).
  - Un aviso de 300 a 500 caracteres ocupa unas 7 a 12 líneas de 26,4 px, es decir 185 a 320 px. `packNotices` lo pone solo en su página, pero el panel solo ofrece unos 120 px (164 de pie − 20 de relleno − 24 del indicador).
  - Nada recorta ni mide: el texto sale por arriba y por abajo del cuadro blanco, porque el contenedor tiene `justifyContent: center` y no hay `overflow: hidden`. Se pisa con el tablero o cae sobre el fondo gris.
- Estimación frágil:
  - `NOTICE_CHARS = 44` (`:29`) supone unos 13,6 px por carácter y no cuenta los saltos por palabra.
  - Con texto en mayúsculas o palabras largas caben unos 40 caracteres por línea. Una página "de 4 líneas" pasa a 5 o 6 y desborda unos 26 a 52 px.
- Arreglo (el encargo permitía las dos salidas):
  - **Mínimo:** poner `overflow: hidden` al panel y medir la altura real (`scrollHeight` en un `useLayoutEffect`, o un nodo oculto) para repartir en páginas. Así no se usa la estimación por caracteres.
  - **Para los avisos que aun así no caben (más de 4 líneas):** usar `Marquee` en una línea, o `Paged` por trozos de texto cortados en espacios, con "1/2".
  - Añadir una prueba con un aviso de 500 caracteres.

### Media

**M1. Con movimiento reducido, `OneAtATime` corta el texto largo sin elipsis ni aviso.**
- Archivos: `src/mural/Rotate.tsx:144-153` y `:140`.
- Escenario:
  - Con `prefers-reduced-motion`, cada elemento va con `whiteSpace: nowrap` en un contenedor `overflow: hidden`.
  - Un aviso de más de unos 90 caracteres en el pie de Principal (unos 1300 px útiles) queda cortado a mitad de palabra. Es justo el defecto que el encargo quiere evitar, y se queda sin solución para quien pide menos movimiento.
  - Lo mismo pasa con los medidores largos en "Esperando medidor".
- Arreglo:
  - Dejar que el elemento largo ocupe varias páginas, o partirlo en trozos.
  - O ceder el ancho a una segunda línea cuando el pie lo permita.
  - O medir (como hace `ScrollLine`) y, si no cabe, mostrar un desplazamiento muy lento en lugar de cortar.

**M2. Las fichas de "Esperando fecha" y de "Por programar" siguen cortando con elipsis, contra el "Añadido".**
- Timeline, `Timeline.tsx:368` y `:370`:
  - Ancho de la ficha: el pie mide 1824; el cuadro izquierdo, `1804 × 1.6/2.6 ≈ 1110`. Quitando relleno (48), columna de etiquetas (unos 255) y huecos, quedan unos 258 px por ficha y unos 230 para el nombre.
  - `shortName` solo acorta nombres de más de 18 caracteres. Uno de 16 a 18 caracteres en negrita 800, o cualquiera con bandera (−30 px), ya se corta con "…".
  - Arreglo posible: rejilla de 2 columnas × 3 filas, o reducir la columna de etiquetas. Otra opción es permitir dos líneas de nombre y bajar a 4 fichas por página.
- Principal, `Principal.tsx:383` y `:386`:
  - Nombre y motivo siguen con `...ellipsis`. El encargo pide "nunca se corten".
  - El motivo cabe casi siempre (unos 620 px), pero `pause_reason` admite 200 caracteres (`projects.ts:56`) y se cortaría.
  - Arreglo: pasar la línea del motivo a `Marquee`, o partir en dos líneas con menos fichas por página.

**M3. 4 avisos de una línea sobrepasan la altura del panel de avisos del timeline (unos 3,6 px).**
- Archivos: `Timeline.tsx:341-350`, `FOOTER_H` en `:15`.
- Cuenta: 4×26,4 + 3×6 = 123,6 px frente a 120 disponibles (164 − 20 − 24) cuando hay indicador.
- Efecto: rozan la fila del indicador "1/N" o "+N más". No se corta nada, pero `packNotices` promete 4 líneas por página y no caben con huecos. Se resuelve junto con A1 (medir), o con `NOTICE_LINES = 3`, o con `gap: 0` y `lineHeight` mayor.

**M4. Un recorrido completo puede tardar mucho.**
- "Por programar" en Principal: 2 fichas por página con medidor (`Principal.tsx:34`), 8 s por página. Con el tope de 30 son 15 páginas y 2 minutos hasta volver a ver un proyecto.
- Avisos en marquesina: 12 avisos de unos 90 caracteres ≈ 10 000 px a 60 px/s ≈ 3 min. Con movimiento reducido son 12 × 10 s = 2 min.
- Sugerencia:
  - Aumentar fichas por página o acortar el intervalo cuando hay muchas páginas.
  - O repartir el tope (por ejemplo 18 en espera).
  - O avisar al jefe de que el tope largo implica rotaciones largas.
- Es una decisión de producto, no un fallo de código.

**M5. Los requisitos siguen describiendo el comportamiento antiguo.**
- `docs/REQUISITOS.md`:
  - **AVI-03 (`:258`):** "como mucho 3 avisos a la vez … estáticos, sin texto en movimiento". Ahora son hasta 12, en marquesina o por páginas.
  - **MUR-03 (`:272`):** "Como mucho 7 filas y 'y N más'". Ahora son 7 por página y rotan.
  - **MUR-05 (`:276`):** "hasta 6 proyectos". Ahora el tope es 30, por páginas de 3 (2 con medidor).
  - **MUR-06 (`:278`):** la lista pasa a ser una marquesina.
  - **MUR-08 (`:282`):** filas y fichas paginadas.
  - **NF-04 / MUR-01:** falta la regla de `prefers-reduced-motion`, la marquesina a 60 px/s y las páginas de 8 s, con 10 s sin animación.
- Los comentarios del código citan "AVI-03" y "MUR-0x" con el texto nuevo, así que quien lea los requisitos verá lo contrario.
- Arreglo: actualizar esos IDs y añadir uno nuevo, por ejemplo MUR-14 "Rotación". El encargo no incluía `docs/`: hace falta otro commit o encargo.

**M6. "Por programar" mide 2 px menos de lo que ocupa, y el calendario pierde sitio.**
- `Principal.tsx:40`:
  - `waitingHeight` empieza en `h = 28` (solo el relleno). La tarjeta tiene `border: 1px` arriba y abajo (`card`, `:30`) y el contenido real es 2 px más alto.
  - El código de main usaba 30 (`waitingLayout`, main `:37`). Es una regresión pequeña.
  - Efecto: las tarjetas se salen 2 px del `Paged`, que se encoge por `minHeight: 0`. Con medidor, se meten en el hueco de 8 px y no se ven; sin medidor, en el relleno de abajo.
  - Arreglo: `let h = 30;`.
- Espacio del calendario:
  - Las tarjetas de dos líneas (`CHIP_H` pasa de 42 a 56) suben la altura fija de 212 a 238 px con medidor y 2 fichas (+26), y de 210 a unos 250 sin medidor y 3 fichas (+40).
  - Con 3 equipos, `avail = 732 − 238 − 20 − 168 − 39 = 267` px. Más de 8 barras (`CAL_ROW_MIN = 30`) ya no caben y `overflow: hidden` de `:232` las corta en silencio.
  - Antes el límite eran 9 barras. El calendario no rota. Es el mismo "oculto sin avisar" que el encargo quería quitar, ahora un poco peor.
  - Opción: paginar los equipos, o reducir el medidor.

### Baja

- **B1. `usePages` no recupera el índice si los datos crecen de nuevo** (`Rotate.tsx:88-99`).
  - `state` no se corrige cuando `index = clampIndex(state, count)` lo recorta.
  - Escenario: estás en la página 3 de 3 (`state = 2`), llegan datos con 1 página (muestra la 1; `state` sigue en 2) y luego otros datos con 3 páginas. Salta a la 3 y se salta la 1 y la 2.
  - Arreglo: en el efecto, `if (state !== index) setState(index)`, o guardar siempre el índice recortado en el `setState` funcional.
  - Las pruebas solo cubren la función pura `clampIndex`, no el hook. Para cumplir "pruebas del índice que se conserva", falta una prueba con `react-test-renderer` o similar.
- **B2. `planTimeline` no cuenta el `borderTop` de 1 px de cada fila** (`Timeline.tsx:214`, `:66-99`).
  - La fila no lleva `boxSizing: border-box`, así que mide `rowH + 1`. Con unas 8 filas, una página llena se pasa del área por 8 a 9 px y entra en el hueco del indicador de 30 px (rozando la primera pila del "1/N"). Cuando hay una sola página y escala 0,9 queda dentro de los 30 px libres.
  - Arreglo: `boxSizing: "border-box"` en la fila.
  - También puede quedar una última página con una sola fila ("huérfana"). Se podría equilibrar.
- **B3. La marquesina estática deja un separador colgando.**
  - `Rotate.tsx:176-182` pinta el separador también tras el último elemento. Si todo cabe, el pie muestra "… aviso |". Con un solo aviso se ve una barra sin sentido.
  - Arreglo: no pintar el separador del último (la copia ya añade el `gap` del bucle) o ponerlo antes de cada elemento menos el primero. Cuidar que el desplazamiento siga siendo `contenido + gap`.
- **B4. Los keyframes se reescriben si cambia el ancho del contenido** (`Rotate.tsx:186-192`).
  - Con datos nuevos que cambian el ancho (aviso nuevo), cambian `shift` y la duración con el mismo nombre. La animación en curso salta de posición una vez; no se reinicia. Es aceptable. Si molestase, bastaría incluir `shift` en el nombre (`id + shift`) y dejar que reinicie.
  - Con datos iguales no pasa nada: el `<style>` no cambia y el nodo se conserva.
- **B5. `offsetWidth` redondea a entero.**
  - `Rotate.tsx:167`. Con `shift` entero y un ancho real fraccionario, el bucle tiene un salto de menos de 1 px por vuelta. No se nota.
- **B6. `mq.addEventListener` en `MediaQueryList`** (`Rotate.tsx:56`).
  - Los Chromium antiguos de algunas TV y Safari anterior a 14 solo tienen `addListener`. Allí lanzaría una excepción en un efecto y tumbaría el árbol del mural.
  - Arreglo: `mq.addEventListener ? … : mq.addListener(on)`.
- **B7. "Avisos +N" y "+N más"** (`Principal.tsx:398-399`, `Timeline.tsx:351`) se leen como "hay N avisos más aparte", cuando son los que pasan del tope de 12. Mejor "y N más sin mostrar" o `title`/aria. Es un caso raro.
- **B8. Detalles menores:**
  - `<style>` repetido en cada `Paged` (`Rotate.tsx:113`): inofensivo, se podría subir a un solo sitio.
  - `PageNumber` no tiene `aria-label` ("Página 1 de 3").
  - Claves `key={i}` en los avisos (`Principal.tsx:408`, `Timeline.tsx:343`): estables dentro de una página, sin consecuencias.
  - `will-change: transform` sobre un contenedor de unos 20 000 px de ancho (12 avisos × 2 copias): memoria correcta en Chromium, que lo trocea en teselas; en una TV muy modesta conviene probarlo.

## Requisitos pendientes de revisión humana

- Revisar con datos reales los puntos A1, M1, M2 y M6: dependen de anchos tipográficos y no pude verlos en pantalla.
- Pedir la captura de un aviso de 500 caracteres en el timeline.

## 500 en `POST /api/projects` con equipo

**Veredicto: es un bug real del servidor, y existe en `main`.** No lo causan el contrato zod ni el `team_id` con código "E1": ese caso devuelve 422 (zod) y no llega a la base. La causa es otra.

- **Dónde:** `server/routes/projects.ts:139` (main):
  ```ts
  const check = await validateAgainstDb(c, { ...merged, id: "" }, status, today);
  ```
  Al crear, el proyecto aún no existe y se le pone `id: ""`.
- **Cómo explota:** `server/project-store.ts:150-157` (main):
  - Si `p.team_id` es verdadero, ejecuta
    `... WHERE NOT p.archived AND p.team_id=$1 AND p.id<>$2` con `[p.team_id, p.id]`, es decir `$2 = ""`.
  - `projects.id` es `uuid` (`migrations/001_base.sql:93`), así que PostgreSQL falla con `invalid input syntax for type uuid: ""` (código `22P02`).
  - El manejador de errores (`server/index.ts:~115-128`) solo traduce `23505`, `23503`, `23514` y `ZodError`. Todo lo demás cae en `res.status(e.status ?? 500)` con "No se pudo completar la solicitud…".
- **Por qué solo con equipo:** sin `team_id` el `if` no entra y no se ejecuta esa consulta.
- **Alcance:** cualquier `POST /api/projects` con `team_id` no nulo devuelve 500. Los tests no lo detectan porque no crean con equipo. En `tests/` solo hay `team_id` en el PATCH y en pruebas del dominio puro (`domain.test.ts:154` y siguientes). Compruébalo con `grep -n "team_id" tests/*.ts` si quieres.
- **Los demás usos están bien:** `projects.ts:70` y `:167` pasan el id real, y `statuses.ts:117` pasa `p.id`.
- **Arreglo:**
  - **Opción 1 (preferida):** en `validateAgainstDb`, aceptar `id` vacío y no filtrar:
    `AND ($2::uuid IS NULL OR p.id <> $2::uuid)` con `p.id || null`.
  - **Opción 2:** en el POST, generar el id antes (`crypto.randomUUID()`) y pasarlo al validar y al insertar.
  - **Añadir una prueba:** `POST /projects` con un `team_id` válido y fechas, esperando 201.
- **Efecto en la demo del implementador:** el 500 de la demo se veía al crear proyectos con equipo por la API. No es consecuencia de la rama v0.4; solo la sacó a la luz.

## Lo revisado que está bien

- **Cuentas del lienzo, Principal:**
  - `CONTENT_H = 732` cuadra (1080 − 56 − 72 − 88 − 72 − 3×20).
  - La lista de 7 filas × 80 + cabecera 60 + encabezado 40 = 662 cabe en 732.
  - Con 2 fichas más medidor, `waitingHeight` coincide con el contenido salvo los 2 px de M6.
  - El pie de 72 px aloja la marquesina de una línea sin tocar nada.
- **Cuentas del lienzo, Timeline:**
  - Pie de 164: 1080 − 80 de relleno − 88 de cabecera − 40 de huecos − 164 = 708 de tablero; −28 de relleno, −66 de encabezado y −30 de indicador = 584 (`ROWS_AREA`). Cuadra con el comentario.
  - Sin pie se suma `FOOTER_H + GAP`: 768, correcto.
  - Rejilla de 3 × 2 fichas = 2×60 + 8 = 128 en 164. El panel de la izquierda (etiqueta + "1/N" + "+N más") ≈ 112 px. No se pisan.
  - A escala 0,9 las filas de "próximos" (58 px) siguen alojando nombre de 26 px + lugar de 22 px (≈ 55 px).
- **Marquesina (`ScrollLine`):**
  - Mide con `offsetWidth` dentro del lienzo escalado, que no depende del `transform`. `ResizeObserver` observa el contenedor y la copia, así que reacciona a la carga de la tipografía.
  - Medición síncrona en `useLayoutEffect`: no hay un fotograma sin animación.
  - Bucle sin cortes: `shift = contenido + gap`, la copia queda alineada y cubre el ancho visible, porque el contenido ya es mayor que el contenedor.
  - Duración por velocidad (`marqueeTiming`), pausa de 2 s con `holdPct`, copia con `aria-hidden`.
  - `ro.disconnect()` en la limpieza; no hay temporizadores sueltos.
  - Un `@keyframes` por instancia (`useId` limpiado, sin dos puntos) y animación solo con `transform`.
  - Con los mismos datos no se reinicia: el `<style>` no cambia ni el nodo se remonta.
- **`usePages` / `Paged`:**
  - Un `setTimeout` por página, no un intervalo por fotograma.
  - Se limpia en cada cambio de dependencias y se pausa con `document.hidden`; `visibilitychange` bien enganchado y desenganchado.
  - El temporizador solo se reinicia al cambiar `count`, `index`, `ms` o `hidden`, así que los sondeos con datos iguales no lo reinician.
  - La página se identifica por `key={index}`, de modo que cambiar los datos sin cambiar de página no vuelve a animar. Un índice fuera de rango se recorta al llegar menos páginas.
  - Solo se vuelve a dibujar el componente que usa el hook; el reloj ya era independiente.
  - Animación de 400 ms con solo `opacity` y `transform`.
  - Movimiento reducido: escucha cambios (`change`), sin clase de animación, 10 s por página, y cambia de componente `Marquee` → `OneAtATime` con el hook de medios, no solo al cargar.
- **Reglas:** el indicador "1/N" mide 22 px y solo se pinta con más de una página; ningún texto nuevo baja de 22 px; los colores y estilos se mantienen.
- **Orden de hooks:** `usePages` se llama siempre antes de cualquier `return` temprano en `Waiting`, `Footer` (Timeline), `Board` y `ActiveList`.
- **`shared/mural-model.ts`:**
  - `WAITING_MAX = 30` y `NOTICES_MAX = 12`, exportados y fuera de la función.
  - `noticesMore = todos − mostrados` (nunca negativo) y `waiting.more` coherente.
  - Las pruebas nuevas cubren 30/41, 12/18, los 5 avisos de la demo y que los vencidos o futuros no cuentan (`tests/mural.test.ts`, `tests/mural-rotacion.test.ts`).
- **Pruebas de `planTimeline`:** cubren que ninguna fila se pierde ni se repite, que la etiqueta del grupo se repite en la página siguiente y que no queda una etiqueta sola.
- **Vista previa del admin:** reutiliza `ScaledCanvas` y los mismos componentes; la medición con `offsetWidth` no depende de la escala. No se tocó `Preview.tsx` y no encontré nada que se rompa. Con `scale = 0` el lienzo está `visibility: hidden` pero con su tamaño de diseño, así que la primera medición es correcta.
- **Archivos tocados:** solo `src/mural/**`, `shared/mural-model.ts` y `tests/mural*.test.ts`, dentro del permiso del encargo. No hay cambios en `e2e/`.

## Resolución

Correcciones hechas en `feat/v04-rotacion` por la tarea de corrección. Comprobaciones: `npm run typecheck`, `npm test` (206 pruebas), `npx vite build` y `npx playwright test` (17 de 17, en una copia fuera de `.claude`). Revisión visual a 1920×1080 con la demo y datos de estrés (avisos de 500 caracteres, 7 equipos, 10 fichas de "Por programar" con motivos largos y medidor), en dos momentos de cada vista y con movimiento reducido.

| Hallazgo | Estado | Cómo |
|---|---|---|
| A1 Aviso largo desborda el timeline | Resuelto | Los avisos se miden en su ancho real con el mismo estilo que el render (`src/mural/Fit.tsx`) y se reparten por altura medida. Un aviso que no cabe entero se parte por palabras, con el proyecto repetido en cada trozo. Sin estimación por caracteres. Prueba con un texto de 500 caracteres. |
| M1 Movimiento reducido corta texto | Resuelto | Con movimiento reducido, cada elemento se muestra en trozos medidos (uno por página), sin `nowrap`. |
| M2 Fichas con elipsis | Resuelto | "Esperando fecha": 2 × 2 fichas por página, nombre en hasta dos líneas y días completos. "Por programar": nombre arriba y motivo completo debajo; un motivo que no cabe se reparte y pasa entero a la página siguiente si cabe en una nueva. |
| M3 Cuatro avisos de una línea desbordan | Resuelto | El reparto medido deja tres avisos de una línea por página en 120 px, con separación de 8. |
| M4 Recorridos largos | Decisión | Marquesina a 60 px/s; si una vuelta tardaría más de 60 s, sube hasta 90 px/s (tope de legibilidad). Las páginas siguen en 8 s. Con avisos de 500 caracteres en la marquesina del pie, una vuelta puede superar los 60 s; es el coste de no cortar el texto. Con movimiento reducido el tiempo es 10 s por trozo. |
| M5 Requisitos desactualizados | Resuelto | `docs/REQUISITOS.md`: AVI-03, MUR-03, MUR-04, MUR-05, MUR-06 y MUR-08 actualizados; nuevo MUR-14 (rotación y movimiento reducido). |
| M6 Alto de "Por programar" y calendario | Resuelto | `waitingHeight` parte de 30 px (borde incluido). El calendario mide su hueco y pasa de página por equipos (un equipo con muchas barras se parte y repite su nombre), con filas de al menos 30 px. Ninguna barra se corta. |
| B1 Índice que no se recupera | Resuelto en el código | El efecto guarda el índice válido (`usePages`). No se añadió prueba del hook: no hay renderizador de pruebas en el proyecto y añadir una dependencia excede la tarea. La función pura `clampIndex` sí tiene pruebas. |
| B2 Borde de 1 px en las filas | Resuelto | `boxSizing: border-box` en las filas del timeline. |
| B3 Separador colgando | Resuelto | El último separador se oculta con `visibility` (conserva su ancho, que la marquesina usa para la vuelta). |
| B4 Keyframes que cambian con el contenido | Sin cambios | Aceptable según el informe. |
| B5 `offsetWidth` redondeado | Sin cambios | Efecto de menos de 1 px, no visible. |
| B6 `addEventListener` antiguo | Resuelto | `useMedia` usa `addListener` si no existe `addEventListener`, en ambos sentidos. |
| B7 Texto "+N más" | Sin cambios | Se mantiene el texto actual. |
| B8 Detalles menores | Parcial | El indicador de página tiene `aria-label` ("Página 1 de 3"). El resto (estilo repetido, claves por índice) queda igual. |
| Bug `POST /api/projects` con equipo | Resuelto | `server/routes/projects.ts`: el id se genera antes de validar y se pasa también a `insertProject`. Prueba `tests/projects.test.ts` ("crear un proyecto con equipo devuelve 201"): falla con el código de `main` y pasa con la corrección. |

Cambios de prueba fuera de lo previsto:
- `e2e/requisitos.spec.ts` (MUR-11): la comprobación de «Sr. Herrera» ya no la encuentra al primer intento, porque el rotador puede tenerla en otra página. Ahora espera hasta 30 s a que aparezca en el ciclo, sin congelar el reloj ni quitar ninguna comprobación.

Pendiente, fuera de los hallazgos del informe:
- "Instalaciones activas" (principal): los nombres y los lugares de las filas siguen con elipsis, p. ej. "Lucía Esther Gómez…". El encargo pedía no cortar con puntos suspensivos lo que no cabe. Solucionarlo exige rediseñar la fila (altura fija de 80 px), así que queda como tarea aparte.
- La vista previa del administrador (`src/admin/mural/Preview.tsx`) usa los mismos componentes; no se revisó en pantalla.
- Revisión visual con un solo navegador (Chromium) y datos de demostración; no se probó en una TV real.
