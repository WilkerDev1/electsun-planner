# Revisión de `feat/v03-base` (base v0.3)

Revisión de solo lectura del diff `main..feat/v03-base` (39 archivos, +2261 / −221). Cada hallazgo se verificó leyendo el código de la rama (`git show feat/v03-base:<ruta>`). Las líneas remiten a esa rama.

## Resumen

- **Alta:** ninguno.
- **Media:** 2 (carrera en la regla «último estado de su tipo»; parámetros del catálogo con nombre de columna del Excel que se ignoran sin aviso).
- **Baja:** 9, sin efecto grave, pero conviene corregirlos antes de que los agentes de interfaz construyan encima.
- **Pruebas:** los 29 tests unitarios de `domain.test.ts` y `pattern.test.ts` pasan. **Las pruebas de integración no se ejecutaron** (ver «Nota de proceso» al final).

---

## Media

### M1. La regla «no se borra el último estado de su tipo» se puede romper con dos borrados simultáneos
- **Archivo:** `server/routes/statuses.ts:92-94`
- **Problema:** el conteo `SELECT count(*) FROM statuses WHERE kind=$1` no toma ningún bloqueo. Cada transacción bloquea solo su propia fila (`FOR UPDATE` en la línea 88), así que dos borrados de estados distintos del mismo tipo no se bloquean entre sí.
- **Escenario:** el tipo `terminado` tiene dos estados, A y B. Dos administradores pulsan «borrar» a la vez. Ambas transacciones cuentan 2 (ninguna ve el borrado de la otra hasta confirmar), las dos pasan la comprobación y se confirman. Queda el tipo `terminado` sin ningún estado, algo que el comentario de la línea 79-80 dice que nunca puede ocurrir. Eso deja a los proyectos sin estado posible de ese tipo y puede romper el mural.
- **Arreglo:** bloquear todas las filas del tipo antes de contar, por ejemplo `SELECT id FROM statuses WHERE kind=$1 ORDER BY id FOR UPDATE` y luego contar, o un `pg_advisory_xact_lock` con una clave por tipo. Añadir una prueba concurrente, o al menos documentar el límite.

### M2. Los parámetros del catálogo cuyo nombre coincide con una cabecera del Excel se ignoran sin aviso
- **Archivo:** `server/xlsx.ts:105-108` (índice de cabeceras) y `server/xlsx.ts:83-92` (`prepHeaderIndex`).
- **Problema:** al leer una cabecera primero se comprueba `ALIAS_INDEX`, y si coincide con una columna conocida (Lugar, Estado, Tipo, Parte, Notas, Días…) se `return`a sin mirar el catálogo. Un parámetro de preparación llamado así nunca se asocia a su columna.
- **Escenario:** el administrador crea el parámetro «Parte» o «Estado» (`prep_items.name` solo se valida como texto, línea 24 de la migración). Al importar, sus marcas «Sí/No» se descartan sin ningún mensaje. En la exportación aparecen dos columnas con la misma cabecera, y al volver a importar la segunda se pierde.
- **Arreglo:** rechazar en la API los nombres de parámetro que colisionen con `ALIAS_INDEX` o con las cabeceras fijas de la exportación (`EXPORT_COLUMNS`, línea 427), o avisar en el informe de importación (`messages`) cuando una cabecera del catálogo quede sin asignar.

---

## Baja

### B1. La marca `immutable` se aplica a cualquier valor de `?v=`
- **Archivo:** `server/routes/companies.ts:185`.
- **Problema:** la condición es `typeof req.query.v === "string" && req.query.v`. No se comprueba que `v` coincida con el `sha256` que se sirve. Una URL con `?v=cualquiera` devuelve el logotipo actual con `max-age=31536000, immutable`.
- **Escenario:** un cliente con una página antigua pide `?v=<hash viejo>` tras reemplazar el logotipo. El navegador guarda durante un año el contenido nuevo bajo la URL vieja. No es un riesgo de seguridad (la caché es `private`), pero rompe la semántica de la URL con hash.
- **Arreglo:** `immutable` solo si `req.query.v === logo.sha256.slice(0, 12)`. En otro caso, `private, no-cache`.

### B2. El logotipo responde 401 sin sesión; el encargo pide 404
- **Archivo:** `server/routes/companies.ts:173`. La prueba `tests/v03.test.ts` (línea ~291) espera 401.
- **Problema:** no es un defecto. El código y la prueba coinciden entre sí, pero el encargo de la sección 5 dice «404 sin sesión». Conviene decidir cuál vale y dejar el encargo, `REQUISITOS.md` y la prueba iguales.
- **Arreglo:** 401 es lo más coherente con `/api` y con el resto de lecturas. Corregir el texto del encargo o de `REQUISITOS.md`.

