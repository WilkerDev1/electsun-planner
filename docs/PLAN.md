# Electsun Planner — plan de implementación (V4 · Simple)

## Avance

| Fase | Estado | Notas |
|---|---|---|
| F0 · Base | hecha | Requisitos, esquema, dominio, contratos, auth y SSE portados de Monitor, demo ficticia, Docker y CI |
| F1 · Gestión (A Cuentas, B Proyectos, C Equipo) | hecha | 3 subagentes Sonnet en paralelo, integrados en `main` |
| F2 · Murales (D Mural TV, E Móvil) | hecha | 2 subagentes Sonnet en paralelo, integrados en `main` |
| F3 · Integración y calidad | hecha | Revisión con subagente Haiku (agy sin cuota/bloqueado), correcciones, E2E Playwright, verificación visual, etiqueta `v0.1-demo` |
| F4 · Despliegue | solo con confirmación | |


## Context

El lienzo de Claude Design ((privado), página "Versión 4 · Simple") ya define toda la interfaz:
- **Web de administración:** Proyectos (tabla y panel de edición), Equipo (Empleados, Equipos de obra, Empresas) y Configuración del mural.
- **Mural para TV:** principal (claro) y timeline.
- **Mural móvil para técnicos:** Hoy, Obras, Calendario (agenda y línea de tiempo) y Detalle de obra.

El usuario quiere dos cosas:
1. Un **documento de requisitos detallado** que conecte esas pantallas con todos los sistemas que necesitan: cuentas, permisos, datos, cálculos, mural y móvil, de forma coherente entre sí.
2. Un **plan de implementación por fases** y su ejecución:
   - Varias fases se trabajan en paralelo con subagentes Sonnet 5.5 en esfuerzo alto.
   - El código vive en un repo git local y en uno público de GitHub.
   - Las revisiones de código se hacen con `agy`.

Decisiones ya tomadas:
- **Stack:** el de Electsun Monitor, sin mapas ni PostGIS. La versión móvil es una PWA, no React Native.
- **Repo público con datos ficticios.** El Excel real nunca se sube a GitHub.
- **Alcance:** demo local completa. El despliegue en el servidor de producción, que reemplaza a Monitor, queda como fase final y solo se ejecuta con confirmación.

### Lo que se suma a partir de los audios del jefe

Las dos notas de voz del 28 oct se transcribieron con Gemini en Vertex AI. Describen el ciclo completo: venta, permisos, preparación, programación, obra, cierre y postventa. Del modo simple entran solo estos tres puntos, porque mejoran lo que muestra el mural:

1. **Preparación y tipo de sistema.**
   - Campo `tipo_sistema`: medición neta o híbrido.
   - Tres marcas en cada proyecto:
     - planos y BOM listos;
     - materiales completos;
     - carta de no objeción de la EDE, que se pide solo si el sistema es de medición neta.
   - Lo que falte se muestra como el motivo de espera ("espera material", "espera EDE") en la tabla, en "Por programar" del mural y en el móvil.
   - Pasar a "Programado" con marcas pendientes **avisa**, pero no bloquea.
2. **Duración estimada y atraso.**
   - El encargado pone `dias_estimados` (días laborables).
   - El fin previsto se calcula a partir del inicio.
   - Si una obra "En obra" pasa su fin previsto sin estar terminada, se marca **"Atrasada · +N días"** en la tabla, el mural y el móvil.
   - Al terminar se guarda `fin_real`, para comparar lo previsto con lo real.
3. **Esperando medidor.**
   - Es un estado nuevo en la lista por defecto: "Esperando medidor", de tipo `post_obra`, que va después de Terminado.
   - Se usa en los sistemas de inyección que esperan el contador bidireccional.
   - El mural lo muestra en una lista pequeña. No cuenta como obra activa ni ocupa al equipo.

Queda fuera, con su mención en "Fuera de la v1": comisionamiento, carpeta de documentos y fotos, almacén y compras, rentabilidad, y postventa (mantenimiento, incentivo fiscal y garantía).

Herramientas verificadas:
- `gh` tiene sesión como **WilkerDev1** (protocolo SSH, permiso `repo`).
- `agy` acepta `-p`, `--model`, `--mode plan` y `--add-dir`. Sus modelos incluyen `claude-sonnet-5-5-medium` y `claude-sonnet-5-5-low`.
- Están instalados Docker y Node 26 (las imágenes usarán Node 24, como Monitor).

