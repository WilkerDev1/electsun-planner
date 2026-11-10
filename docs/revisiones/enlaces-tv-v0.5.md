# Revisión: enlaces de TV con modo, título, ajustes propios y pausa (v0.5)

- Rama revisada: `feat/enlaces-tv` contra `main` (4 commits: `5ca80e5`, `71702ea`, `7829b9e`, `5f6edf5`).
- Encargo: `.claude/prompts/v05-enlaces-tv.md`. Requisitos: ACC-01, ACC-02, ACC-03, ACC-07, ACC-08, MUR-09, MUR-14, HIS-01, API-01.
- Método: lectura del diff completo y de los archivos enteros de la rama. No se ejecutó nada (ni pruebas, ni base de datos, ni servidor), así que no verifico que `typecheck`, `npm test` o Playwright pasen. Solo hay hallazgos comprobados leyendo el código.

## Resumen

No hay hallazgos de severidad Alta. Ninguna ruta de datos entrega el mural a una TV pausada, y un enlace revocado sigue rechazado en todas las rutas. Se puede mergear. Dos puntos conviene corregirlos antes o justo después: M1 (una TV pausada vuelve a mostrar datos viejos si falla una petición) y B1 (el tope de login subido por `NODE_ENV`).

## Hallazgos

### Alta

Ninguno.

### Media

**M1. Una TV pausada vuelve a mostrar el mural viejo ante un fallo de red o un 5xx**
- Archivos: `src/ui/useLive.ts:56-60`, `src/mural/index.tsx:92-103`.
- Escenario:
  1. La TV muestra datos y el admin la pausa.
  2. `load()` recibe 403 `paused`. El `setState` conserva `data` (`{ ...s, error, revoked: true }`) y la pantalla muestra "Pantalla en pausa".
  3. Se reinicia la API en un despliegue o se cae la red un momento. La siguiente petición falla con estado 0 o 502/503, que no son 401/403, así que `revoked` pasa a `false`.
  4. `LiveMural` ya no entra en la rama de pausa. `live.data` sigue ahí, con la copia de antes de la pausa, y la TV vuelve a mostrar el mural con la marca de "sin conexión".
  5. Se corrige sola cuando una petición vuelve a responder 403, pero durante ese rato la pantalla pausada enseña datos.
- El mismo defecto ya existía con "revocado". La pausa lo hace más visible porque es una acción cotidiana y reversible, y el ACC-08 promete que la pausa deja la pantalla sin datos.
- Corrección: en `useLive`, cuando el error sea 401/403, ponga `data: null` además de `revoked: true`. También se puede hacer que el estado `paused` sea pegajoso: en errores que no son 401/403, conserva `revoked` y `error` si venían de 403. Después, `LiveMural` no necesita cambios.

### Baja

**B1. El tope de intentos de login depende de `NODE_ENV === "e2e"`**
- Archivo: `server/routes/auth.ts:14-17`.
- No puede activarse en producción con la configuración actual:
  - `Dockerfile:14` fija `NODE_ENV=production`.
  - `compose.yaml`, `compose.local.yaml` y `.env.example` no definen `NODE_ENV`.
  - Ningún otro código lee `NODE_ENV` salvo `!== "test"` en `server/index.ts:171`.
- El riesgo es de despliegue: un `NODE_ENV=e2e` puesto por error multiplicaría por 10 el límite por IP, que también protege `/accept` y `/password`. Además mezcla "entorno" con "ajuste de seguridad".
- Alternativa más segura, sin cambiar el comportamiento de producción:
  - Una variable propia, por ejemplo `AUTH_LIMIT_PER_IP`, con valor por defecto 20, que solo fija `playwright.config.ts` en `webServer.env`. Se puede acotar con `Math.min(…, 500)`.
  - O mantener el 20 y que los E2E reutilicen sesión con `storageState` (hoy `login()` de `e2e/helpers.ts` se usa 15 veces, y cada inicio cuenta porque `authLimiter` no usa `skipSuccessfulRequests`).
