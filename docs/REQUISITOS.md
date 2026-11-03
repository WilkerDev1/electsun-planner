# Electsun Planner · Requisitos (V4 · Simple)

Versión 1.0 · 2 nov 2026 · Fuente visual: `design/v4/*.dc.html` (lienzo "Electsun · Murales TV", página v4).

Cada requisito lleva un ID estable (`PRY-03`). Los subagentes, las revisiones y las pruebas lo citan.
Prioridad: **[M]** obligatorio para la demo v0.1, **[D]** deseable si cabe en la fase.

---

## 1. Alcance y principios

**ALC-01 [M]** El producto es "el Excel, pero cómodo": una tabla de proyectos solares, un mural de TV y una vista móvil de solo lectura para técnicos.

**ALC-02 [M]** La oficina carga y actualiza. El jefe (Administrador) decide la prioridad. El mural y el móvil solo muestran.

**ALC-03 [M]** Regla de inclusión: una función entra si mejora lo que se ve en la TV o en el móvil, o si hace más rápido actualizarlo.

**ALC-04 [M]** Idioma único español (República Dominicana). Zona horaria `America/Santo_Domingo`. Semana laborable de lunes a sábado.

**ALC-05 [M]** El repo público solo contiene datos ficticios. El Excel real se importa en el servidor y nunca entra en git.

### Fuera de la v1

Comisionamiento, carpeta de documentos y fotos, almacén y compras, rentabilidad, postventa (mantenimiento, incentivo fiscal, garantía), tareas, notas auditables, ciclo de 9 etapas, kanban, gestión de clientes, dashboard, rotación de pantallas, WhatsApp, multiempresa y modo oscuro.

---

## 2. Actores y permisos

El **rol de acceso** (qué puede hacer una cuenta) es independiente del **nivel del empleado** (Supervisor, Encargado, Técnico, Ayudante, Oficina), que es solo un dato del catálogo.

| Actor | Cómo entra | Puede |
|---|---|---|
| **Administrador** (jefe) | Cuenta con correo y contraseña | Todo lo de Oficina, más fijar la prioridad, gestionar cuentas, crear enlaces de TV y móvil y configurar el mural |
| **Oficina** | Cuenta con correo y contraseña | Proyectos, estados de los proyectos, fechas, equipos, preparación, avisos, catálogos (empleados, equipos, empresas), importar y exportar. La lista de estados (EST-04) solo la edita el administrador |
| **Empleado móvil** | Enlace personal (`/m/activar#token`) | Ver `/m`: sus obras, su equipo, calendario. Solo lectura |
| **Pantalla TV** | Enlace de dispositivo (`/tv/:id#token`) | Ver `/tv/:id`. Solo lectura |

**ROL-01 [M]** Roles de cuenta: `admin` y `office`. No hay registro público; la primera cuenta `admin` se crea con `BOOTSTRAP_*`.

**ROL-02 [M]** Matriz por endpoint (✔ permitido, — denegado con 403):

| Recurso | admin | office | móvil | TV |
|---|---|---|---|---|
| `GET /api/projects`, `statuses`, `employees`, `teams`, `companies`, `notices` | ✔ | ✔ | — | — |
| Escribir proyectos (salvo `priority`), empleados, equipos, empresas, avisos | ✔ | ✔ | — | — |
| Escribir la lista de estados (EST-04) | ✔ | — | — | — |
| `PATCH` de `priority` en un proyecto | ✔ | — | — | — |
| Importar y exportar Excel | ✔ | ✔ | — | — |
| `accounts/*`, `access-links/*`, `PUT mural/settings` | ✔ | — | — | — |
| `GET mural/settings` | ✔ | ✔ | — | — |
| `GET /api/view/mural` | ✔ | ✔ | — | ✔ (cookie TV) |
| `GET /api/view/movil` | — | — | ✔ (cookie móvil) | — |
| `GET /api/events` (SSE) | ✔ | ✔ | ✔ | ✔ |

**ROL-03 [M]** Si una cuenta `office` envía `priority` al crear (`POST`) o editar (`PATCH`), el servidor responde 403 sin aplicar ningún cambio del cuerpo.

---

## 3. Cuentas y acceso

### Cuentas (AUT)