## Entregables

1. **Repo local** en `la carpeta del proyecto` (con `git init`, conservando `BRIEF.md` y `design/`) y **repo público** `WilkerDev1/electsun-planner`.
2. **`docs/REQUISITOS.md`**: el documento de requisitos detallado, con la estructura de abajo.
3. **`docs/PLAN.md`**: este plan, actualizado con el avance de cada fase.
4. **La app funcionando en local** con `bash ops/local.sh`: web de administración, mural de TV y PWA móvil, con datos ficticios.
5. **`docs/revisiones/`**: la salida de cada revisión de `agy`.

## Estructura de `docs/REQUISITOS.md`

Cada requisito lleva un ID (`PRY-03`, `MUR-07`…). La sección 9 relaciona pantalla → requisito → endpoint, para que todo sea coherente.

1. **Alcance y principios.** "El Excel, pero cómodo". La oficina carga, el jefe prioriza, el mural solo muestra. Lista de lo que queda fuera de la v1, tomada del brief.

2. **Actores, cuentas y permisos.** Se separa el **rol de acceso** del **nivel del empleado**:
   - **Administrador (jefe):** todo, más fijar la prioridad, gestionar cuentas y configurar el mural.
   - **Oficina:** proyectos, estados, fechas, equipos, avisos y catálogos. No puede fijar la prioridad ni gestionar cuentas.
   - **Empleado con acceso móvil:** técnico, encargado, supervisor o ayudante. Solo lectura, mediante un enlace personal.
   - **Pantalla TV:** enlace de dispositivo, sin usuario.
   - El nivel del empleado (Supervisor, Encargado, Técnico, Ayudante, Oficina) es un dato del catálogo y no da permisos.
   - Una matriz de permisos por endpoint.

3. **Cuentas y acceso.** Se reutiliza el modelo de Monitor:
   - Invitación por enlace (48 h). Contraseña de 12 caracteres o más, guardada con argon2. Recuperación por enlace (2 h). Sesión por cookie `HttpOnly` y `SameSite`. Límite de intentos. Al desactivar una cuenta se cierran sus sesiones. No hay registro público.
   - **Enlaces personales de móvil y enlaces de TV.** Cada uno tiene un token con hash y se puede crear, activar, rotar o revocar. Al canjearlo se crea una cookie de dispositivo (30 días para la TV y 90 para el móvil). Se registra la última conexión. Se muestra un código QR para el móvil.

4. **Módulos funcionales:**
   - **Proyectos (PRY).**
     - Campos del Excel más: prioridad, mostrar la observación en el mural hasta una fecha, parte, motivo de pausa y archivado.
     - También, según los audios: tipo de sistema, marcas de preparación (planos y BOM, materiales, carta EDE si es medición neta), días estimados, fin previsto calculado y fin real.
     - Tabla con edición en la celda, filtros por estado con contador, búsqueda, fila nueva, panel de edición que guarda solo, historial y vista previa en el calendario.
   - **Estados (EST).**
     - Lista editable. Trae 6 estados por defecto, cada uno con un *tipo* fijo (`por_programar`, `programado`, `en_obra`, `en_pausa`, `terminado`, `post_obra`), y la lógica depende del tipo. El sexto es "Esperando medidor", de tipo `post_obra`.
     - Cada estado tiene orden, color y reglas: si requiere fecha y equipo, y si requiere motivo.
   - **Validaciones (VAL).**
     - "Programado" exige inicio y equipo. "En pausa" exige motivo.
     - Error si el fin es anterior al inicio.
     - Aviso si el inicio es anterior a la venta.
     - "NA" y "N/A" se guardan como sin fecha.
     - Choque de equipo: el mismo equipo en otro proyecto no terminado con fechas que se solapan.
     - Aviso, sin bloquear, si se programa un proyecto con la preparación incompleta.
     - Atraso: "En obra" con hoy pasado el fin previsto.
   - **Importar y exportar Excel (XLS).**
     - La importación tiene un paso de vista previa con un informe de filas y errores, y normaliza los datos.
     - La exportación usa las mismas columnas.
   - **Equipo (EQP).**
     - Empleados: nivel, oficio, equipo, estado (Activo, Vacaciones o De baja), teléfono y acceso móvil.
     - Equipos de obra: código E1…, nombre, encargado e integrantes, que se asignan desde Empleados.
     - Empresas: nombre, sigla de 2 letras y color. Avisa si el color choca con el naranja de la marca, que está reservado.
   - **Avisos (AVI).** Observaciones de proyecto con fecha "visible hasta" y avisos generales con fecha de caducidad.
   - **Mural TV (MUR).**
     - Dos diseños: el principal y el timeline. Pantalla de 1920×1080. Semana de lunes a sábado. Línea de hoy.
     - Configuración: semanas visibles (2, 3 o 4), orden de los próximos e interruptores (Por programar, Observaciones, Bandera de prioridad, Reloj, kWp).
     - Indicadores: En obra, Próximos, Por programar más En pausa, y Terminados del mes.
     - Actualización por SSE, con consulta cada 60 s como respaldo. Si se pierde la conexión, sigue mostrando los últimos datos con la hora en que se obtuvieron.
   - **Móvil (MOV).**
     - PWA instalable con las pantallas Hoy, Obras, Calendario (agenda y línea de tiempo de 3 semanas) y Detalle.
     - Muestra "tu equipo", enlaces `tel:` y de mapas, caché sin conexión y es solo lectura.
   - **Historial (HIS).** Cada escritura registra quién cambió qué, con los valores de antes y después.

