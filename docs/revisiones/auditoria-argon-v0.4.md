# Auditoría de seguridad, dominio y calidad — v0.4 (Argon)

## Resumen

El repositorio `electsun-planner` (v0.4) mantiene un nivel de calidad y seguridad muy sólido tras haber resuelto todos los hallazgos críticos y medios de las revisiones v0.1 a v0.4.
No se encontraron vulnerabilidades de severidad **Alta** en autenticación, sesiones, enlaces mágicos, SSE, cabeceras CSP/Helmet ni consultas SQL parametrizadas.
Se detectaron **2 hallazgos de severidad Media** y **4 de severidad Baja**, centrados en una discrepancia de validación de `VAL-01` en el panel lateral, límites de descomprensión/tasa en la importación `.xlsx` y casos borde de fechas, zona horaria y homónimos.
Las reglas de negocio en `shared/domain.ts`, `shared/mural-model.ts` y `shared/movil-model.ts` son puras, deterministas y están bien alineadas con `docs/REQUISITOS.md`.
La cobertura de pruebas unitarias, de integración (PGlite) y extremo a extremo (Playwright) abarca las fases F0–F6, quedando solo pequeños huecos en los casos borde señalados abajo.

---

## Hallazgos

### Severidad Alta

No se encontraron hallazgos de severidad alta.

---

### Severidad Media

#### M-01 — `missingFor` en el panel de proyecto omite la tercera regla de `VAL-01` (fin previsto o días estimados) y dispara un `PATCH` automático que falla con 422

- **Archivo y línea:** `src/admin/proyectos/Panel.tsx:96-110` y `src/admin/proyectos/Panel.tsx:117-122` (en contraste con `src/admin/proyectos/index.tsx:125-134` y `shared/domain.ts:392-396`).
- **Requisitos afectados:** `VAL-01`, `ADM-03`, `ADM-04`.
- **Descripción:** Segun `VAL-01` y `validateProject` (`shared/domain.ts:392-396`), pasar a un estado con `requires_schedule = true` («Programado» o «En obra») exige tres datos: `start_date`, `team_id` y al menos uno entre `end_date` o `estimated_days`. En la tabla (`src/admin/proyectos/index.tsx:125-134`), `pickStatus` comprueba las tres condiciones y, si falta alguna, muestra el mensaje en rojo y abre el panel lateral pasando `{ state: { draftStatus: statusId } }`. Sin embargo, dentro de `Panel.tsx:96-101`, la función `missingFor(s)` solo comprueba `!p.start_date`, `!p.team_id` y `!p.pause_reason.trim()`, olvidando verificar `!p.end_date && !p.estimated_days`.
- **Escenario concreto de fallo:**
  1. Un proyecto en «Por programar» ya tiene asignados `start_date` y `team_id`, pero aún tiene `end_date = null` y `estimated_days = null`.
  2. El usuario cambia el selector de estado de la fila en la tabla a «Programado». `pickStatus` (`index.tsx:128-132`) detecta que falta «el fin previsto o los días estimados», muestra el aviso y navega a `/admin/proyectos/:id` con `state: { draftStatus }`.
  3. Al abrirse `Panel.tsx`, `draftMissing` (`Panel.tsx:103`) evalúa `missingFor(draft)` y devuelve `[]` (vacío). El `useEffect` (`Panel.tsx:105-110`) asume que ya se completaron los campos requeridos y lanza inmediatamente `onPatch(p.id, { status_id: draft.id })`, que el servidor rechaza con `422 Unprocessable Entity` («Para pasar a "Programado" indica la fecha de fin o los días estimados.»). Lo mismo sucede si el usuario pulsa directamente la pastilla «Programado» o «En obra» dentro del propio panel (`Panel.tsx:117`).
- **Corrección sugerida:** Añadir la condición faltante en `missingFor` (`src/admin/proyectos/Panel.tsx:96-101`):
  ```ts
  function missingFor(s: Status): string[] {
    const need: string[] = [];
    if (s.requires_schedule && !p.start_date) need.push("la fecha de inicio");
    if (s.requires_schedule && !p.team_id) need.push("el equipo");
    if (s.requires_schedule && !p.end_date && !p.estimated_days) {
      need.push("el fin previsto o los días estimados");
    }
    if (s.requires_pause_reason && !p.pause_reason.trim()) need.push("el motivo de la pausa");
    return need;
  }
  ```

---

#### M-02 — La importación `.xlsx` confía en el tamaño descomprimido declarado en la cabecera ZIP y carece de límite de tasa propio