### B3. `hasAnyAccess` solo mira las 12 primeras cookies de dispositivo
- **Archivo:** `server/auth.ts:127-130` (`.slice(0, 12)`).
- **Escenario:** un navegador que ha abierto 13 enlaces de TV distintos (cada uno con su cookie `planner_tv_<id>`) deja fuera de los logotipos al resto de las cookies, y esas pantallas caen al monograma sin ningún error visible.
- **Arreglo:** no limitar las cookies por cantidad, o limitarlas solo para el cálculo de hashes con un tope mayor (p. ej. 50) y documentarlo.

### B4. `validateProject` tiene `prepCatalog = []` por defecto
- **Archivo:** `shared/domain.ts:392`.
- **Problema:** si un llamador olvida el catálogo, `missingPrep` devuelve `[]` y los avisos «con preparación pendiente» desaparecen sin error. Hoy todos los llamadores que he encontrado lo pasan (`project-store.ts:161`, `xlsx.ts:382`, `src/admin/proyectos/model.ts:62`), pero el compilador no lo detecta.
- **Arreglo:** hacer el parámetro obligatorio. Las pruebas que no lo necesitan pueden pasar `[]` explícitamente.

### B5. Los proyectos archivados también validan al moverse por el borrado de un estado
- **Archivo:** `server/routes/statuses.ts:103-112`.
- **Escenario:** un proyecto archivado de hace un año sin fecha de fin no puede pasar a «Programado». El borrado falla con 422 y el administrador tiene que elegir otro reemplazo, aunque ese proyecto no esté en uso.
- **Arreglo:** es una decisión de negocio. Si se mantiene, documentarla en el encargo. Si no, omitir la validación para `archived`, pero entonces el proyecto archivado puede quedar en un estado incoherente.

### B6. Límite y orden del catálogo de preparación: condiciones de carrera menores
- **Archivo:** `server/routes/prep-items.ts:44-49` (conteo y `sort`), `server/routes/prep-items.ts:34-35` (unicidad del nombre).
- **Problema:** el límite `MAX_PREP_ITEMS` se comprueba con un conteo sin bloqueo, así que dos altas simultáneas pueden superarlo. `Math.min(next, 99)` asigna el mismo `sort` a partir del 99, lo que hace el orden no determinista. La unicidad del nombre sin distinguir mayúsculas solo está en la aplicación, no en la base (la migración solo tiene `UNIQUE` en `code`).
- **Arreglo:** bloquear la tabla (`LOCK TABLE prep_items IN SHARE ROW EXCLUSIVE MODE`) o un `pg_advisory_xact_lock` antes de contar y de validar; índice único `lower(name)`.

### B7. `archive-bulk` no acepta `version`
- **Archivo:** `server/routes/projects.ts:188-207`.
- **Problema:** el archivado individual acepta `version` opcional, pero el de bloque no. Como `saveProject` solo cambia `archived`, no se pisan otros campos, así que el riesgo es bajo: un usuario puede archivar un proyecto que otro acaba de editar sin enterarse.
- **Arreglo:** aceptar `version` opcional por proyecto (como el individual) y devolver 409 si no coincide. Añade complejidad, así que decidir si merece la pena.

### B8. Bloquear el estado de reemplazo
- **Archivo:** `server/routes/statuses.ts:100-101`.
- **Problema:** el reemplazo se lee con `listStatuses` sin `FOR UPDATE`. Si otro borrado lo elimina a la vez, la base lo rechaza por clave foránea (`23503`) y el cliente recibe un 422 genérico «Una referencia ya no está disponible.». No hay corrupción, pero el mensaje no dice qué pasó.
- **Arreglo:** `SELECT ... FROM statuses WHERE id=$1 FOR UPDATE` sobre el reemplazo, y un mensaje específico si ya no existe.

### B9. El logotipo se sirve al Service Worker sin limpiarse al cerrar sesión
- **Archivo:** `vite.config.ts` (bloque `runtimeCaching`).
- **Problema:** `StaleWhileRevalidate` con 50 entradas guarda los logotipos en el navegador tras cerrar sesión. Los logotipos son marca, no datos sensibles, así que es aceptable. Anotarlo en `REQUISITOS.md` por si cambia la política.

---

## Revisado y correcto