Se porta el modelo de Electsun Monitor (`server/auth.ts`, `server/accounts.ts`).

**AUT-01 [M]** Inicio de sesión con correo y contraseña. Contraseña con argon2id (memoria 19 MiB, t=2). Mensaje genérico "Correo o contraseña incorrectos."

**AUT-02 [M]** Sesión en cookie `planner_session`: `HttpOnly`, `SameSite=Strict`, `Secure` en producción, 12 h. En la base solo se guarda el SHA-256 del token.

**AUT-03 [M]** Invitación: el administrador crea la cuenta (nombre, correo, rol) y recibe un enlace `/activar#token` válido 48 h y de un solo uso. Al aceptarlo, la persona fija su nombre y una contraseña de 12 a 128 caracteres.

**AUT-04 [M]** Recuperación: el administrador genera un enlace de restablecimiento válido 2 h, que invalida los anteriores. No se envían correos en la v1; el enlace se copia y se comparte a mano.

**AUT-05 [M]** Cambio de contraseña propio: pide la contraseña actual y cierra las demás sesiones.

**AUT-06 [M]** Desactivar una cuenta o cambiar su rol cierra todas sus sesiones. Un administrador no puede quitarse su propio rol ni desactivarse.

**AUT-07 [M]** Límite de intentos: 20 por 15 minutos en login, aceptar invitación y cambio de contraseña.

**AUT-08 [M]** Pantalla **Cuentas** (solo admin): lista con nombre, correo, rol, estado (activa, pendiente de activar, desactivada) y acciones (invitar, restablecer, cambiar rol, desactivar).

**AUT-09 [M]** Pantallas **Login** y **Activar** con el sistema visual de V4.

### Enlaces de TV y de móvil (ACC)

Se porta `server/boards.ts` (activación por token con hash) como una tabla genérica `access_links`.

**ACC-01 [M]** Un enlace tiene `kind` (`tv` o `mobile`), nombre, `employee_id` (solo móvil), estado activo, `token_hash` y `last_seen_at`.

**ACC-02 [M]** Crear o **rotar** un enlace genera un token nuevo de 32 bytes, guarda solo su hash, borra las sesiones de dispositivo previas y devuelve la ruta una sola vez:
- TV: `/tv/:id#token`.
- Móvil: `/m/activar#token` (el id viaja en el token compuesto `id.token`).

**ACC-03 [M]** **Revocar** desactiva el enlace y borra sus sesiones de dispositivo. La siguiente petición del dispositivo recibe 403 y la pantalla muestra "Este enlace fue desactivado".

**ACC-04 [M]** Canje: el cliente envía el token con `POST /api/access/session`. El servidor crea una `device_session` y una cookie `HttpOnly`: `planner_tv_<id>` por 30 días o `planner_m` por 90 días. El fragmento `#token` se borra de la barra de direcciones tras el canje.

**ACC-05 [M]** Cada lectura con cookie de dispositivo actualiza `last_seen_at` (como mucho una vez por minuto).

**ACC-06 [M]** El enlace móvil solo se puede crear para un empleado `Activo`. Pasar un empleado a "De baja" revoca su enlace; en "Vacaciones" el enlace sigue funcionando.

**ACC-07 [M]** La UI muestra el enlace con un botón "Copiar" y un **código QR** generado en el cliente. Los enlaces de TV se gestionan en Mural; los de móvil, en la fila del empleado (columna "Acceso móvil").

---

## 4. Módulos funcionales

### 4.1 Proyectos (PRY)

Referencia: `V4Proyectos.dc.html` (tabla y panel con `abierto`).

**PRY-01 [M]** Campos del proyecto:

| Campo | Tipo | Notas |
|---|---|---|
| `company_id` | ref empresas | Obligatorio |
| `name` | texto 1–160 | Cliente o proyecto |
| `kwp` | decimal(8,2) | Opcional |
| `sale_date` | fecha | Fecha de venta |
| `place` | texto | Lugar |
| `lead_employee_id` | ref empleados | Encargado; si está vacío se muestra el encargado del equipo |
| `team_id` | ref equipos | Equipo de obra |
| `start_date` | fecha | Inicio |
| `estimated_days` | entero 1–120 | Días laborables estimados |
| `end_date` | fecha | Fin previsto. Se calcula de inicio + días (CAL-05) y se puede ajustar a mano |
| `actual_end` | fecha | Fin real, se fija al pasar a un estado `terminado` o `post_obra` |
| `status_id` | ref estados | Obligatorio |
| `pause_reason` | texto | Obligatorio si el estado lo exige |
| `notes` | texto ≤ 500 | Observación |
| `show_on_mural` | bool | Mostrar la observación en el mural |
| `mural_until` | fecha | Hasta cuándo se muestra; por defecto +7 días naturales |
| `priority` | bool | Solo admin |
| `part` | texto ≤ 40 | "Parte 1" |
| `system_type` | `neta` \| `hibrido` | Tipo de sistema |
| `prep_plans`, `prep_materials`, `prep_ede` | bool | Preparación. `prep_ede` solo aplica a `neta` |
| `archived` | bool | Oculta el proyecto de todas las vistas |
| `version` | entero | Control de concurrencia optimista |

**PRY-02 [M]** Tabla tipo Excel con columnas: #, prioridad, empresa, proyecto, kWp, tipo, preparación, equipo, inicio, fin previsto, estado, observación, mural. Cabecera fija y primera columna fija; scroll horizontal.

**PRY-03 [M]** Edición en la celda de estado, equipo, inicio, fin, tipo y marcas de preparación. Cada cambio guarda solo (PATCH con `version`) y muestra "Guardado" o el error.

**PRY-04 [M]** Filtros por estado con contador ("Todos" y uno por estado en el orden de la lista), y búsqueda por nombre, lugar o empresa.

**PRY-05 [M]** "Nuevo proyecto" crea una fila con estado `por_programar` y abre el panel.

**PRY-06 [M]** El lápiz abre el **panel de edición**: la tabla se compacta y el panel aparece a la derecha sin cambiar de ruta (`/proyectos/:id`). Secciones: Datos, Preparación, Programación, Estado, Observación y mural, Prioridad, Vista previa del calendario, Historial.

**PRY-07 [M]** Vista previa: una barra en una cuadrícula de 2 semanas (12 días laborables desde el lunes de esta semana) con el mismo cálculo que el mural (CAL-03), o el texto "Sin fecha" / "Fuera de las próximas dos semanas".

**PRY-08 [M]** Los avisos de validación (VAL) aparecen en la celda (borde ámbar con texto en `title`) y en el panel (banner).

**PRY-09 [M]** Etiqueta "Atrasada · +N" en la celda de estado y banner en el panel (CAL-06).

**PRY-10 [M]** Archivar y desarchivar desde el panel (con confirmación). No hay borrado.

**PRY-11 [M]** Si otra persona guardó antes (versión distinta) el servidor responde 409 y la UI recarga la fila y avisa "Otra persona cambió este proyecto".

### 4.2 Estados (EST)

**EST-01 [M]** Los estados son una lista editable con: nombre, tipo fijo, orden, color (sólido, texto, fondo), `requires_schedule` y `requires_reason`.

**EST-02 [M]** Tipos fijos y la lógica que dependen de ellos:

| Tipo | Por defecto | Cuenta como activa | Ocupa al equipo | Mural |
|---|---|---|---|---|
| `por_programar` | Por programar | no | no | "Por programar" con motivo de espera |
| `programado` | Programado | sí | sí | Próximos, "Inicia en N días" |
| `en_obra` | En obra | sí | sí | Activos, "Día X de N" |
| `en_pausa` | En pausa (pide motivo) | no | no | "Por programar" con el motivo |
| `terminado` | Terminado | no | no | Indicador "Terminados del mes" |
| `post_obra` | Esperando medidor | no | no | Lista "Esperando medidor" |

**EST-03 [M]** Colores por defecto: los de la tabla `ST` de V4Proyectos (Por programar `#3F4859/#EFF1F5/#8B95A7`, Programado `#3538CD/#EEF0FE/#6172F3`, En obra `#095C4F/#E0F4EF/#0B7A68`, En pausa `#A11C47/#FDECF1/#D63B6A`, Terminado `#1F2A3D/#E8ECF2/#2B3A55`, Esperando medidor `#155E75/#E3F1F5/#0E7490`).