- **Archivo y línea:** `server/xlsx.ts:144-156` (`guardZip`), `server/xlsx.ts:166` y `server/routes/projects.ts:116` (en relación con `server/index.ts:64` y `compose.yaml:41`).
- **Requisitos afectados:** `XLS-01`, `NF-01`.
- **Descripción:** `guardZip` (`server/xlsx.ts:144-156`) lee el archivo con `JSZip.loadAsync(buffer)` y suma `(file as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize` del directorio central del ZIP para aplicar el tope de `25 MB`. En el formato ZIP, `uncompressedSize` es un metadato declarado por quien genera el archivo; si un ZIP malicioso declara `0` o un valor pequeño en la cabecera pero contiene flujos DEFLATE grandes, `guardZip` lo aprueba y a continuación `wb.xlsx.load(buffer)` (`server/xlsx.ts:166`) descomprime los flujos completos en memoria. Además, `POST /api/projects/import` comparte el límite general de `/api` (`600` peticiones por minuto en `server/index.ts:64`), sin un limitador específico para una operación que parsea XML pesados y ejecuta miles de `INSERT`/`UPDATE` en una transacción.
- **Escenario concreto de fallo:** Si una sesión con rol `admin` u `office` es utilizada para enviar varias peticiones concurrentes a `POST /api/projects/import` con archivos `.xlsx` de hasta 5 MB (o un único `.xlsx` con `uncompressedSize` falsificado en la cabecera ZIP), el proceso Node supera rápidamente el límite de memoria del contenedor (`mem_limit: 768m` en `compose.yaml:41`) y el kernel termina `planner-api` por `OOMKilled`, dejando sin servicio tanto la administración como el mural de TV.
- **Corrección sugerida:**
  1. Añadir un `rateLimit` específico en `POST /api/projects/import` (por ejemplo, máximo 15 importaciones cada 5 minutos por IP/sesión).
  2. En `guardZip` (`server/xlsx.ts:144`), verificar el tamaño real descomprimido leyendo los flujos de las entradas con un contador de bytes acumulado que aborte en cuanto supere `MAX_UNCOMPRESSED_BYTES` (25 MB), en lugar de confiar únicamente en `_data.uncompressedSize`.

---

### Severidad Baja

#### B-01 — La vista móvil oculta el botón de llamada comparando por nombre (`m.name === lead?.name`) en vez de por identificador

- **Archivo y línea:** `src/movil/Detalle.tsx:161`, `shared/contracts/movil.ts:11-16` y `shared/movil-model.ts:227-232`.
- **Requisitos afectados:** `MOV-05`, `MOV-08`.
- **Descripción:** En el detalle móvil (`src/movil/Detalle.tsx:161`), para evitar duplicar el botón «Llamar» del encargado (que ya aparece arriba en la tarjeta «Responsables»), se anula el teléfono del miembro del equipo cuando su nombre coincide con el del encargado (`person={m.name === lead?.name ? { ...m, phone: null } : m}`). Esto ocurre porque `MovilContact` (`shared/contracts/movil.ts:11`) no incluye el `id` del empleado.
- **Escenario concreto de fallo:** Si en la empresa hay dos empleados activos con el mismo nombre y apellido (`EQP-01` no restringe nombres duplicados en `migrations/001_init.sql:55`) y uno es el encargado mientras el otro es técnico del mismo equipo, el técnico pierde su botón de llamada en la sección «Equipo asignado».
- **Corrección sugerida:** Incluir `id: string` en `MovilContact` (`shared/contracts/movil.ts:11` y `shared/movil-model.ts:227`) o bien comparar directamente `m.is_lead` (`person={m.is_lead ? { ...m, phone: null } : m}`) en `src/movil/Detalle.tsx:161`, ya que `member_contacts` ya marca con `is_lead: true` únicamente al `lead_employee_id` (`shared/movil-model.ts:230`).

---

#### B-02 — El temporizador de cambio de día en `AuthProvider` usa la hora local del navegador en vez de `America/Santo_Domingo`

- **Archivo y línea:** `src/ui/auth.tsx:37-44` (en contraste con `src/mural/index.tsx:48-53`).
- **Requisitos afectados:** `ALC-04`, `CAL-01`.
- **Descripción:** `ALC-04` establece que todas las fechas operan en la zona horaria `America/Santo_Domingo`. El mural (`src/mural/index.tsx:48-53`) calcula los milisegundos hasta la medianoche de Santo Domingo mediante `Intl.DateTimeFormat("en-US", { timeZone: TZ, ... })`. En cambio, `AuthProvider` (`src/ui/auth.tsx:38-39`) calcula `next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5)` usando el reloj y la zona horaria local del dispositivo.
- **Escenario concreto de fallo:** Si un usuario de administración o un teléfono tiene el sistema operativo en otra zona horaria (por ejemplo, `America/New_York` durante el horario de invierno UTC-5, o un navegador configurado en UTC), `AuthProvider` consulta `/api/auth/me` a la medianoche local del dispositivo en lugar de a las `00:00:05` de Santo Domingo (UTC-4), manteniendo `today` desfasado durante una o varias horas en la vista de administración y móvil.
- **Corrección sugerida:** Extraer `msToMidnight(now?: Date)` a `shared/domain.ts` usando `TZ = "America/Santo_Domingo"` y reutilizar esa misma función tanto en `src/mural/index.tsx` como en `src/ui/auth.tsx`.