5. **Reglas de cálculo compartidas (CAL).** Viven en una sola función del paquete `shared/`, que usan el servidor, el mural y el móvil:
   - Índice de día laborable (lunes a sábado, sin domingos) y "hoy" en la zona `America/Santo_Domingo`.
   - "Día X de N", "Inicia en N días" y "termina mañana".
   - Colocación de las barras: recorte cuando la barra empieza antes o termina después del rango visible, y etiqueta dentro de la barra o al lado.
   - Detección de choques de equipo.
   - Fin previsto, que es el inicio más los días estimados en días laborables.
   - Días de atraso y motivo de espera, derivado de la preparación.

6. **Modelo de datos.** Tablas: `users`, `sessions`, `invitations`, `employees`, `teams`, `companies`, `statuses`, `projects`, `notices`, `mural_settings`, `access_links` (TV y móvil), `device_sessions` y `audit`. Las fechas de obra son de tipo `date`.

7. **API.** Recursos REST bajo `/api`:
   - `auth`, `accounts`, `projects`, `statuses`, `employees`, `teams`, `companies`, `notices`, `mural/settings` y `access-links`.
   - De solo lectura: `/api/view/mural` y `/api/view/movil`.
   - `/api/events` (SSE).
   - Todas las peticiones y respuestas se validan con esquemas `zod` en `shared/contracts`.

8. **Requisitos no funcionales:**
   - Seguridad: `helmet`, comprobación de origen en escrituras, límite de intentos y ningún secreto en git.
   - Accesibilidad: contraste AA y áreas táctiles de 44 px o más.
   - Legibilidad del mural a 3–4 m.
   - Rendimiento: menos de 300 ms en las lecturas del mural.
   - Backups (`ops/backup.sh` con timer) y salud del servicio (`/readyz`).
   - Pruebas: unitarias, de integración y E2E.

9. **Matriz de coherencia.** Cada pantalla y control del lienzo enlazado a su requisito y su endpoint.

## Arquitectura del repo

```
shared/      domain.ts (calendario laborable, cálculos, validaciones) · contracts/*.ts (zod) · seed-demo.ts (ficticio)
server/      index.ts, db.ts (migrate), auth.ts, events.ts (SSE), routes/<módulo>.ts
src/         admin/ (Proyectos, Equipo, Mural, Cuentas, Login) · mural/ (TV) · movil/ (PWA) · ui/ (componentes y tokens)
migrations/  001_base.sql (esquema completo, escrito en la F0)
ops/         local.sh, backup.sh, verify-restore.sh, seed.ts
design/v4/   artboards actuales descargados del lienzo (referencia visual para los agentes)
docs/        REQUISITOS.md, PLAN.md, revisiones/
```

**Dependencias:**
- Frontend: React 19, Vite, Tailwind 4, react-router, `vite-plugin-pwa`.
- Servidor: Express 5, pg, zod, argon2, helmet, express-rate-limit, exceljs.
- Pruebas: Playwright y `node:test` con `tsx`.
- Infraestructura: Docker Compose con `postgres:16`, la API y Caddy.