**EST-04 [D]** Pantalla para renombrar, reordenar y recolorear estados (dentro de Mural · Configuración). No se puede borrar un estado en uso ni dejar un tipo sin estado.

### 4.3 Validaciones (VAL)

Todas viven en `shared/domain.ts` y las usan servidor y cliente.

| ID | Regla | Nivel |
|---|---|---|
| **VAL-01 [M]** | Estado con `requires_schedule` (Programado, En obra) sin inicio o sin equipo | Error en servidor (422); en la UI se permite cambiar el estado solo si se completan los datos |
| **VAL-02 [M]** | Estado con `requires_reason` sin motivo | Error (422) |
| **VAL-03 [M]** | Fin anterior al inicio | Error (422) |
| **VAL-04 [M]** | Inicio anterior a la fecha de venta | Aviso |
| **VAL-05 [M]** | `NA`, `N/A`, `n/a`, `-` y vacío en fechas se guardan como `null` | Normalización |
| **VAL-06 [M]** | Choque de equipo: el mismo equipo en otro proyecto no archivado, de tipo que ocupa al equipo, con rangos `[inicio, fin]` que se solapan | Aviso con el nombre del otro proyecto |
| **VAL-07 [M]** | Programado o En obra con preparación incompleta | Aviso "Programado con preparación pendiente: falta …" |
| **VAL-08 [M]** | En obra con hoy después del fin previsto | Aviso de atraso (CAL-06) |
| **VAL-09 [M]** | `prep_ede` se ignora si `system_type = hibrido` | Normalización |

**VAL-10 [M]** Los avisos nunca bloquean el guardado; los errores sí. La respuesta del servidor incluye `warnings: string[]` con los avisos calculados.

### 4.4 Importar y exportar Excel (XLS)

**XLS-01 [M]** Importar `.xlsx` (máx. 5 MB) con columnas del Excel original: Contratista, Proyecto, kWp, Fecha de venta, Lugar, Encargado, Cuadrilla/Equipo, Inicio, Fin, Estado, Observación. Las cabeceras se reconocen sin importar mayúsculas ni tildes.

**XLS-02 [M]** Paso 1, **vista previa** (`POST /api/projects/import?dry=1`): devuelve filas nuevas, filas que actualizan (coincidencia por empresa + nombre + parte), filas con error (con número de fila y motivo) y avisos. No escribe nada.

**XLS-03 [M]** Paso 2, **aplicar**: escribe en una transacción las filas válidas, registra una entrada de historial por proyecto y devuelve el resumen.

**XLS-04 [M]** Normalización: fechas de Excel (serial o texto `d/m/aaaa`), VAL-05, kWp con coma decimal, estado por nombre sin tildes (desconocido → error de fila), empresa y equipo por nombre o código (desconocido → error de fila).

**XLS-05 [M]** Exportar `GET /api/projects/export` a `.xlsx` con las columnas de XLS-01 más Tipo, Preparación, Días, Fin real, Prioridad y Parte, respetando el filtro activo.

**XLS-06 [M]** El servidor no guarda el archivo subido; lo procesa en memoria.

### 4.5 Equipo (EQP)

Referencia: `V4EquipoTablas.dc.html` (pestañas Empleados, Equipos de obra, Empresas).

**EQP-01 [M]** **Empleados**: nombre, oficio, nivel (`Supervisor`, `Encargado`, `Técnico`, `Ayudante`, `Oficina`), equipo, estado (`Activo`, `Vacaciones`, `De baja`), teléfono y acceso móvil (ninguno, activo, revocado).

**EQP-02 [M]** Tabla de empleados con filtros por nivel, búsqueda, edición en celda de nivel, equipo y estado, y agrupación visual por nivel.

**EQP-03 [M]** **Equipos de obra**: código `E1…E99` único, nombre ("Equipo 1"), encargado (un empleado de nivel Encargado o Supervisor), integrantes (empleados con `team_id`), color opcional, activo. La tarjeta muestra la obra actual ("Colegio Arcoíris · La Romana · hasta vie 30") calculada con CAL-02.

**EQP-04 [M]** Un empleado pertenece como mucho a un equipo. Asignar un integrante desde el equipo cambia su `team_id`.