---

#### B-03 — `countWorkdays` y `dayOf` devuelven `0` cuando un proyecto tiene inicio y fin el mismo domingo (`Día 0 de 0` / `0 días`)

- **Archivo y línea:** `shared/domain.ts:95-100` (`countWorkdays`), `shared/domain.ts:112-119` (`dayOf`) y `shared/movil-model.ts:204-205`.
- **Requisitos afectados:** `CAL-02`, `CAL-09`, `MUR-03`, `MOV-04`.
- **Descripción:** `countWorkdays(a, b)` calcula `workdayIndex(b, base) - workdayIndex(a, base) + (isWorkday(a) ? 1 : 0)`. Si `a === b` y esa fecha cae en domingo (`isWorkday(a) === false`), `countWorkdays(a, b)` devuelve `0`. Aunque `validateProject` (`shared/domain.ts:397-402`) impide guardar domingos en proyectos nuevos o editados, los proyectos importados por `.xlsx` (`server/xlsx.ts:311-319`) o existentes con una fecha en domingo que tengan 1 solo día (`start === end`, o sin `end_date` ni `estimated_days`) producen `total = 0` y `day = Math.min(0, 1) = 0` en `dayOf`.
- **Escenario concreto de fallo:** Un proyecto importado desde Excel en estado «En obra» cuya fecha de inicio sea un domingo y tenga `1` día estimado (o inicio y fin el mismo domingo) muestra `Día 0 de 0` en la tarjeta de «En obra» del mural (`shared/mural-model.ts:154`) y `0 días` / `Día 0 de 0` en la vista móvil (`shared/movil-model.ts:192, 204`).
- **Corrección sugerida:** Garantizar un mínimo de `1` en `dayOf` (`const total = Math.max(1, countWorkdays(start, end))` y `const day = Math.min(total, Math.max(1, countWorkdays(start, clamped)))`) o rechazar fechas en domingo durante la validación de filas de importación en `server/xlsx.ts`. Añadir además un caso de prueba en `tests/domain.test.ts`.

---

#### B-04 — Crear un equipo nuevo con integrantes desde `TeamDialog` realiza dos peticiones seguidas (`POST` + `PATCH`) sin atomicidad

- **Archivo y línea:** `src/admin/equipo/EquiposTab.tsx:136-139` y `server/routes/teams.ts:69-94`.
- **Requisitos afectados:** `EQP-03`, `EQP-04`.
- **Descripción:** `POST /api/teams` (`server/routes/teams.ts:69-73`) solo recibe `{ code, name, lead_employee_id }` y no acepta `member_ids`. Por ello, cuando el usuario crea un equipo nuevo y marca técnicos integrantes en el modal, `TeamDialog.submit` (`src/admin/equipo/EquiposTab.tsx:136-139`) ejecuta primero `POST /api/teams` y, si hay integrantes seleccionados, lanza una segunda petición `PATCH /api/teams/:id` con `{ version: created.version, member_ids: members }`.
- **Escenario concreto de fallo:** Si `POST /api/teams` tiene éxito pero la petición `PATCH /api/teams/:id` falla por un corte momentáneo de red o por validación, el modal entra en el `catch`, muestra el error y permanece abierto con `team = null`. Cuando el usuario vuelve a pulsar «Guardar», el cliente intenta de nuevo `POST /api/teams` y recibe `409 Conflict` («Ya existe el equipo E4.»), quedando el equipo creado sin sus integrantes.
- **Corrección sugerida:** Permitir `member_ids?: string[]` opcional en `POST /api/teams` (`server/routes/teams.ts:69`) para insertar el equipo y sus miembros dentro de la misma transacción `withTx` (reutilizando `checkTeamMembers`).

---

## Aspectos revisados sin problemas encontrados

Se verificaron contra el código actual todos los puntos del alcance y las correcciones de auditorías previas (`seguridad-v0.1`, `calidad-v0.1`, `confirmacion-v0.2`, `dependencias-2026-11`, `F0-F2`, `v03-base`, `v03-confirmacion`, `v03-ui`, `v04-rotacion`):