- El límite por cuenta (`accountLimiter`, 10 por hora y solo cuenta los fallos) queda intacto en ambos casos.

**B2. Una sesión de cuenta en el mismo navegador se salta la pausa**
- Archivo: `server/routes/view-mural.ts:48-56`.
- Si `req.user` existe, la vista no mira `findDevice` ni `paused`. Quien abre `/tv/<id>` en su propio navegador con la sesión iniciada ve el mural aunque el enlace esté pausado (o revocado, que ya era así antes).
- Escenario: el admin pausa una TV y abre la URL en su navegador para comprobar que está pausada. Sigue viendo el mural y concluye que la pausa no funciona. Los E2E no lo detectan porque usan un contexto limpio.
- Corrección: aceptable dejarlo (la cuenta ya tiene permiso para ver el mural). Si se quiere mantener la coherencia, que `LiveMural` con `link` pida `?link=` y el servidor trate como TV cuando la ruta sea `/tv/:id`. Como mínimo, anotarlo en el ACC-08.

**B3. `hasAnyAccess` y `device()` no distinguen `paused`**
- Archivos: `server/auth.ts:107-123` (`device()`), `server/auth.ts:125-140` (`hasAnyAccess`).
- Llamadores comprobados:
  - `findDevice` lo llaman `view-mural.ts:59` (comprueba `paused`), `events.ts:34` (deja pasar a propósito, solo envía avisos de cambio sin datos), `device("mobile")` en `view-movil.ts:15` y `device()`.
  - `hasAnyAccess` solo lo usa `companies.ts:173` (logotipos).
  - Un móvil nunca está pausado, porque el CHECK `access_links_tv_only` lo impide.
- Consecuencia hoy: una TV pausada puede pedir logotipos de empresas (`/api/companies/:id/logo`). No muestra nada, así que no es una fuga real. Los datos del mural sí quedan bloqueados.
- Riesgo latente: `device("tv")` devuelve el dispositivo pausado sin más. Si en el futuro alguien protege una ruta de datos con `device("tv")`, entregará datos a una TV pausada sin darse cuenta.
- Corrección: defensa en profundidad, con dos cambios pequeños:
  - `device()` responde 403 con `reason: "paused"` cuando `kind === "tv" && d.paused`.
  - `hasAnyAccess` añade `AND NOT l.paused`.
- El SSE debe seguir dejando pasar a la TV pausada para que vuelva sola.

**B4. Rotar o reactivar conserva la pausa sin avisar**
- Archivos: `server/routes/access-links.ts:104-122`, `src/admin/mural/TvLinks.tsx:434-446`.
- Es lo que pide el encargo ("rotar conserva pausa"). Pero con "Reactivar" (rotar un enlace revocado y pausado), la fila pasa a "En pausa" y la TV, al abrir la URL nueva, muestra "Pantalla en pausa". El diálogo dice "El título y los ajustes se conservan" y no menciona la pausa.
- Corrección: añadir "y la pausa" al texto del diálogo cuando `link.paused`, o limpiar `paused` al reactivar un enlace revocado. Lo segundo es más predecible, pero cambia lo decidido.

**B5. Un título largo se corta con elipsis a unos 40 caracteres en Principal**
- Archivo: `src/mural/Principal.tsx:88` (`maxWidth: 900`) y `src/mural/Timeline.tsx:112` (`maxWidth: 1000`).
- El contrato admite hasta 60 caracteres. A 40 px y peso 800, Principal enseña unos 38-42 caracteres y corta el resto sin avisar al administrador.
- No rompe el lienzo, porque los contenedores tienen `minWidth: 0` y los elementos se encogen. El texto de la pausa mide 48 px y 24 px, por encima de los 22 px pedidos.
- Corrección: texto de ayuda en el diálogo ("hasta unos 40 caracteres se ven completos"), o bajar `maxLength` a 40. Alternativa: usar la marquesina de `Rotate.tsx` como sugería el encargo.

