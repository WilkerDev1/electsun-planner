# Auditoría de seguridad: electsun-planner (main, v0.1-demo)

## Resumen

La revisión fue solo de lectura. No encontré ningún fallo crítico ni alto en el código propio. Los hallazgos medios son dos DoS: uno por importación de Excel y otro por falta de bloqueo de intentos por cuenta. Los demás son bajos o de endurecimiento.

Lo que comprobé y está bien:
- **Autenticación y sesiones:**
  - Los tokens son de 32 bytes con SHA-256 y se guarda solo el hash.
  - Las cookies llevan HttpOnly y SameSite=Strict, y Secure se deduce de `APP_ORIGIN`.
  - Las invitaciones y restablecimientos son de un solo uso, caducan y no admiten carreras (`FOR UPDATE` más `used_at`).
  - Desactivar una cuenta, cambiar su rol, restablecer o cambiar la clave borra sus sesiones.
- **Permisos:**
  - ROL-02 y ROL-03 se cumplen en todas las rutas de escritura: `accounts`, `access-links`, `statuses` y `mural/settings` exigen `admin`, y `priority` se bloquea para `office` en POST y PATCH.
  - La importación no toca `priority`, así que `office` no puede escalar por ahí.
- **Dispositivos:** una TV no puede leer la vista móvil ni al revés, y una cookie de otro enlace no sirve. `findDevice` ata `hash`, `link_id`, `kind` e `id`.
- **Teléfonos (MOV-08):** `mobileModel` solo da teléfonos del equipo propio y del encargado o supervisor de cada obra, y nunca correos.
- **Inyección SQL:** no hay concatenación con datos del usuario. Los nombres de columna dinámicos salen de listas fijas (`FIELDS`, `WRITABLE`) o de esquemas zod que descartan claves desconocidas.
- **Cliente:** no hay `dangerouslySetInnerHTML`. Los `href` `tel:` se limpian a dígitos y `+`, y el enlace de mapas usa un host fijo con `encodeURIComponent`. Los tokens `#` se borran con `replaceState`. El service worker no cachea `/api`.
- **Cabeceras:** la CSP efectiva incluye `frame-ancestors`, `form-action`, `object-src 'none'` y `base-uri`. Lo comprobé ejecutando helmet.
- **CSRF:** el chequeo de `Origin` es estricto en toda escritura.
- **Exportación a Excel:** no hay inyección de fórmulas. exceljs escribe los textos como cadenas, no como fórmulas.
- **Historial de git:** 46 commits sin secretos, claves, correos reales ni `.env`. Solo hay contraseñas de prueba (`e2e-*`, `local-test-only`) y teléfonos 809-555-01xx ficticios.
- **Workflow de CI:** `permissions: contents: read` y `pull_request` (no `pull_request_target`).

## Hallazgos

**[Media] DoS por importación de Excel: una fila perdida o un zip bomb agotan memoria y CPU** — `server/xlsx.ts:99` y `:165`; `server/routes/projects.ts:173-191` — Cualquier cuenta `office` o `admin` puede tumbar la API. Lo reproduje con scripts en memoria, sin tocar la base:
- Un `.xlsx` de **6 KB** con una sola celda en `A1048576` hace que `for (n…<= sheet.rowCount)` itere 1.048.576 filas de forma síncrona. Tardó 3,3 s bloqueando el event loop (SSE y TV incluidos) y llegó a ~3 GB de RSS.
- Un `.xlsx` de **414 KB** que se expande a 400 MB cargó en 2,6 s y 1,4 GB de RSS. Con el tope de 5 MB la amplificación es mayor, porque exceljs descomprime sin límite.
- El contenedor no tiene `mem_limit`, así que el OOM reinicia la API (`restart: unless-stopped`) y se puede repetir en bucle.
- Arreglo:
  - Antes de `wb.xlsx.load`, abrir el zip con JSZip (ya viene con exceljs) y rechazar si la suma de `_data.uncompressedSize` supera ~20 MB o hay más de ~20 entradas.
  - Tras cargar, rechazar si `sheet.rowCount > 5000` (o `actualRowCount`).
  - Añadir `mem_limit` y `pids_limit` a `planner-api` en `compose.yaml`.
  - Valorar un límite de peticiones específico para `/api/projects/import`.