**EQP-05 [M]** **Empresas**: nombre único, sigla de 2 letras única, color. Aviso si el color está a menos de 60 de distancia RGB del naranja de la marca `#EA6A1F` o de otra empresa.

**EQP-06 [M]** No se puede desactivar un equipo ni borrar una empresa con proyectos no archivados; se ofrece desactivar.

### 4.6 Avisos (AVI)

**AVI-01 [M]** Observación de proyecto: aparece en el mural y en el móvil si `show_on_mural` y `hoy ≤ mural_until` (sin fecha, mientras siga activada).

**AVI-02 [M]** Avisos generales: texto ≤ 140 caracteres, `starts_on`, `expires_on`, orden. Se gestionan en Mural · Configuración.

**AVI-03 [M]** El mural muestra como mucho 3 avisos a la vez (los generales primero, luego las observaciones por prioridad), estáticos, sin texto en movimiento.

### 4.7 Mural TV (MUR)

Referencia: `V4MuralPrincipal.dc.html` (diseño principal) y `V4Mural.dc.html` (timeline por fila).

**MUR-01 [M]** Ruta `/tv/:id`, lienzo fijo 1920×1080 escalado para ocupar la pantalla sin deformarse. Texto mínimo 22 px a escala 1.

**MUR-02 [M]** Cabecera: marca, reloj en vivo y fecha larga (si el interruptor Reloj está activo) y 4 indicadores:
- **En obra**: proyectos de tipo `en_obra`.
- **Próximos**: `programado` con inicio en los próximos 14 días.
- **Por programar**: `por_programar` + `en_pausa`.
- **Terminados del mes**: `actual_end` en el mes actual.

**MUR-03 [M]** Diseño principal, columna izquierda "Proyectos activos": `en_obra` primero (barra "Día X de N" o "Atrasada · +N días" en ámbar), luego `programado` ("Inicia hoy", "Inicia mañana", "Inicia en N días", en días naturales). Orden según la configuración: por fecha, o con prioridad primero. Bandera de prioridad si está activa.

**MUR-04 [M]** Diseño principal, columna derecha: "Calendario por equipo" con N semanas (2, 3 o 4) de lunes a sábado, una fila por equipo activo, línea de "hoy" naranja `#C2410C`, barras con la regla de etiqueta de CAL-03 y el exceso de atraso como tramo ámbar discontinuo.

**MUR-05 [M]** Debajo, "Por programar": hasta 6 proyectos con su motivo de espera (CAL-07) o "lista", y los `en_pausa` con su motivo.

**MUR-06 [M]** Lista "Esperando medidor": proyectos `post_obra` con lugar y "terminada el …".

**MUR-07 [M]** Pie: avisos (AVI-03) y "Actualizado hh:mm".

**MUR-08 [M]** Diseño timeline: una fila por proyecto activo con datos a la izquierda y la barra en un timeline de N semanas.

**MUR-09 [M]** Configuración (`V4Config.dc.html`, ruta `/mural`): diseño (principal o timeline), semanas (2, 3, 4), orden de próximos (fecha o prioridad primero), interruptores (Por programar, Observaciones, Bandera de prioridad, Reloj, kWp; kWp apagado por defecto), avisos generales, enlaces de TV y una vista previa en vivo escalada.

**MUR-10 [M]** Actualización: el mural se suscribe a `/api/events` y vuelve a pedir `/api/view/mural` al recibir `change`. Respaldo: consulta cada 60 s. Al recuperar la conexión, reconecta con espera creciente (hasta 30 s).

**MUR-11 [M]** Sin conexión: sigue mostrando los últimos datos (también guardados en `localStorage`) con la marca "Sin conexión · datos de las hh:mm".

**MUR-12 [M]** A medianoche (zona local) recalcula "hoy" aunque no lleguen cambios.

**MUR-13 [M]** Paleta: el naranja se reserva para la marca y "hoy"; En pausa en magenta; colores de empresa solo en el punto y el monograma.

### 4.8 Móvil (MOV)

Referencia: `V4Movil.dc.html` (pantallas `hoy`, `obras`, `calendario` con `cal-mode` agenda o línea, `proyecto`).