**B6. "Usar el general" para el modo solo se alcanza desde Configurar; las TV nuevas ya no siguen el diseño general**
- Archivo: `server/routes/access-links.ts:52` (`{ design: "principal", ...b.mural }`).
- Toda TV nueva guarda `design` explícito. Cambiar "Diseño" en el mural general ya no afecta a esas TV, mientras que las anteriores a la migración (con `{}`) sí lo siguen. Es coherente con el encargo, pero el administrador puede extrañarse.
- Corrección: texto en la tarjeta de ajustes generales o en la de TV que diga que cada TV puede tener su propio modo.

**B7. La insignia "Ajustes propios" solo explica por `title`**
- Archivo: `src/admin/mural/TvLinks.tsx:329-333`.
- El `title` HTML no se lee de forma fiable con lector de pantalla ni en táctil, y no dice qué ajustes cambia.
- Corrección: poner el detalle en texto visible, por ejemplo "Ajustes propios: 4 semanas, reloj apagado", o en el `aria-label`.

**B8. Vista previa de un enlace inexistente muestra "Sin conexión"**
- Archivos: `server/routes/view-mural.ts:50-52` (404), `src/mural/index.tsx:99-103`.
- Si se abre `/mural/tv?link=<id borrado>`, el 404 no marca `revoked` y la pantalla dice "Sin conexión… se vuelve a intentar solo" y reintenta para siempre.
- No hay forma de borrar enlaces de TV desde la UI, así que hoy solo ocurre con una URL manipulada. Corrección: mostrar "Esta pantalla no existe" cuando el estado sea 404.

**B9. Huecos en las pruebas**
- `tests/enlaces-tv.test.ts`:
  - El caso "Un enlace revocado se distingue" usa una cookie inventada (`planner_tv_x=nada`). El revocado real se prueba en el último test y está bien.
  - No se prueba el SSE de una TV pausada (`/api/events?link=`: abre y recibe `change` tras reanudar), que es lo que permite "volver sola".
  - No se prueba `/api/companies/:id/logo` con una TV pausada.
  - No se prueba `?link=` de una cuenta con un enlace móvil (debe dar 404) ni con un id que no sea UUID.
  - No se prueba rotar con la TV pausada.
- `e2e/enlaces-tv.spec.ts`:
  - Pasa axe solo sobre `#tv-links` y `dialog` (con las etiquetas WCAG 2.x A/AA y sin desactivar reglas), no sobre la página `/mural` completa, por la vista previa escalada. Es defendible y está justificado en el comentario, pero es menos que "axe sobre la pantalla".
  - No hay prueba de título largo a 1920×1080 ni de la pantalla "Este enlace fue desactivado" tras revocar.
  - El flujo es lineal en una sola prueba larga; si falla al principio no se comprueba el resto.

## Revisado y correcto

- **`findDevice` con `paused` y sus llamadores.**
  - `view-mural.ts:59-61` rechaza al dispositivo pausado con 403 `reason: "paused"` antes de leer ningún dato del mural. La respuesta no lleva datos; la prueba comprueba que `JSON.stringify` no contiene "model".
  - La sesión (`device_sessions`) se conserva, y la prueba comprueba que el recuento no cambia y que la misma cookie vuelve a dar 200 al reanudar.
  - `events.ts:34` deja conectada a la TV pausada. Solo recibe `change`, `ready` y `revoked`, sin datos. Es necesario para que reanude sola.
  - Revocar borra `device_sessions` y deja `active=false`, así que `findDevice`, `hasAnyAccess`, `events.ts` (envía `revoked` en el siguiente latido, en 60 s como máximo) y el canje (`access.ts`, exige `active` y hash) lo rechazan.
