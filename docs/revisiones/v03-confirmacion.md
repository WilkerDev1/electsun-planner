# Confirmación de las correcciones de las revisiones v0.3

Revisión de solo lectura de `git diff b0a7db6..0c9ba1a`, que contiene las correcciones 94f0922 (base) y 0c9ba1a (interfaz). Se leyó el código resultante en la rama `integ/v03` y se contrastó con los requisitos de `docs/REQUISITOS.md` (en 0c9ba1a). Los números de línea son de 0c9ba1a.

No se ejecutaron tests, ni la base de datos, ni la aplicación. Las pruebas nuevas (`tests/v03.test.ts:672-785`, `tests/v03-proyectos-ui.test.ts`) se leyeron pero no se han ejecutado; el «172 de 172» que indica el informe de resolución no se ha comprobado aquí.

## Resumen

- **Revisión base (v03-base.md):** 9 de 11 puntos corregidos o descartados con razón válida. Hay **1 regresión** (B5) y **1 corrección incompleta** (M2).
- **Revisión de interfaz (v03-ui.md):** M1 a M4, B0, B1, B3, B6 y B7 quedan resueltos. **B5 no está resuelto**: el descarte no tiene base técnica. M5, M6, B2, B4 y B8 se descartan con razón aceptable (B4 y B8 con matiz).
- Ninguna corrección de la interfaz introduce regresiones de runtime que se vean en la lectura. Los bloqueos del borrado de estados no introducen ciclos.

---

## Revisión base (v03-base.md)

### M1. Dos borrados simultáneos del mismo tipo: RESUELTO
- `server/routes/statuses.ts:88-92`: bloqueo asesor por tipo (`status-kind:<kind>`) y después bloqueo de las filas del estado y su reemplazo en orden de id.
- `server/routes/statuses.ts:97-99`: el conteo `sameKind` se hace después del bloqueo, así que ve el borrado ya confirmado de la otra transacción (READ COMMITTED toma una instantánea nueva por sentencia).
- Deadlocks: el orden de bloqueo es consistente. Los proyectos se bloquean en `statuses.ts:101` con `ORDER BY id FOR UPDATE`, igual que en `archive-bulk` (`projects.ts:193`). `PATCH /statuses/:id` (`statuses.ts:61`) solo bloquea su fila y no toma proyectos, así que no cierra ningún ciclo. No se introduce ningún interbloqueo nuevo.
- Prueba: `tests/v03.test.ts:672-685` (espera `[200, 409]`). La respuesta 409 sale de `statuses.ts:98-99`.

### M2. Parámetros con nombre de columna del Excel: RESUELTO PARCIALMENTE (no resuelto en un caso)
- Cubierto: `server/routes/prep-items.ts:55` y `:76-86` rechazan nombres y códigos que coinciden con columnas fijas, con alias o con cabeceras antiguas (`reservedHeader`, `server/xlsx.ts:89-94`). La exportación usa el código cuando el nombre choca (`prepExportHeader`, `xlsx.ts:96-100`).
- **No cubierto:** `assertUnique` (`prep-items.ts:32-41`) compara nombres solo con nombres y códigos solo con códigos. Nada impide que el **nombre** de un parámetro coincida con el **código** de otro. Ejemplo: existe «PM» (código PM, nombre «Permiso municipal») y se crea un parámetro nombre «PM» con código «XX». `reservedHeader` no lo marca (solo cubre PL, MA y EDE en `LEGACY_PREP_HEADERS`). La exportación genera dos columnas «PM», y en `prepHeaderIndex` (`xlsx.ts:103-111`) gana el primero del catálogo. Al reimportar, los datos pueden asignarse al parámetro equivocado.
- **Arreglo sugerido:** en `assertNotReserved` (o en `assertUnique`), rechazar un nombre que coincida con el código de otro parámetro, y viceversa.
- Prueba: `tests/v03.test.ts:731-751` y `:753-774`. No cubren este caso.

### B1. `immutable` con cualquier `?v=`: RESUELTO
- `server/routes/companies.ts:185`: `immutable` solo si `req.query.v` es igual a `sha256.slice(0,12)`. Coincide con `left(l.sha256,12)` de `server/queries.ts:54`, así que la URL que se sirve sí lleva el valor correcto.
- Prueba: `tests/v03.test.ts:707-717`.

### B2. 401 frente a 404 sin sesión: DESCARTADO, JUSTIFICADO
- `docs/REQUISITOS.md:243` dice «401 sin credencial, 404 si no hay logotipo». El código y la prueba coinciden con el requisito. El encargo que citaba el informe base era el que decía 404. No hace falta cambiar nada.