- **Migración 002.** Se aplica en una sola transacción con bloqueo asesor y suma de verificación (`server/db.ts:13-41`). Copia las tres marcas de `prep_plans`, `prep_materials` y `prep_ede` a `project_prep` antes de eliminar las columnas, en el mismo `BEGIN`, así que no hay pérdida de datos. `project_prep` tiene `ON DELETE CASCADE` en ambas claves. `companies.pattern` y `company_logos.data` tienen `CHECK`s, y el límite de 307200 bytes coincide con el de la ruta (300 KB). `projects.status_id` no tiene `ON DELETE`, así que el borrado de estados no puede quitar proyectos en silencio. No hay otras tablas que referencien `statuses` (verificado en `001_base.sql` y en el mural).
- **Reconocimiento de imágenes** (`server/image.ts`). Las lecturas están acotadas por la longitud del buffer: PNG exige 24 bytes, JPEG comprueba `o + 4` y `o + 9`, WebP exige 30. El bucle de JPEG avanza siempre al menos 2 bytes y termina, así que no hay bucles infinitos. Los `length < 2` se rechazan. Los SOF excluyen correctamente `C4`, `C8` y `CC`. Los tamaños se leen con el desplazamiento correcto para VP8, VP8L y VP8X. Ningún parser descomprime, así que no hay bomba de descompresión. SVG y HTML disfrazados se rechazan.
- **Logotipo PUT.** Solo autenticados. El origen se comprueba para escrituras en `/api` (`server/index.ts:74-82`). El límite de 300 KB se aplica antes de leer el cuerpo (`express.raw`). El `Content-Type` del cliente no se usa.
- **Logotipo GET.** `hasAnyAccess` comprueba `u.active` y `expires_at` para cuentas (`loadUser`) y `l.active` y `expires_at` para dispositivos. Un enlace de empleado «De baja» se desactiva en la misma transacción (`employees.ts:83-85`), así que tampoco pasa. Las cabeceras son `nosniff`, `Content-Disposition: inline` y `CSP: default-src 'none'`. `ETag` coincide con el `sha256` y `304` funciona. El `Cache-Control` de `/api` (`no-store`) se sobrescribe de forma correcta.
- **Borrado de estados.** Permisos `admin` en las cuatro rutas de escritura. Versión comprobada tras bloquear. El reemplazo debe existir y ser distinto. Los proyectos se bloquean en orden de `id` y se guardan con `saveProject` (historial y `version+1`). La validación contra el estado nuevo solo corre si cambia el tipo, y con el mismo tipo las reglas no cambian. Hay un `publishChange("status")` y uno de `project`. `StatusPatch` no permite cambiar `kind`, así que el último estado de un tipo no puede desaparecer por un PATCH.
- **Catálogo de preparación.** Ids validados por `z.uuid()` y por `assertPrepItems` (que también evita repetidos). El reemplazo de `prep` es completo y se normaliza al orden del catálogo, así que `changedFields` no ve cambios falsos. El borrado de un parámetro bloquea su fila antes de leer los proyectos afectados, así que una alta concurrente en un proyecto espera (clave foránea) y falla limpiamente. Cada proyecto afectado recibe historial y versión nueva. `publishChange` se llama solo tras confirmar.
- **Archivado en bloque.** Límite de 200 ids, dedupe, bloqueo en orden de `id` para evitar interbloqueos, una transacción, un historial por proyecto y un solo `publishChange`. Los ids que no existen devuelven 404 antes de escribir nada.
- **Excel: exportación.** ExcelJS guarda las cadenas como texto literal (`node_modules/exceljs/lib/doc/cell.js:1066`: solo las convierte en fórmula un objeto `{formula}`). No hay inyección de fórmulas: un nombre que empieza por `=` se queda como texto. Las columnas de fecha (4, 8, 9, 15) coinciden con `EXPORT_COLUMNS`. Las columnas del catálogo salen «Sí», «No» o vacías, y la importación las acepta por nombre o código, con las cabeceras antiguas (`LEGACY_PREP_HEADERS`).
- **Excel: importación.** `guardZip` ya estaba en `main` (`server/xlsx.ts:131-143`). Confía en los tamaños declarados en el índice del zip, así que un zip falsificado puede saltarse el límite. No es un cambio de esta rama; anotarlo como deuda.
- **Patrones** (`shared/pattern.ts`). Los valores CSS no vienen del usuario: el color pasa por `HEX.test` con un valor de respaldo, el patrón por `isCompanyPattern`, y los números son generados por el código. El `textColor` se elige entre blanco y negro con el mayor contraste (≥ 4,58 sobre el fondo), y el dibujo se aleja del texto, de modo que el contraste nunca baja. El barrido de colores de `tests/pattern.test.ts` lo verifica.
- **`CompanyMark`.** El `alt` es el nombre salvo que sea decorativo. Si la imagen falla (`onError`), vuelve al monograma y el estado se guarda por URL, así que un logotipo nuevo sí se vuelve a intentar.
- **Mural y móvil.** Reciben el catálogo (`viewMural`, `viewMovil`) y el motivo de espera sale del `pending_label`. `prepApplies` respeta `applies_to` y los parámetros que no aplican no cuentan como pendientes.
- **Semilla.** `seedDemo` con `reset` vacía `prep_items` y lo vuelve a crear. Sin `reset`, `ON CONFLICT (code) DO NOTHING` evita duplicar los tres parámetros de la migración.
- **Pruebas unitarias.** 29 de 29 pasan en `tests/domain.test.ts` y `tests/pattern.test.ts`.