**Se reutiliza de Electsun Monitor** (el repo de Monitor), copiado y adaptado:
- De `server/auth.ts`: `hash`, `token`, `passwordHash`, `cookieOptions`, `issueSession`, `loadUser` y los middlewares de rol.
- `server/accounts.ts`: inicio de sesión, invitación y recuperación con límite de intentos.
- `server/boards.ts`: el flujo de activación, token y sesión de pantalla. Pasa a ser `access_links` para la TV y el móvil.
- De `server/db.ts`: `migrate()` con checksum y bloqueo, y `transaction()`.
- `server/index.ts`: configuración de `helmet` y de límite de intentos, `/readyz` y el patrón SSE.
- Infraestructura: `Dockerfile`, `compose.yaml`, `Caddyfile` (`flush_interval -1`), `ops/local.sh`, `ops/backup.sh` y `ops/verify-restore.sh`.

**Sistema visual:** los tokens del brief (sección "Sistema visual") se convierten en el tema de Tailwind. Las pantallas reproducen los artboards de `design/v4`.

## Fases

Cada subagente es un `Agent` con `model: "sonnet"`, `effort: "high"` e `isolation: "worktree"`. Trabaja en una rama `feat/<fase>` y recibe:
- `docs/REQUISITOS.md`.
- Los IDs de requisitos que le tocan.
- Los artboards de referencia.
- La regla de tocar solo sus carpetas.

Las piezas compartidas (esquema, contratos, `shared/domain.ts`, rutas de la app y tema) quedan cerradas en la F0. Así los agentes que trabajan en paralelo no editan los mismos archivos.

### F0 · Base (yo, en secuencia)

1. Crear el repo:
   - `git init` en la carpeta actual, con `.gitignore` que excluye `.env`, `*.xlsx` y los datos reales.
   - `gh repo create WilkerDev1/electsun-planner --public`.
   - Rama `main`.
   - CI en GitHub Actions: `typecheck` y `test`.
2. **Actualizar el diseño en el lienzo** con los tres puntos de los audios, antes de programar:
   - **V4Proyectos:**
     - Tabla: columnas "Tipo" y "Preparación", esta última con 3 íconos de marca.
     - Etiqueta "Atrasada · +N".
     - Panel de edición: tipo de sistema, marcas de preparación y días estimados con el fin previsto.
     - Estado "Esperando medidor".
   - **V4MuralPrincipal:**
     - Motivos de espera en "Por programar".
     - Etiqueta "Atrasada".
     - Lista de "Esperando medidor".
   - **V4Movil:** motivo de espera y atraso en Obras y Detalle.

   Después, descargar los artboards vigentes a `design/v4/`: V4Proyectos, V4EquipoTablas, V4MuralPrincipal, V4Mural, V4Movil, V4Config y V4Dock.
3. Escribir `docs/REQUISITOS.md` completo y `docs/PLAN.md`.
4. Esqueleto:
   - Vite y Express.
   - `001_base.sql` con todo el esquema.
   - `shared/domain.ts` con sus pruebas unitarias, cubriendo los casos ya verificados (Colegio Arcoíris es el día 8 de 11, Taller Motormax el 8 de 17 y Granja Los Pinos va atrasada +1 día).
   - `shared/contracts`.
   - Shell de rutas (`/`, `/proyectos`, `/equipo`, `/mural`, `/cuentas`, `/tv/:id`, `/m/*`), el dock y el tema.
   - Autenticación base portada de Monitor.
   - Seed ficticio.
   - `ops/local.sh`.
5. Revisión con `agy`, nivel **medio**: arquitectura, esquema, contratos y seguridad de la autenticación. Corregir lo encontrado, hacer commit y push.

### F1 · Gestión (3 subagentes en paralelo)

- **A. Cuentas y acceso** (AUT, ACC):
  - Invitaciones, recuperación y gestión de cuentas (solo administrador).
  - Enlaces de TV y de móvil (crear, rotar, revocar, QR) y sesiones de dispositivo.
  - Pantallas de Login, Activar y Cuentas.
- **B. Proyectos** (PRY, EST, VAL, XLS, HIS):
  - Rutas y validaciones del servidor, historial e importación y exportación de Excel.
  - Tabla y panel de edición, según V4Proyectos.