### B3. Tope de 12 cookies de dispositivo: RESUELTO (con un fallo de estilo)
- `server/auth.ts:130`: el tope sube a 50. Pero el `;` del final de la línea quedó **dentro del comentario** (`.slice(0, 50) // tope ... por petición;`). El código sigue siendo válido porque el ASI inserta el punto y coma, pero un linter o Prettier lo marcará. Corregir: mover el `;` antes del comentario.

### B4. `prepCatalog = []` por defecto: RESUELTO
- `shared/domain.ts:388-392`: el parámetro es obligatorio. Todos los llamadores lo pasan: `server/project-store.ts:161`, `server/xlsx.ts:402`, `src/admin/proyectos/model.ts:65` y las pruebas de `tests/domain.test.ts`.

### B5. Archivados validados al borrar un estado: REGRESIÓN
- `server/routes/statuses.ts:115-116`: los archivados pasan sin validar (`&& !p.archived`).
- **No es conforme con el requisito.** `docs/REQUISITOS.md:186-190` (EST-05) dice que los proyectos que usan el estado, **archivados incluidos**, pasan al reemplazo, y que «la regla de fechas sigue a EST-02 y VAL-01». Si a algún proyecto le faltan datos, hay que responder 422 y no cambiar nada. El descarte se hizo en el código y en la prueba (`tests/v03.test.ts:687-705`), pero **no se actualizó REQUISITOS.md**, que sigue diciendo lo contrario. El propio comentario de `statuses.ts:79` también habla de archivados incluidos.
- **Efecto secundario:** `unarchive` (`server/routes/projects.ts:170-183`) llama a `saveProject` sin validar. Un proyecto archivado que quede en un estado incoherente (por ejemplo «Programado» sin fechas) puede volver a activarse sin ningún aviso del servidor. Antes de este cambio, el borrado no podía producir ese estado.
- **Arreglo:** decidir con quien define el producto. O bien quitar `&& !p.archived` y mantener la validación de EST-05, o bien cambiar EST-05 y validar también al desarchivar. En cualquier caso, dejar el requisito y el código de acuerdo.

### B6. Límite y orden del catálogo: RESUELTO (descarte parcial justificado)
- `server/routes/prep-items.ts:30` (`lockCatalog`), `:56` (alta) y `:76` (cambio): bloqueo asesor antes de contar y de validar la unicidad. Las únicas escrituras son las de esta API, así que el bloqueo basta sin índice único.
- Se descarta el índice `lower(name)` y el `Math.min(next, 99)`. Con `MAX_PREP_ITEMS = 30` (`shared/contracts/prep.ts:23`) el `sort` nunca llega a 99, así que el descarte es razonable.
- Nota de estilo: las líneas 42-43 de `prep-items.ts` tienen dos comentarios JSDoc seguidos. El de `assertUnique` queda encima de `lockCatalog`. Cosmético.

### B7. `archive-bulk` sin `version`: RESUELTO (solo en la API)
- `shared/contracts/projects.ts:96-103`: `versions` opcional, con `z.number().int().min(1)`. `server/routes/projects.ts:193-202`: se comprueba dentro de la transacción, así que un 409 deshace todo (`server/db.ts:43-55`).
- Prueba: `tests/v03.test.ts:719-729`.
- La interfaz no envía `versions` (`src/admin/proyectos/store.ts:225`). La protección existe, pero solo para clientes que la usen. No es un fallo, pero conviene saberlo.

### B8. Estado de reemplazo sin bloquear: RESUELTO
- `statuses.ts:90-92` incluye el reemplazo en el bloqueo. `statuses.ts:106` da el mensaje específico «El estado de reemplazo ya no existe. Elige otro y vuelve a intentarlo.».

### B9. Logotipos en el Service Worker tras cerrar sesión: RESUELTO
- `src/ui/auth.tsx:21-27` borra `company-logos` al cerrar sesión. El nombre coincide exactamente con `vite.config.ts:46` (`cacheName: "company-logos"`).
- Limitación: solo cubre el cierre de sesión explícito. Si la sesión caduca (evento `planner:unauthorized`, `src/ui/api.ts:26`), la caché no se borra. Es aceptable, porque los logotipos no son datos sensibles, como indicaba el informe.

### Timeline (EQP-08, mapa de patrones por color): RESUELTO
- `shared/mural-model.ts:496-497` pone el patrón de la empresa en cada fila; `src/mural/Timeline.tsx:169` lo usa directamente. Ya no hay mapa por color.
- Observación: `tests/v03.test.ts:776-785` puede pasar en falso si Compusol no tiene proyectos activos en la vista (el bucle `for (const r of hit)` quedaría vacío). No se ha comprobado con datos.

---

## Revisión de interfaz (v03-ui.md)