**MOV-01 [M]** PWA instalable en `/m`: `manifest.webmanifest` (nombre "Electsun Obras", color de tema, íconos 192 y 512), service worker con `vite-plugin-pwa`.

**MOV-02 [M]** **Hoy**: saludo con nombre del empleado, la obra de su equipo hoy (día X de N, dirección, encargado con enlace `tel:`, botón "Cómo llegar" a Google Maps con el lugar), lo próximo de su equipo y avisos.

**MOV-03 [M]** **Obras**: lista de proyectos activos y próximos (todos, con chip "Tu equipo" para los suyos), filtro "Solo mi equipo", estado y atraso.

**MOV-04 [M]** **Calendario** con dos modos:
- **Agenda**: por día laborable, 3 semanas, incluye atrasadas hasta hoy con etiqueta "Atrasada".
- **Línea de tiempo**: filas por equipo, 3 semanas con scroll horizontal, línea de hoy, tramo de atraso.

**MOV-05 [M]** **Detalle de obra**: empresa, estado, fechas, días, equipo asignado e integrantes (con `tel:`), observación, preparación (motivo de espera), lugar con enlace de mapas.

**MOV-06 [M]** Barra inferior con Hoy, Obras y Calendario; áreas táctiles ≥ 44 px; diseño a 390×844 sin scroll horizontal (salvo la línea de tiempo).

**MOV-07 [M]** Caché sin conexión: la última respuesta de `/api/view/movil` se guarda; sin red se muestra con "Sin conexión · datos de las hh:mm". Los recursos estáticos se precachean.

**MOV-08 [M]** Datos filtrados en servidor: el móvil nunca recibe teléfonos de empleados fuera de su equipo, salvo el encargado y el supervisor de cada obra, ni datos de cuentas.

**MOV-09 [M]** Se actualiza por SSE igual que el mural, más al volver a primer plano (`visibilitychange`).

### 4.9 Historial (HIS)

**HIS-01 [M]** Cada escritura registra en `audit`: actor (usuario), acción (`project.update`, `employee.create`…), entidad, id y un diff `{campo: [antes, después]}`.

**HIS-02 [M]** El panel del proyecto muestra su historial: "Yokasta cambió el estado de Programado a En obra · hace 2 h".

**HIS-03 [M]** El historial no se edita ni se borra desde la app.

---

## 5. Reglas de cálculo compartidas (CAL)

Viven en `shared/domain.ts`, sin dependencias, con pruebas unitarias. Fechas como texto ISO `aaaa-mm-dd`.

**CAL-01 [M]** `today(tz)` devuelve la fecha ISO en `America/Santo_Domingo`. `isWorkday(d)`: lunes a sábado. `workdayIndex(d, base)`: con `base` un lunes, `días = (d − base)`, `w = floor(días / 7)`, `índice = 6w + min(días − 7w, 5)` (el domingo se pega al sábado).

**CAL-02 [M]** `countWorkdays(a, b)` cuenta días laborables en `[a, b]`. `dayOf(p, hoy)` = "Día X de N", con X = `countWorkdays(inicio, hoy)` y N = `countWorkdays(inicio, fin)`. `startsIn(p, hoy)` = "Inicia hoy", "Inicia mañana" o "Inicia en N días", en días naturales, como en el artboard del mural. Verificación con hoy = mar 27 oct 2026: Colegio Arcoíris 19→30 oct es "Día 8 de 11"; Taller Motormax 19 oct→6 nov es "Día 8 de 17"; Granja Los Pinos 22→26 oct sigue En obra, así que es "Atrasada · +1 día" (CAL-06).

**CAL-03 [M]** `placeBar(inicio, fin, rango)` → `{ visible, col, span, clipStart, clipEnd, labelInside }`. `clipStart` si empieza antes del rango (esquina izquierda recta), `clipEnd` si termina después; `labelInside` si `span ≥ 5`.

**CAL-04 [M]** `teamClash(p, otros)` según VAL-06.

**CAL-05 [M]** `addWorkdays(inicio, n)`: el día `n` laborable contando el inicio como día 1. `estimatedEnd(inicio, dias)`. Al editar `estimated_days` se recalcula `end_date`; al editar `end_date` a mano se recalcula `estimated_days`.