**[Media] Intentos de login limitados solo por IP, y argon2 antes de validar el token** — `server/routes/auth.ts:14-18`, `:27-31`, `:48` — Detrás de Cloudflare un atacante rota IPs y prueba contraseñas contra una cuenta concreta (por ejemplo la del admin) sin bloqueo por cuenta. Cada IP tiene su propio presupuesto de 20 intentos cada 15 min.
- `/auth/accept` ejecuta `passwordHash()` (argon2, 19 MiB) en la línea 48 antes de comprobar el token. Cualquier anónimo puede forzar argon2 con tokens falsos.
- Argon2 usa el threadpool de libuv (4 hilos), así que una avalancha desde muchas IPs degrada también `fs` y `crypto` del resto de la app.
- Arreglo:
  - Añadir un limitador adicional con `keyGenerator` por correo en login (por ejemplo 10 fallos por hora por cuenta, con `skipSuccessfulRequests: true`).
  - En `/accept`, comprobar que el token existe antes de hacer argon2 (SELECT, luego hash, luego transacción).
  - Añadir una regla de rate limiting en Cloudflare para `/api/auth/*` y `/api/access/session`.

**[Baja] SSE sin tope de conexiones por credencial** — `server/events.ts:33-59` — Un empleado con enlace móvil (90 días de sesión) o cualquier cuenta puede abrir miles de `EventSource`. Solo se limita la apertura, a 600/min por IP. Cada conexión mantiene un temporizador y hace una consulta cada 60 s al pool de 12 conexiones. `publishChange` escribe en todas sin control de contrapresión (`res.writableLength`). El efecto es degradar el pool y la memoria para el mural de la oficina. Arreglo: máximo de 3 a 5 conexiones por `link_id` o `user_id` (cerrar la más antigua o responder 429) y desconectar clientes con `writableLength` alto.

**[Baja] Cabecera de IP de confianza sin validar el origen** — `Caddyfile:13`, `compose.yaml` (`TRUST_PROXY: "true"`) — Todos los límites (login, canje, 600/min) dependen de `X-Forwarded-For` tomada de `Cf-Connecting-Ip`. Hoy el puerto solo escucha en `127.0.0.1`, pero cualquier proceso o usuario local del servidor, o cualquier segunda entrada que se añada después, puede enviar un `Cf-Connecting-Ip` distinto en cada petición y saltarse todos los límites. Esa es la forma de repetir intentos de contraseña o de token sin tope. Sin la cabecera, `X-Forwarded-For` queda vacío y todo cae en un único cubo. No pude levantar Caddy para confirmar el comportamiento exacto de `header_up`. Arreglo: en el sitio de Caddy, `@nocf not header Cf-Connecting-Ip` más `respond @nocf 403`, y mantener el bind a loopback. Probar con `curl` directo a `127.0.0.1:8091` con y sin la cabecera.

**[Baja] El backup copia `.env` junto al dump** — `ops/backup.sh:12` — `cp .env "$target/server.env"` deja en cada backup `POSTGRES_PASSWORD`, `BOOTSTRAP_PASSWORD` y `SEED_OFFICE_PASSWORD`. Si el directorio se sincroniza a otro sitio (nube, disco externo), una única fuga entrega datos y credenciales. Además, `BOOTSTRAP_PASSWORD` es obligatoria (`:?`) en `compose.yaml` y queda para siempre en el entorno del contenedor. Arreglo: no copiar `.env` (guardarlo cifrado y por separado). Hacer `BOOTSTRAP_*` opcionales y retirarlas tras el primer arranque.