### M1. Seleccionar todos supera 200: RESUELTO
- `src/admin/proyectos/store.ts:217-242`: `archiveMany` trocea en lotes (`chunk`, `src/admin/proyectos/model.ts:228-236`) y avisa si un lote falla, con cuántos se completaron.
- Todas las vías de archivado pasan por `archiveMany`: selección (`index.tsx:273`), banner de terminados (`index.tsx:319`), menú de fila y panel.
- Prueba: `tests/v03-proyectos-ui.test.ts` («PRY-10b»).
- Matiz: ante un fallo parcial, `archiveIds` (`index.tsx:96-103`) muestra «Deshacer» sobre **todos** los ids, incluidos los que no se archivaron. Deshacer solo cambia los que estén archivados, así que el daño es mínimo, pero el mensaje de Deshacer no es exacto.

### M2. Campo que muestra un valor rechazado: RESUELTO
- `src/admin/ajustes/Prep.tsx:20, 39-44, 85` y `src/admin/mural/Statuses.tsx:35, 55-59, 98`: el contador `resets` entra en la clave de las filas y las remonta solo cuando un guardado falla. Los campos recuperan el valor guardado. Las filas inicializan su estado local desde `item` (`Prep.tsx` `PrepRow`, `useState(item.code)`), así que el remontaje sí lo restablece.

### M3. Archivar desde el panel: RESUELTO
- `src/admin/proyectos/index.tsx:117-119`: `archivePanel` pasa por `archiveIds`, así que aparece «Deshacer».
- Versión: `store.ts:195` (`setArchived`) y `store.ts:218` (`archiveMany`) esperan al guardado en vuelo con `waitIdle` (`store.ts:148-153`) antes de usar la versión confirmada.
- Matiz: `waitIdle` tiene un tope de 10 s (`store.ts:149`). Si el guardado tarda más, la acción continúa con la versión vieja y el servidor responde 409. Es un caso raro y el mensaje es claro.

### M4. Respuesta antigua que pisa un archivado: RESUELTO
- `src/admin/proyectos/store.ts:114`: `isStaleResponse` (`model.ts:238-240`) descarta la respuesta si la versión confirmada es mayor. El `continue` vuelve a la condición del `while` (`store.ts:103`), así que no se salta el `finally` ni la liberación de la cola. Correcto.
- Prueba: `tests/v03-proyectos-ui.test.ts` («PRY-11»).

### M5. Barras del calendario sin patrón de empresa: DESCARTADO, JUSTIFICADO
- `docs/REQUISITOS.md:291` (MUR-13): «colores de empresa solo en el punto y el monograma». Las barras usan el color del estado, así que el descarte es correcto. EQP-08 no exige el patrón en las barras.

### M6. Empresas editables por la oficina: DESCARTADO, JUSTIFICADO
- `docs/REQUISITOS.md:46` (ROL-02): la oficina puede escribir empresas. `REQUISITOS.md:35` incluye el catálogo de empresas en lo que hace la oficina. El servidor coincide. Solo los estados (`REQUISITOS.md:47`, EST-04) y la preparación son exclusivos del administrador, y la interfaz ya lo respeta.

### B0. `aria-controls` apuntando a un id inexistente: RESUELTO
- `src/admin/proyectos/Table.tsx:348`: `aria-controls` solo existe con el panel abierto.

### B1. Selección que sobrevive al filtro: RESUELTO
- `src/admin/proyectos/index.tsx:239`: cambiar la búsqueda limpia la selección. Es una decisión de UX más estricta de lo mínimo pedido, pero correcta.

### B2. Conflicto 409 al editar un prep descarta cambios encolados: DESCARTADO, JUSTIFICADO
- Reaplicar cambios sobre una versión que cambió otra persona puede pisar su trabajo. El aviso y la recarga son el comportamiento seguro.

### B3. Popover de preparación sin cierre con Tab: RESUELTO (con matiz)
- `src/admin/proyectos/Floating.tsx:51-56`: un diálogo se cierra cuando el foco sale de él, con Tab o Mayús+Tab. El cierre se hace con `setTimeout` para leer el foco ya movido.
- Matiz: el disparador (`el`) está excluido. Si Mayús+Tab devuelve el foco al botón, el diálogo queda abierto con el foco en el disparador. Es un comportamiento razonable, pero conviene comprobarlo con teclado.

### B4. Preferencia de cierre que oculta un error nuevo: DESCARTADO, CON MATIZ
- El descarte alega que cerrar es una elección deliberada, pero **ningún requisito lo dice** y no se cita ninguno. La pastilla sigue en rojo, así que el aviso no se pierde del todo. Es una decisión de producto que conviene confirmar, no un hecho técnico.