- **`PATCH /api/access-links/:id`** (`access-links.ts:129-157`):
  - Solo admin (`accessLinks.use(authenticated, admin)`). La prueba cubre 401 sin sesión y 403 con oficina.
  - Solo `kind='tv'`: 404 si no existe, 422 si es móvil.
  - El esquema es `.strict()` con `refine` de al menos un campo. `title: null` quita el título. `""` o solo espacios pasan a `null` y no violan el CHECK de 1 a 60. El `mural` es un `partial().strict()` (claves desconocidas y `weeks: 9` dan 422).
  - `FOR UPDATE`, escritura y `audit` en la misma transacción. `audit` va con `diffOf` y claves de `mural` ordenadas, así que el orden interno del `jsonb` no genera cambios falsos. No se audita si no hay cambios reales.
  - `publishChange("link.update")` va después del commit. `useLive` recibe `change`, recarga con 1 s de espera, y la TV pasa a pausa o reanuda. La comprobación del E2E cubre ese flujo.
  - Origin y Sec-Fetch-Site se verifican en `server/index.ts` para toda escritura.
  - Ni `token_hash` ni `kind` ni `active` se pueden modificar por esta vía.
- **`GET /api/view/mural`:**
  - La fusión `{ ...saved, ...own, ...override }` es correcta: lo propio gana al general y los parámetros de vista previa de una cuenta ganan a ambos. La TV no puede imponer parámetros, porque `Preview` solo se parsea si hay `req.user`. La prueba existente de `mural.test.ts:513` sigue valiendo.
  - `TvMuralOverrides.safeParse` con respaldo `{}` evita que un `jsonb` raro rompa la TV.
  - `?link=<id>` para cuentas: cualquier cuenta (incluida oficina) puede ver el título y los ajustes de cualquier TV, pero esos datos no son sensibles (no incluyen token ni URL) y ya ven el mural entero. Es aceptable. Solo revela si un UUID existe como TV (404 si no), lo que no es explotable con UUID v4. No se puede usar con un enlace móvil (`kind='tv'` en la consulta).
  - El título solo se pinta como texto de React; no hay inyección.
- **Migración `004_enlaces_tv.sql`:**
  - Es solo aditiva: columnas con valores por defecto (`NULL`, `'{}'`, `false`), así que las filas existentes y las filas móviles cumplen los CHECK, y el código anterior (sin las columnas en sus `INSERT`) sigue funcionando si hay que volver atrás.
  - `access_links_tv_only` impide título, ajustes o pausa en móviles, y la prueba verifica el error 23514 de la base.
  - No toca las migraciones anteriores, así que las sumas de verificación de 001-003 no cambian. El runner (`server/db.ts`) aplica la nueva en la misma transacción con bloqueo.
  - `tests/v03.test.ts:783` está actualizada. El comentario entre cláusulas del `ALTER` es SQL válido.
  - El 004 estaba libre en `main`.
- **`httpError`/`ApiError` con `reason`:** `server/index.ts:129-131` solo añade `reason` si hay `status` y `reason`. El único valor usado es `"paused"`, constante, sin datos del sistema. El 403 de pausa solo se ve con una cookie de dispositivo válida del mismo enlace, así que no permite saber si un id existe.
- **Rotar conserva título, ajustes y pausa; revocar borra sesiones.** El `UPDATE` de rotar solo toca `active` y `token_hash`, y borra `device_sessions`. Revocar pone `active=false`, `token_hash=NULL` y borra sesiones, como antes. Ambos siguen llamando a `publishChange`.
- **Cliente de la TV:**
  - La pantalla "Pantalla en pausa" (48 px / 24 px) se distingue del revocado por `reason`.
  - `useLive` quita la copia local en un 403 (no se reabre con datos viejos al recargar).
  - La TV sigue consultando por SSE y cada 60 s, y vuelve sola.
  - Una TV revocada mantiene el mensaje de siempre.
  - `cursor: none` y el resto de la vista de TV no cambian.