**[Baja] Dependencias con avisos** (`npm audit --omit=dev`: 2 altos, 9 moderados) — `package.json:26` y `:32`:
- **`multer` 2.4.0** (GHSA-q7qp-rjg7-q26m, alto, corregido en ≥2.5.0): afecta a un `fileFilter` asíncrono, y el de la app (`projects.ts:176`) es síncrono, por lo que probablemente no es explotable.
- **`zod` 4.6.5** (alto, corregido en ≥4.6.6): memoria con colecciones grandes. El único array con restricción es `member_ids.max(50)` (`equipo.ts:29`), con cuerpo limitado a 1 MB y solo con sesión.
- **Cadena de `exceljs`** (`uuid`, `archiver`, `glob`, `minimatch`): moderados. El "arreglo" que propone npm es bajar a exceljs 3.4.0, que no hay que aplicar.
- Arreglo: subir `multer` y `zod`, ejecutar `npm audit --omit=dev` en CI y activar Dependabot.

**[Baja] Caché local con teléfonos que no se purga** — `src/ui/useLive.ts:34`; `src/movil/index.tsx:88` — La última respuesta de `/view/movil` (con teléfonos del equipo) se guarda en `localStorage` sin caducidad. Solo se borra si el teléfono llega a recibir un 401 o 403. Si se revoca el enlace de un móvil perdido, apagado o sin red, los teléfonos de sus compañeros siguen ahí. Tampoco se borra la caché `mural-<id>` de una TV revocada. Arreglo: guardar con TTL (por ejemplo 7 a 14 días) e ignorar o borrar lo caducado. Hacer que `useLive` borre su clave en cualquier `revoked`, no solo la móvil.

**[Baja] Filas de sesiones y dispositivos nunca se purgan** — `server/auth.ts:62`, `:76`; `migrations/001_base.sql` (`sessions`, `device_sessions`) — Las filas expiradas no se borran, y cada canje crea una `device_session` nueva sin tope por enlace. El crecimiento es lento pero ilimitado. Arreglo: `DELETE … WHERE expires_at<now()` periódico (al arrancar y cada hora) y un tope de sesiones por enlace.

**[Baja] `/readyz` y `/healthz` fuera del limitador y expuestos por el túnel** — `server/index.ts:56-60` — Están antes del `rateLimit` de `/api`. `/readyz` ejecuta `SELECT 1` sin autenticar y sin límite. Solo lo necesita el healthcheck de Docker, que va directo al puerto 8080. Arreglo: en Caddy, `respond /healthz 404` y `respond /readyz 404`, o moverlos bajo el limitador.

**[Baja] Cadena de suministro sin fijar en un repo público** — `.github/workflows/ci.yml:22-23`; `compose.yaml:4`, `:54`; `Dockerfile:1`, `:13` — Las acciones van por etiqueta mutable (`actions/checkout@v4`, `actions/setup-node@v4`) y las imágenes por etiqueta (`postgres:16`, `caddy:2`, `node:24-bookworm-slim`). Si una etiqueta se compromete o cambia, el siguiente build la ejecuta, y en producción ese build corre junto a la base y los secretos. Arreglo: fijar las acciones por SHA y las imágenes por digest, con Dependabot para actualizarlas.

## Veredicto

Apto para exponer tras el túnel de Cloudflare con condiciones. El diseño de tokens, sesiones, permisos y aislamiento TV/móvil es sólido, sin SQLi ni XSS, y el repo está limpio de secretos y datos reales. Antes de producción conviene resolver los dos medios, que son pequeños:
- Los topes de expansión y filas en la importación de Excel, más `mem_limit` en el contenedor.
- El bloqueo por cuenta en login, más la regla de Cloudflare.

Las conexiones SSE, la regla de `Cf-Connecting-Ip` en Caddy y la retirada de `.env` del backup se pueden hacer en el mismo cambio. El resto puede esperar a una segunda iteración.

Archivos clave: `server/xlsx.ts`, `server/routes/projects.ts`, `server/routes/auth.ts`, `server/events.ts`, `server/index.ts`, `Caddyfile`, `compose.yaml`, `ops/backup.sh`, `src/ui/useLive.ts`. Los scripts de comprobación de zip bomb y filas están en `/tmp/claude-1000/-home-ishiro-Proyectos-1-Principales-electsun-planner/3b1e6036-08ab-4cb0-be8c-f5ed95bc1175/scratchpad/bomb/` y no tocan el repo.

_Revisor: subagente Claude Sonnet 5.5, esfuerzo medio, solo lectura._