1. **Autenticación y contraseñas (`AUTH-01`, `AUTH-05`, `USR-04`):**
   - `server/auth.ts:18-48`: Hash Argon2id (`memoryCost: 19456`, `timeCost: 2`, `parallelism: 1`) y mitigación de enumeración por tiempos mediante verificación contra `DUMMY_HASH` cuando el correo no existe o el usuario está inactivo (`server/routes/auth.ts:44-51`).
   - Al desactivar un usuario o cambiar su contraseña (`server/routes/users.ts:91-93`, `server/routes/auth.ts:118`), se eliminan sus sesiones activas en la misma transacción.
2. **Sesiones, cookies y protección CSRF (`AUTH-01`, `AUTH-04`):**
   - `server/auth.ts:50-73`: Tokens de sesión de 32 bytes aleatorios (`crypto.randomBytes(32)`) almacenados en base de datos únicamente como `SHA-256` (`token_hash`). Cookie `HttpOnly`, `SameSite=Lax`, `Secure` en producción y renovación deslizante pasados 15 días.
   - `server/auth.ts:163-179` (`csrfGuard`): Rechaza cualquier método mutante (`POST`, `PUT`, `PATCH`, `DELETE`) si no incluye la cabecera `X-Planner: 1` y valida que `Origin` coincida con `Host`.
3. **Enlaces de acceso / enlaces mágicos (`AUTH-02`, `AUTH-03`, `AUTH-04`):**
   - `server/routes/links.ts:53-98`: Tokens de 32 bytes (`base64url`) almacenados solo como `SHA-256` en `access_links.token_hash`, con cifrado AES-256-GCM opcional (`server/link-cipher.ts`) para recuperar la URL en administración.
   - `server/auth.ts:104-129`: La revocación (`revoked_at`) e inactividad del empleado vinculado (`emp.active === false`) invalidan el acceso en el acto.
   - `src/main.tsx:58-70`: Al entrar con `?k=`, el cliente canjea el token por cookie mediante `POST /api/auth/link` y limpia inmediatamente el parámetro `?k=` de la URL con `window.history.replaceState` para no exponerlo en el historial ni en capturas.
4. **Autorización por rol y aislamiento de datos sensibles (`AUTH-03`, `ALC-02`):**
   - `server/routes/mural.ts:20-58` y `shared/contracts/mural.ts`: El endpoint `/api/mural` nunca expone teléfonos, correos, notas internas ni datos financieros; las vistas `viewer` de mural están bloqueadas en `/api/projects` (`server/routes/projects.ts:54-56`).
   - `server/routes/movil.ts:54-58`: Un enlace `viewer` sin `employee_id` recibe `403` en `/api/movil`.
5. **Server-Sent Events (`MUR-12`, `NF-02`):**
   - `server/sse.ts`: Límite de `MAX_CLIENTS = 64` conexiones simultáneas, `X-Accel-Buffering: no`, latido (`: ping`) cada 25 segundos, limpieza en `req.on("close")` y envío exclusivo de señales `{ type, at }` sin filtrar datos privados en el canal SSE.
6. **Subida de logos e imágenes (`IDENT-01`, `IDENT-02`):**
   - `server/routes/settings.ts:14-18, 69-107`: Solo admite `image/png`, `image/jpeg` y `image/webp` verificando los *magic bytes* reales del archivo (`validateImageMagic`), sin soporte para SVG, con límite de 2 MB en Multer, nombres fijos por ranura (`company.*`, `group.*`) y `Cache-Control: no-cache` al servirlos (`server/index.ts:83`).
7. **Cabeceras de seguridad, CSP y proxy inverso (`NF-01`, `NF-04`):**
   - `server/index.ts:36-50` y `Caddyfile:4-11`: Helmet con CSP estricta (`default-src 'self'`, `script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` y `Permissions-Policy`.
8. **Consultas SQL e integridad transaccional:**
   - Todas las consultas en `server/routes/*.ts` y `server/auth.ts` usan parámetros posicionales (`$1`, `$2`, …) con `pg`, sin interpolación de cadenas de usuario.
   - El control de concurrencia optimista (`version` + `409 Conflict`), el bloqueo `FOR UPDATE` al eliminar estados (`server/routes/statuses.ts:132`) y los índices únicos parciales en PostgreSQL (`migrations/001_init.sql` y `002_Allow_Multi_Team.sql`) previenen condiciones de carrera.
9. **Reglas de dominio y rotación del mural (`shared/domain.ts`, `shared/mural-model.ts`, `src/mural/index.tsx`):**
   - El calendario laboral L–S (`CAL-01` a `CAL-10`), la prioridad del encargado en equipos múltiples (`EQP-06`, `MOV-02`), el cálculo de atraso, la histéresis de densidad (`pickDensity`) y la rotación paginada con pausa al interactuar (`MUR-06`, `MUR-07`) cumplen fielmente `docs/REQUISITOS.md`.