**CAL-06 [M]** `lateDays(p, hoy)` = `countWorkdays(fin + 1, hoy)` si el tipo es `en_obra` y `fin < hoy`; si no, 0. Texto "Atrasada · +N días".

**CAL-07 [M]** `missingPrep(p)` → lista de `planos`, `material`, `EDE` (solo `neta`). `waitReason(p)` = "Espera planos y material", o "Lista para programar".

**CAL-08 [M]** `muralModel(datos, config, hoy)` produce el modelo completo del mural (indicadores, activos, calendario, por programar, medidor, avisos). Lo usan `/api/view/mural`, la vista previa de Configuración y las pruebas.

**CAL-09 [M]** `mobileModel(datos, empleado, hoy)` produce el modelo del móvil.

---

## 6. Modelo de datos

PostgreSQL 16, sin PostGIS. Ids `uuid`. Fechas de obra como `date` (el parser 1082 devuelve texto). Todas las tablas con `created_at`; las editables con `updated_at` y `version`.

| Tabla | Columnas clave |
|---|---|
| `users` | `id, name, email unique, password_hash, role (admin\|office), active` |
| `sessions` | `hash pk, user_id, expires_at` |
| `invitations` | `hash pk, user_id, kind (invite\|reset), expires_at, used_at` |
| `companies` | `id, name unique, code char(2) unique, color, active` |
| `teams` | `id, code unique, name, lead_employee_id, color, active` |
| `employees` | `id, name, job, level, team_id, state, phone, active` |
| `statuses` | `id, name unique, kind, sort, fg, bg, dot, requires_schedule, requires_reason` |
| `projects` | Campos de PRY-01 |
| `notices` | `id, text, starts_on, expires_on, sort, created_by` |
| `mural_settings` | Fila única `id=1`: `design, weeks, upcoming_order, show_waiting, show_notes, show_priority, show_clock, show_kwp` |
| `access_links` | `id, kind (tv\|mobile), name, employee_id, active, token_hash, last_seen_at, created_by` |
| `device_sessions` | `hash pk, link_id, expires_at` |
| `audit` | `id bigserial, actor_id, action, entity, entity_id, diff jsonb, created_at` |

Índices: `projects(status_id)`, `projects(team_id, start_date)`, `audit(entity, entity_id)`, `employees(team_id)`.

---

## 7. API

JSON bajo `/api`. Esquemas `zod` en `shared/contracts/*.ts`, compartidos con el cliente. Errores `{ message }` con 401, 403, 404, 409, 422. Las escrituras exigen `Origin = APP_ORIGIN`.

| Método y ruta | Requisitos |
|---|---|
| `POST /api/auth/login`, `POST /logout`, `GET /me`, `POST /accept`, `POST /password` | AUT |
| `GET/POST /api/accounts`, `PATCH /api/accounts/:id`, `POST /api/accounts/:id/reset` | AUT-03..08 |
| `GET/POST /api/access-links`, `POST /:id/rotate`, `POST /:id/revoke` | ACC |
| `POST /api/access/session` (canje) | ACC-04 |
| `GET/POST /api/projects`, `GET/PATCH /api/projects/:id`, `GET /:id/history` | PRY, VAL, HIS |
| `POST /api/projects/import?dry=1`, `GET /api/projects/export` | XLS |
| `GET/POST/PATCH /api/statuses` | EST |
| `GET/POST/PATCH /api/employees`, `/api/teams`, `/api/companies` | EQP |
| `GET/POST/PATCH/DELETE /api/notices` | AVI |
| `GET/PUT /api/mural/settings` | MUR-09 |
| `GET /api/view/mural?link=:id` | MUR, CAL-08 |
| `GET /api/view/movil` | MOV, CAL-09 |
| `GET /api/events` (SSE: `ready`, `change {version}`, heartbeat 25 s) | MUR-10, MOV-09 |
| `GET /healthz`, `GET /readyz` | NF |

**API-01 [M]** Cada escritura que cambie datos visibles en el mural o el móvil llama a `publishChange()` en `server/events.ts`, que avisa a todos los clientes SSE conectados (bus en memoria; un solo proceso).