### B5. Panel de avisos fijado en `left-[104px]`: NO RESUELTO (descarte sin base técnica)
- `src/admin/proyectos/Table.tsx:201`: `sticky left-[104px]`. Las columnas fijas que están antes son: casilla `left-0` de 40 px (`Table.tsx:32`) y «#» `left-10` de 44 px (`Table.tsx:42`). Sumadas dan **84 px**, no 104 px. Los 20 px de diferencia dejan ver columnas desplazadas al hacer scroll horizontal.
- El descarte dice que «no se ha comprobado visualmente» y que «las columnas fijas no coinciden con el cálculo propuesto». Pero la discrepancia justifica el arreglo: el valor 104 no sale de las columnas fijas. La conclusión correcta es que **el hallazgo sigue vigente**. Se puede comprobar en el navegador, y el arreglo es cambiar el valor por la suma real.

### B6. Mapa de patrones por color en la línea de tiempo: RESUELTO
- `src/mural/Timeline.tsx:169` y `shared/mural-model.ts:496-497`. Ver la nota de Timeline en la revisión base.

### B7. Logotipo: bitmap sin cerrar y 401 sin evento: RESUELTO
- `src/admin/equipo/logo.ts:24-29`: el bitmap se cierra si falta el contexto. `logo.ts:49`: un 401 dispara `planner:unauthorized`, igual que `src/ui/api.ts:26`.

### B8. Monograma de 10 px: DESCARTADO, ACEPTABLE
- Es un criterio de legibilidad discutible, pero el monograma de la tabla lleva además el nombre accesible. El mínimo de 22 px del mural sí se respeta. Razón aceptable, sin requisito que lo fije.

---

## Problemas nuevos encontrados en esta revisión

Ninguno de ellos bloquea el uso. Son de prioridad baja.

1. `server/auth.ts:130`: el `;` quedó dentro del comentario (ver B3 de la base).
2. `server/routes/prep-items.ts:42-43`: dos comentarios JSDoc seguidos.
3. `src/admin/proyectos/index.tsx:96-103`: Deshacer tras un fallo parcial cubre todos los ids (ver M1 de la interfaz).
4. `tests/v03.test.ts:776-785`: prueba que puede pasar en vacío (ver Timeline).

## Acciones recomendadas, por prioridad

1. **Decidir B5 de la base** (regresión frente a EST-05). Elegir entre quitar la excepción de archivados o cambiar EST-05 y validar también al desarchivar. Corregir el requisito o el código para que coincidan.
2. **Cerrar el caso de M2 de la base:** rechazar nombres que coincidan con códigos de otros parámetros.
3. **Corregir B5 de la interfaz:** el `left` del panel debe ser 84 px, o comprobarlo en el navegador y cambiarlo.
4. Arreglar el `;` de `server/auth.ts:130`.
5. Ejecutar la suite de integración con `TEST_DATABASE_URL` apuntando a una base de pruebas (`--test-concurrency=1`). Esta revisión no la ha ejecutado.

---

## Cierre

Pendientes del informe, resueltos en la rama `integ/v03`:

1. **B5 de la base (archivados en el borrado de estados).** Decisión del coordinador: se mantiene el comportamiento, los archivados pasan al reemplazo sin validar. EST-05 en `docs/REQUISITOS.md` ya lo dice. Para que el efecto secundario no pase sin aviso, `POST /projects/:id/unarchive` y `POST /projects/archive-bulk` con `archived=false` devuelven los errores y avisos de validación del proyecto restaurado, sin bloquear: en `warnings` / `coded_warnings` (los errores llevan el código `error`) y, en el lote, en `warnings` indexado por id. Prueba: «desarchivar devuelve los errores y avisos de validación sin bloquear».
2. **M2 de la base.** `server/routes/prep-items.ts` rechaza con 422 un nombre que coincida (sin mayúsculas ni tildes) con el código de otro parámetro y un código que coincida con el nombre de otro, tanto al crear como al cambiar. Prueba: «un nombre no puede coincidir con el código de otro parámetro, ni al revés».
3. **B5 de la interfaz.** El panel de avisos se fija en la columna «Proyecto», calculada de `COLUMNS` (40 + 44 + 44 + 170 = 298 px) con la constante `PROJECT_COL_LEFT`, y mantiene el conector ↳. Nota: el informe proponía 84 px, pero la celda de relleno que tapa las columnas 1 a 4 es fija en `left-0` y mide 298 px, así que 84 px dejaría el texto oculto debajo de ella; por eso el valor es 298 px.
4. **`server/auth.ts:130`.** El `;` sale del comentario.

Cambio de prueba adicional: la prueba del Excel con el parámetro heredado «Parte» buscaba «Kevin Almánzar» solo por nombre y dependía del orden del listado; ahora lo busca también por la parte «pieza A».

Comprobado: `npm run typecheck`, `npm test` (176 de 176, con la base de pruebas recreada), `npx vite build` y `npx playwright test e2e/v03-proyectos.spec.ts` (3 de 3).

Playwright completo (`npx playwright test`): 17 de 17.