- **Cabecera:** el título usa `ellipsis`, `minWidth: 0` y un tope de ancho, y `lineHeight` subido para que no se corten las letras con cola. Sin título sigue diciendo "Proyectos". No desborda el lienzo en Principal ni en Timeline.
- **UI de administración:**
  - Los botones de modo usan `aria-pressed`, `min-h-11` (44 px) y un nombre accesible. Los `aria-label` empiezan por el texto visible.
  - La insignia lleva icono, color y texto (no solo color). El estado se muestra con texto.
  - La pausa y la configuración no se pisan entre sí: la pausa envía solo `paused` y el diálogo no envía `paused`.
  - El diálogo usa `Modal`, con foco inicial, y "Usar el general" es el valor `undefined` que se borra del objeto.
  - La tarjeta explica que la URL solo se ve al crear o generar uno nuevo, y mantiene `LinkSecretDialog` con copiar y QR.
- **Requisitos:** `docs/REQUISITOS.md` amplía ACC-01, ACC-03, ACC-07, MUR-09, añade ACC-08 y actualiza las tablas de API y pantallas.
- **Pruebas:** las de integración cubren crear con modo y título, modo por defecto, claves desconocidas, PATCH admin/oficina/anónimo, móvil rechazado, herencia del general, título nulo, pausa que conserva sesión, reanudar con la misma cookie, rotar, revocar y auditoría. El E2E recorre el flujo completo con una TV en otro contexto.
- **Reglas del repositorio:** textos en español simple, ningún dato real, escrituras con `transaction` + `audit` + `publishChange`, API del cliente solo con `api()`.

## Resolución

Ronda única de correcciones. Verificado: `npm run typecheck`, `npm test` (223 pruebas, 0 fallos), `npx vite build` y Playwright completo (19 pruebas) en una copia de scratchpad, ya borrada.

| Hallazgo | Estado | Qué se hizo |
|---|---|---|
| M1 | Corregido | `src/ui/useLive.ts`: ante 401/403 se pone `data: null` y `fetchedAt: null` además de borrar la copia local. Un fallo de red o 5xx posterior ya no reabre el mural viejo en una TV pausada o revocada. El modo sin conexión sigue igual (con error de red o 5xx se conservan los datos): la prueba E2E MUR-11 sigue pasando. |
| B1 | Corregido | `NODE_ENV=e2e` sustituido por `E2E_RELAX_LOGIN_LIMIT=1`, que solo pone `playwright.config.ts`. Documentado en `.env.example` como variable que nunca se define en producción. |
| B2 | Se mantiene, anotado | Una cuenta con sesión ya puede ver el mural. Anotado en ACC-08. |
| B3 | Corregido | `device()` responde 403 con `reason: "paused"` para una TV pausada; `hasAnyAccess` añade `AND NOT l.paused`. El SSE sigue usando `findDevice` y deja conectada a la TV pausada. |
| B4 | Corregido | Los diálogos de "Rotar" y "Reactivar" avisan "seguirá en pausa" cuando el enlace está pausado. |
| B5 | Corregido | `titleSize()` (`src/mural/shared.tsx`): 40 px hasta 26 caracteres, 30 px hasta 40 y 24 px hasta 60, en Principal y Timeline. 60 caracteres caben en mayúsculas/minúsculas normales; en mayúsculas puede aparecer elipsis. Nunca baja de 22 px. |
| B6 | Se mantiene (decisión del coordinador) | Cada enlace guarda su modo. Anotado en ACC-08. |
| B7 | Corregido | La insignia dice en texto visible qué cambia: "Ajustes propios: semanas, reloj". |
| B8 | Corregido | Un 404 en la vista previa muestra "Este enlace no existe". |
| B9 | Corregido | Nuevas pruebas de integración: logotipo con TV activa (200) y pausada (401), SSE de la TV pausada (queda conectada y recibe `change` al reanudar), `?link=` con un enlace móvil y con un id que no es UUID (404), y rotar con la TV pausada conserva la pausa. No se añadieron E2E de título largo ni de revocado. |

Revisión de confirmación: Aprobado. Ajuste posterior: el lector SSE de las pruebas (`openStream`) usa un único bucle de lectura en segundo plano, sin perder trozos por tiempos de espera.