**API-02 [M]** SSE comprueba la sesión (usuario o dispositivo) al conectar y cada 60 s; si fue revocada, cierra el flujo.

---

## 8. Requisitos no funcionales (NF)

**NF-01 [M] Seguridad**: `helmet` con CSP propia (sin terceros salvo Google Fonts), comprobación de origen en escrituras, límite general 600/min en `/api`, `Cache-Control: no-store` en `/api`, ningún secreto en git (`.env` ignorado), tokens solo como hash.

**NF-02 [M] Datos**: ningún dato real en el repo; el seed es ficticio; `*.xlsx` ignorado.

**NF-03 [M] Accesibilidad**: contraste AA, foco visible, controles con nombre accesible, `aria-pressed` en interruptores, áreas táctiles ≥ 44 px en móvil.

**NF-04 [M] Legibilidad del mural** a 3–4 m: texto ≥ 22 px, números con `tabular-nums`.

**NF-05 [M] Rendimiento**: `/api/view/mural` < 300 ms con 500 proyectos; la tabla de proyectos responde sin retraso con 500 filas.

**NF-06 [M] Operación**: Docker Compose (db, api, caddy), `/readyz`, `ops/backup.sh` con `pg_dump` y timer diario, `ops/verify-restore.sh`, logs con rotación.

**NF-07 [M] Pruebas**: unitarias de `shared/domain.ts`, integración de la API contra una base `*_test` local (protección de Monitor), E2E con Playwright.

**NF-08 [M] Tipado**: TypeScript estricto en todo el repo; `npm run typecheck` sin errores.

---

## 9. Matriz de coherencia

| Pantalla / control (artboard) | Requisitos | Endpoint |
|---|---|---|
| Dock: Proyectos · Equipo · Mural · Ver TV · avatar (V4Dock) | ROL-01, AUT-08 | `GET /auth/me` |
| Tabla: filtros con contador (V4Proyectos) | PRY-04, EST-01 | `GET /projects`, `GET /statuses` |
| Tabla: celda Estado con "Atrasada · +N" | PRY-03, PRY-09, CAL-06 | `PATCH /projects/:id` |
| Tabla: celda Tipo y chips PL/MA/EDE | PRY-01, VAL-07, VAL-09, CAL-07 | `PATCH /projects/:id` |
| Tabla: celda Equipo con aviso de choque | VAL-06, CAL-04 | `PATCH /projects/:id` |
| Tabla: estrella de prioridad | ROL-03, MUR-03 | `PATCH /projects/:id` (admin) |
| Tabla: ícono de pantalla (mural) | AVI-01 | `PATCH /projects/:id` |
| Tabla: Importar / Exportar | XLS-01..06 | `POST /projects/import`, `GET /projects/export` |
| Panel: Preparación (segmentado + 3 marcas + "Espera …") | PRY-01, CAL-07 | `PATCH /projects/:id` |
| Panel: Días estimados y "Fin previsto" | CAL-05 | `PATCH /projects/:id` |
| Panel: Estado con motivo de pausa | EST-02, VAL-02 | `PATCH /projects/:id` |
| Panel: Vista previa del calendario | PRY-07, CAL-03 | — (cálculo local) |
| Panel: Historial | HIS-02 | `GET /projects/:id/history` |
| Equipo · Empleados (V4EquipoTablas) | EQP-01, EQP-02, ACC-06, ACC-07 | `/employees`, `/access-links` |
| Equipo · Equipos de obra | EQP-03, EQP-04 | `/teams` |
| Equipo · Empresas | EQP-05, EQP-06 | `/companies` |
| Mural · Configuración (V4Config) | MUR-09, AVI-02, ACC-02 | `/mural/settings`, `/notices`, `/access-links` |
| Mural TV principal (V4MuralPrincipal) | MUR-01..07, MUR-10..13, CAL-08 | `/view/mural`, `/events` |
| Mural TV timeline (V4Mural) | MUR-08 | `/view/mural` |
| Móvil Hoy / Obras / Calendario / Detalle (V4Movil) | MOV-01..09, CAL-09 | `/view/movil`, `/events` |
| Cuentas, Login, Activar | AUT-01..09 | `/auth/*`, `/accounts` |