## Nota de proceso

Al intentar ejecutar las pruebas de integración ejecuté `tests/mural.test.ts` (y los demás en paralelo) sin definir `TEST_DATABASE_URL`. `tests/helpers.ts:7-8` apunta entonces por defecto a `postgres://…@127.0.0.1:5544/planner_test`, no a la base de la letra `g` que pide el encargo. Su `setup()` hace `TRUNCATE users, sessions, invitations, audit` y recarga la demo en esa base. La ejecución terminó con un `deadlock detected` (40P01) porque los archivos corrían en paralelo. **Conviene revisar esa base de pruebas y avisar a quien la use**, porque pudo perder sus cuentas y auditoría. Las pruebas de integración no se han validado en esta revisión; hay que ejecutarlas con `TEST_DATABASE_URL` apuntando a la base de la letra `g` y `--test-concurrency=1`.

Ningún archivo del repositorio se ha modificado. El único archivo nuevo es este informe, y el resto de la copia de trabajo en `main` está sin cambios.


---

## Resolución

Rama `fix/v03-base`. Pruebas nuevas al final de `tests/v03.test.ts`. Comprobaciones: `npm run typecheck`, `npm test` (172 de 172, base de la letra `k`) y `npx vite build`.

**Corregido**
- **M1.** El borrado de un estado toma un bloqueo asesor por tipo (`pg_advisory_xact_lock`) antes de contar, y después bloquea el estado y su reemplazo en orden de id. Prueba con dos borrados simultáneos del mismo tipo: uno da 200 y el otro 409.
- **M2.** La API rechaza (422, «ya es una columna del Excel») nombres y códigos de parámetro que coincidan con una columna fija, con un alias de importación o con la cabecera antigua de otro parámetro (`reservedHeader` en `server/xlsx.ts`). Para parámetros que ya existían con un nombre así, la exportación usa su código como cabecera (`prepExportHeader`) y la importación lo lee por ese código. Pruebas de ambos caminos.
- **B1.** `immutable` solo si `?v=` es igual a los 12 primeros caracteres del `sha256` actual; en otro caso `private, no-cache`.
- **B3.** El tope de cookies de dispositivo en `hasAnyAccess` sube de 12 a 50.
- **B4.** `prepCatalog` de `validateProject` es obligatorio (y `teamCode` pasa a ser explícito, aunque pueda ser `undefined`). Las pruebas pasan `[]`.
- **B5.** Los proyectos archivados pasan al estado de reemplazo sin validar: no están en uso y no deben impedir el borrado. Queda como regla documentada en el código y probada.
- **B6.** Altas y cambios del catálogo de preparación toman un bloqueo asesor (el conteo del máximo y la unicidad del nombre ya no tienen carrera).
- **B7.** `archive-bulk` acepta `versions` opcional (`id → versión`); si alguna no coincide responde 409 y no archiva nada.
- **B8.** El estado de reemplazo se bloquea junto al borrado, y si ya no existe el mensaje es «El estado de reemplazo ya no existe. Elige otro y vuelve a intentarlo.».
- **B9.** Al cerrar sesión se borra la caché `company-logos` del Service Worker (`src/ui/auth.tsx`).
- **Timeline.** `TimelineRow` lleva `pattern` (`shared/mural-model.ts`); `src/mural/Timeline.tsx` ya no usa el mapa color → patrón, así que dos empresas con el mismo color se distinguen.

**Descartado**
- **B2.** El 401 sin sesión es lo correcto y coherente con `/api`; no se cambia.
- **B6 (parcial).** No se añadió el índice único `lower(name)` ni se cambió el `Math.min(next, 99)` del orden: haría falta una migración nueva y con `MAX_PREP_ITEMS = 30` el orden nunca llega a 99. Con el bloqueo asesor, la aplicación es la única vía de escritura y la unicidad queda garantizada.
- **Deuda anotada, sin cambio:** `guardZip` confía en los tamaños declarados del zip (ya estaba en `main`).