- **C. Equipo** (EQP):
  - Empleados, equipos de obra y empresas, en servidor y UI, según V4EquipoTablas.
  - Asignar integrantes y avisar de choques de color.

Cada rama se integra en `main` así:
1. Revisión con `agy`, nivel **medio**.
2. Correcciones, cada una verificada con `agy` en nivel **bajo**.
3. PR en GitHub y merge.

### F2 · Murales (2 subagentes en paralelo)

- **D. Mural TV y configuración** (MUR, AVI):
  - `/api/view/mural` y el bus SSE `server/events.ts`. Cada escritura de F1 emite un evento.
  - Pantallas TV principal y timeline, según V4MuralPrincipal y V4Mural.
  - Configuración con vista previa en vivo, según V4Config.
  - Avisos generales.
- **E. Móvil PWA** (MOV):
  - `/api/view/movil`, filtrado por el empleado del enlace.
  - Pantallas Hoy, Obras, Calendario (agenda y línea de tiempo) y Detalle, según V4Movil.
  - Manifest, service worker y caché sin conexión.

Mientras D termina el SSE, E trabaja contra el contrato con datos del seed. Las dos ramas se integran con el mismo ciclo que en la F1.

### F3 · Integración y calidad (yo)

- **E2E con Playwright:** la oficina edita un proyecto, la TV se actualiza por SSE y el móvil del técnico refleja el cambio.
- **Revocación:** un enlace revocado deja de funcionar.
- **Importación:** un Excel de prueba se importa con vista previa.
- **Revisiones finales:**
  - Accesibilidad: contraste y teclado.
  - Rendimiento.
  - Verificación visual del mural a 1920×1080 y del móvil a 390×844, comparada con los artboards.
- **Revisión con `agy`, nivel medio**, sobre todo el repo. Después: actualizar el README y `docs/PLAN.md`, crear la etiqueta `v0.1-demo` y hacer push.

### F4 · Despliegue (fuera de esta ejecución; solo con confirmación)

1. Backup final de Monitor con su `ops/backup.sh`.
2. Ensayar la restauración.
3. Copiar el código a `/opt/electsun-planner` en el servidor de producción y levantar con Compose en `127.0.0.1:8091`.
4. Cambiar la ruta del túnel de Cloudflare.
5. Detener Monitor con `docker compose down`, sin `-v`.
6. Importar el Excel real solo en el servidor.

## Protocolo de revisión

Nota de ejecución: `agy -p` tardaba ~4,5 min en arrancar y agotó la cuota de Sonnet, así que las revisiones de F0–F2 se hicieron con un subagente Claude Haiku 5.5 (esfuerzo medio) en solo lectura: `docs/revisiones/F0-F2.md` y su confirmación. El protocolo original con `agy` queda abajo para fases futuras.

### Original con `agy`

Desde la raíz del repo o del worktree, en modo solo lectura:

```
agy -p "<instrucción de revisión con IDs de requisitos y diff de la rama>" --model claude-sonnet-5-5-medium --mode plan --output-format text > docs/revisiones/<fase>.md
```

- **Nivel medio (`claude-sonnet-5-5-medium`):** cierre de cada fase o rama, y cualquier cambio en autenticación, permisos, migraciones, SSE o importación de Excel.
- **Nivel bajo (`claude-sonnet-5-5-low`):** correcciones puntuales, cambios de UI acotados y documentación.
- Corrijo los hallazgos o los descarto con una razón escrita. Antes del merge, `agy` confirma en nivel bajo que quedaron resueltos.

## Verificación

- `npm run typecheck` y `npm test`: unitarias de `shared/domain.ts` e integración de la API contra `planner_test`, con la protección de bases de datos de Monitor.
- `bash ops/local.sh` levanta la app en http://localhost:8091. Allí se comprueba:
  - Inicio de sesión como administrador y como oficina; la prioridad solo la puede cambiar el administrador.
  - Crear y editar proyectos, y las validaciones.
  - Importar y exportar Excel.
  - Equipo y empresas.
  - Activar un enlace de TV y abrir `/tv/:id`.
  - Activar el enlace móvil de un técnico y abrir `/m` a 390×844.
- `npx playwright test`: los flujos E2E de la F3.
- La CI de GitHub en verde en `main`. El repo público no contiene `.env` ni datos reales (comprobado con `git grep` y con el escaneo de secretos de GitHub).
