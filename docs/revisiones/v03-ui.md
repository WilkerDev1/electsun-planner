# Revisión de la interfaz v0.3 (Proyectos, Ajustes/Empresas, Mural/móvil)

Revisión de solo lectura de `feat/v03-base..integ/v03` (rutas `src`, `e2e`, `tests`). Los números de línea son de `integ/v03`. No se ejecutó la aplicación ni la suite: la revisión es estática, y cada hallazgo se verificó leyendo el código.

## Alta

Ninguno verificado. No hay fallos que rompan datos ni seguridad en la interfaz nueva. Los puntos de mayor riesgo están en Media.

## Media

### M1. Seleccionar todos supera el límite de 200 del endpoint de archivado en bloque
- **Archivo:** `src/admin/proyectos/index.tsx:202` (y `:313` para el banner de terminados).
- **Problema:** la casilla de cabecera selecciona toda la lista visible (`list.map(...)`) sin tope. `ArchiveBulk` del servidor admite `ids` de 1 a 200 (`shared/contracts/projects.ts:96`).
- **Escenario:** con más de 200 proyectos en una pestaña, "Seleccionar todos" y luego "Archivar seleccionados (N)" envía 201 o más ids. El servidor responde 422, `archiveMany` (`store.ts:213-218`) muestra un error genérico y recarga, y no se archiva nada. Lo mismo pasa con el banner si hay más de 200 terminados antiguos.
- **Arreglo:** trocear en lotes de 200 en `archiveMany` (`store.ts`), o limitar la selección a 200 y avisar en la barra ("Solo se pueden seleccionar 200 a la vez").

### M2. Un valor rechazado queda escrito en el campo (catálogo de preparación y estados)
- **Archivos:** `src/admin/ajustes/Prep.tsx:82` (key), `:34-45` (`save`), `:140-142` y `:156-192` (estado local); `src/admin/mural/Statuses.tsx:95` (key), `:49-59` (`save`), `:152-158` (estado local).
- **Problema:** la key de cada fila es `id-version`. Si el PATCH falla sin cambiar la versión (por ejemplo, código o nombre duplicado, o validación), `save` solo recarga y muestra un aviso. La fila no se remonta y el input conserva el texto no guardado.
- **Escenario:** en Ajustes → Preparación, renombrar un parámetro a un código que ya existe. El servidor rechaza, aparece el aviso, pero el campo sigue mostrando el código duplicado como si estuviera guardado. Si la persona no lee el aviso, cree que cambió.
- **Arreglo:** al fallar `save`, reiniciar el estado local desde `item` (o `s`) además de recargar, o forzar el remontaje con un contador de intentos en la key.

### M3. Archivar desde el panel no muestra "Deshacer" y falla si hay un guardado en vuelo
- **Archivos:** `src/admin/proyectos/index.tsx:294` (el panel usa `store.setArchived`, no `archiveIds`); `src/admin/proyectos/store.ts:183-203`; `src/admin/proyectos/Panel.tsx:449` y `:455`.
- **Problema 1 (incumple PRY-10):** el botón "Archivar" del panel no pasa por `archiveIds`, así que no activa el aviso "Proyecto archivado · Deshacer". Solo lo hacen el menú de fila y la selección.
- **Problema 2:** `setArchived` envía `base.version` de `confirmed`, que no se actualiza hasta que responde el PATCH en vuelo (`store.ts:113`). Si el usuario cambia un campo y pulsa "Sí, archivar" antes de que vuelva el guardado, el servidor responde 409. El archivado no se aplica y se muestra el mensaje de conflicto del servidor, que no explica que el conflicto es con su propio guardado.
- **Escenario:** cambiar el nombre y pulsar "Archivar" en menos de medio segundo. Resultado: error y el proyecto sigue activo.
- **Arreglo:** pasar el archivado del panel por `archiveIds` (undo incluido), y en `setArchived` esperar a la cola (`q.busy`) o usar el endpoint en bloque, que no depende de la versión.

### M4. Una respuesta de PATCH antigua puede sobrescribir un archivado ya aplicado
- **Archivo:** `src/admin/proyectos/store.ts:110-119` (flush) y `:206-213` (archiveMany).
- **Problema:** `archiveMany` escribe la fila con la respuesta del servidor (archivada) y la guarda en `confirmed`. Si un PATCH enviado antes llega después, `flush` sustituye la fila y `confirmed` con su respuesta (sin archivar), porque no compara la versión ni el orden.
- **Escenario:** editar un campo y, sin esperar, usar "Archivar" desde la selección. Si la respuesta del archivado llega antes que la del PATCH, la fila vuelve a aparecer como activa hasta la siguiente recarga (SSE, sondeo de 60 s o cambio de vista).
- **Arreglo:** en `flush`, si la versión confirmada ya es mayor que la de la respuesta (o `archiveMany` marcó la fila como “tocada”), descartar la respuesta antigua; o bloquear el archivado en bloque mientras `q.busy`.

### M5. Las barras del calendario y de la línea de tiempo no usan el patrón de empresa
- **Archivos:** `src/mural/Timeline.tsx:194` (`background: g.solid`); `src/mural/Principal.tsx:281` (`background: obra ? "#DCF3E5" : "#E9EDFF"`).
- **Problema:** el encargo pide que las barras usen `patternStyle` (EQP-08). Solo cambió el punto de la fila (`PatternDot`) y la marca de empresa. Las barras siguen con colores fijos por tipo o por grupo, y no se distingue la empresa.
- **Arreglo:** aplicar `patternStyle({color, pattern})` al fondo de la barra en ambas vistas, comprobar el texto con `textColor` y, en la línea de tiempo, el color blanco sobre `g.solid` (`Timeline.tsx:201`) que quedaría sobre un patrón.

### M6. Empresas: el encargo pide solo lectura para oficina, y la pantalla es editable para todos
- **Archivo:** `src/admin/equipo/EmpresasTab.tsx:37-41`, `:79`, `:91`, `:94`; `src/admin/equipo/EmpresasTab.tsx:161` (CompanyDialog sin `canEdit`).
- **Problema:** la pantalla no recibe el rol. Alta de empresa, color, activar o desactivar y editar aparecen para oficina. El servidor también lo permite (`server/routes/companies.ts:52`, `:67` solo exigen `authenticated`), así que no hay error visible, solo un permiso más amplio que el que pide el encargo.
- **Nota:** el encargo es ambiguo. Para Estados y Preparación pone "solo el admin edita", y para Empresas solo exige la subida de logotipo a admin u oficina. Confirmar la intención antes de cambiarlo.
- **Arreglo (si se quiere solo lectura):** pasar `isAdmin` a `EmpresasTab` y ocultar o deshabilitar los controles, igual que en `StatusesCard`.

## Baja

### B0. `aria-controls` de la pastilla de aviso apunta a un id inexistente cuando está cerrado
- **Archivo:** `src/admin/proyectos/Table.tsx:348` (aria-controls) y `:386` (el panel solo existe si está abierto).
- **Estado:** axe no lo marca con `aria-expanded="false"`, así que es una cuestión de estrictez. Si se quiere, mantener el panel en el DOM con `hidden`.

### B1. Selección que sobrevive al filtro de búsqueda
- **Archivo:** `src/admin/proyectos/index.tsx:84-86` y `:202`.
- **Problema:** cambiar la búsqueda no limpia `checked`. Las filas ocultas siguen marcadas y reaparecen marcadas al borrar la búsqueda. La barra y la acción solo usan las visibles, así que el recuento no miente, pero la selección no es la esperada.
- **Arreglo:** limpiar la selección al cambiar `query`, o mostrar "N ocultos seleccionados".

### B2. El conflicto 409 al editar un prep descarta los cambios encolados sin avisar de cuáles
- **Archivo:** `src/admin/proyectos/store.ts:121-134`.
- **Problema:** al haber 409, `q.pending = null` descarta los clics posteriores (marcar otras fichas). El aviso es genérico ("Otra persona cambió este proyecto…") y la fila vuelve a la versión del servidor.
- **Arreglo:** reaplicar los cambios encolados sobre la versión nueva, o indicar qué cambio se perdió.

### B3. Popover de preparación sin trampa de foco ni cierre con Tab
- **Archivo:** `src/admin/proyectos/Floating.tsx:50` (`Tab` solo cierra si `role === "menu"`).
- **Problema:** el popover de parámetros (`role="dialog"`, `Table.tsx:139`) no se cierra al pasar el foco fuera con Tab, y tampoco lo retiene. Con teclado puede quedar abierto detrás del foco.
- **Arreglo:** cerrar en `Tab` también para `dialog` cuando el foco salga del contenedor, o atrapar el foco dentro.

### B4. Un aviso cerrado por preferencia oculta un error nuevo
- **Archivo:** `src/admin/proyectos/Table.tsx:231-232`.
- **Problema:** `pref ?? avisoOpenByDefault(...)` hace que una preferencia guardada `0` oculte un aviso nuevo de error. La pastilla sigue en rojo, pero el panel no se abre sin que la persona lo pida.
- **Arreglo:** forzar abierto cuando aparece un error nuevo (comparar con el último código visto), o no recordar el cierre para errores.

### B5. Corrección de posición del panel de aviso con desplazamiento horizontal
- **Archivo:** `src/admin/proyectos/Table.tsx:201` (`sticky left-[104px]`).
- **Problema:** el panel está en la columna 5 (Proyecto, a 298 px del inicio). Con `left-[104px]` queda fijado por encima de las columnas no fijas al desplazar. Es probable que el texto pase por encima de Prioridad y Empresa. No se ha comprobado visualmente.
- **Arreglo:** calcular el `left` sticky como el ancho de las columnas fijas (checkbox + #, 84 px) o quitar el sticky del panel.

### B6. Mapa de patrones de la línea de tiempo indexado solo por color
- **Archivo:** `src/mural/Timeline.tsx:42` y `:170`.
- **Problema:** `patterns` se construye con `color.toUpperCase()` como clave. Dos empresas con el mismo color (el servidor avisa, pero lo permite) comparten patrón, el último que aparezca.
- **Arreglo:** usar el id de la empresa en la clave, o pasar el patrón desde `CompanyTint` que ya lo lleva (`shared/mural-model.ts:191`).

### B7. Logotipo: un bitmap sin cerrar si falla el contexto, y `uploadLogo` ignora el 401
- **Archivos:** `src/admin/equipo/logo.ts:23-28` (si `getContext` devuelve null, `bitmap.close()` no se llama) y `:38-53` (no emite `planner:unauthorized`, a diferencia de `src/ui/api.ts:26`).
- **Impacto:** fuga menor de memoria en un caso raro, y sesión caducada sin redirigir a inicio de sesión durante la subida.
- **Arreglo:** cerrar el bitmap antes de lanzar el error, y usar `api()` o emitir el mismo evento en `uploadLogo`.

### B8. Monograma de 10 px en la tabla y el panel
- **Archivo:** `src/ui/CompanyMark.tsx:69` (`fontSize: Math.max(10, round(size*0.4))`) usado con `size={24}` en `src/admin/proyectos/Table.tsx:278` y `:406`.
- **Impacto:** texto de 10 px dentro de la marca. Es aceptable en tablas, pero está por debajo del mínimo de 13 px que el propio proyecto usa en el móvil. El mínimo de 22 px solo aplica al mural, que usa `MuralMark`.

## Revisado y correcto

- **Avisos por proyecto (Table.tsx, model.ts):** el estado por defecto (abierto con error o atraso, cerrado con informativos) coincide con `avisoOpenByDefault` (`model.ts:196`). `aria-expanded` y `aria-controls` usan un id único con `useId`. La preferencia se guarda por proyecto en `localStorage` con try/catch en lectura y escritura (`model.ts:199-213`). El disparador muestra "N avisos" o el resumen corto, y el icono de la pastilla está oculto para lectores de pantalla.
- **Acciones directas del aviso:** "Marcar X como hecho" solo aparece para ítems que aplican y están pendientes (`prepRows(...).pending`). "Abrir proyecto" funciona.
- **Edición de `prep` (Table y Panel):** `toggledPrep` y `withPrepItem` calculan a partir del `prep` actual. Como cada clic re-renderiza antes del siguiente, varios clics seguidos se acumulan en `q.pending` y el PATCH final lleva todos. Verificado en `store.ts:117-119` y `:103-105`. Con el PATCH en vuelo, la respuesta conserva la versión optimista.
- **Filtros y pestañas:** las pestañas de estado nunca muestran archivados (`index.tsx:70-75`). "Archivados" muestra solo ellos. El cambio de pestaña limpia la selección (`changeFilter`).
- **Deshacer:** el temporizador de 6 s se reinicia con cada nuevo `undo` (`index.tsx:89-93`). Deshacer funciona tras cambiar de vista, porque usa los ids guardados y no la vista actual.
- **Banner de terminados > 30 días:** `staleFinished` usa `actual_end ?? end_date` con `end < today-30`, lo que corresponde a "más de 30 días". La fecha de hoy viene del servidor (`useAuth().today`, `server/routes/auth.ts:23`), así que no depende de la zona horaria del navegador.
- **Popovers (Floating.tsx):** Escape cierra y devuelve el foco al disparador (`:40-43`, `:38`). Un clic fuera o el scroll de la página los cierra. Las flechas recorren los elementos del menú. El foco inicial va al primer elemento.
- **Cabecera de la tabla:** la suma de `COLUMNS` (2026 px) coincide con `TABLE_MIN_WIDTH`, y hay 15 columnas en ambas.
- **Estados (Statuses.tsx):** la eliminación pide reemplazo cuando hay proyectos, bloquea el último estado de su tipo, y el reemplazo se ordena primero por tipo igual. La confirmación lista el número de proyectos incluidos archivados.
- **Logotipo (logo.ts y EmpresasTab):** la validación de tipo ocurre antes de decodificar. El tamaño máximo es 256 px con proporción conservada. La transparencia se mantiene en PNG y WebP. La URL de vista previa se revoca al cambiar o desmontar (`EmpresasTab.tsx:175-176`), sin fuga. `logo_url` lleva `?v=` (`server/queries.ts:54`), así que el cambio de logotipo no queda en caché.
- **CompanyMark:** el fallback a monograma funciona por URL fallida (`CompanyMark.tsx:45-63`), y al cambiar `logo_url` se reintenta. El texto del monograma cumple AA contra el fondo y el patrón (`monogramStyle`).
- **Alt duplicado:** todas las llamadas a `CompanyMark` y `CompanyMono` usan `decorative`, así que el nombre no se repite (lista verificada con grep).
- **Mural (Mark.tsx, Principal.tsx):** el monograma del mural usa 22 px, igual que el texto. La marca de logotipo cae a monograma si falla. El chip de espera usa `PatternDot` salvo en pausa.
- **Móvil (Detalle.tsx):** la lista de preparación muestra cada ítem con "Hecho", "Pendiente" o "No aplica", y el texto de no aplicar es `text-muted`. Los motivos de espera salen del catálogo y no hay texto fijo de PL, MA o EDE.
- **Seguridad cliente:** no hay `dangerouslySetInnerHTML` ni `innerHTML` en el diff. Los `href` nuevos son anclas internas (`#estados`, `#preparacion`) o `/ajustes#preparacion`. Las `src` de imagen son `logo_url` del servidor o un `blob:` local. El SVG no está permitido (`logo.ts:5`, y el servidor lo rechaza en `server/routes/companies.ts:132`).
- **Ajustes (index.tsx):** las anclas `#estados` y `#preparacion` se desplazan aunque los datos carguen después, porque las secciones se renderizan desde el principio. La oficina ve el aviso y los controles de solo lectura en Estados y Preparación.
- **Preparación (Prep.tsx):** el borrado de un parámetro cuenta los proyectos afectados, incluidos archivados. El alta exige código, nombre y motivo. El orden sube y baja por intercambio de `sort`.
- **Estados (Statuses.tsx):** el texto "El tipo de cada estado es fijo" se sustituyó por la explicación del encargo (`Statuses.tsx:81`), y los tipos muestran su ayuda al crear.
- **Dock y rutas:** `/ajustes` aparece en el dock y en `main.tsx:41`, y se carga en diferido.

## Notas

- Revisión estática. No se ejecutó la app, ni `npm test`, ni axe; los puntos de visualización (B5, B8) necesitan comprobación en el navegador.
- Los hallazgos M5 y M6 incumplen el encargo, no provocan fallos de runtime; se dejan en Media para decidir.

## Resolución

Rama `fix/v03-ui`. Decisiones del coordinador aplicadas.

### Corregido
- **M1.** `archiveMany` trocea en lotes de 200 (`chunk`, `ARCHIVE_BULK_MAX`). Si un lote falla, se avisa con cuántos se completaron y se recarga; nunca falla en silencio. Prueba: `tests/v03-proyectos-ui.test.ts`.
- **M2.** Prep y Estados remontan las filas al fallar un guardado (contador `resets` en la key): el campo vuelve al valor guardado y se muestra el error.
- **M3.** El botón «Archivar» del panel pasa por `archiveIds` (con «Deshacer»). `setArchived` y `archiveMany` esperan primero al guardado en vuelo (`waitIdle`), así que ya no hay 409 contra el propio guardado.
- **M4.** `flush` descarta una respuesta cuya versión es menor que la ya confirmada (`isStaleResponse`). Además el archivado espera al guardado en vuelo. Prueba unitaria incluida.
- **B0.** `aria-controls` solo se pone con el panel abierto.
- **B1.** Cambiar la búsqueda limpia la selección.
- **B3.** El popover `dialog` se cierra cuando el foco sale con Tab.
- **B6.** Ya resuelto en `integ/v03`: `Timeline.tsx` toma el patrón de `CompanyTint` (`r.pattern`), no de un mapa por color.
- **B7.** `resizeLogo` cierra el bitmap si falta el contexto y `uploadLogo` emite `planner:unauthorized` con 401.

### Descartado
- **M5 (patrón en barras).** Por diseño: las barras del mural se colorean por estado (MUR-13); el patrón de empresa va en la marca de empresa (`CompanyMark`/`PatternDot`).
- **M6 (Empresas solo lectura para oficina).** Intencional: la oficina gestiona los catálogos (ROL-02).
- **B2.** Reaplicar cambios encolados tras un 409 puede sobrescribir lo que otra persona cambió; el aviso y la recarga con la versión del servidor son el comportamiento seguro. Caso raro.
- **B4.** Respetar el cierre elegido por la persona es deliberado; la pastilla sigue en rojo y visible.
- **B5.** No verificado visualmente y las columnas fijas no coinciden con el cálculo propuesto; no se toca sin comprobarlo en el navegador.
- **B8.** El monograma de 10 px es el mínimo aceptado en tabla y panel (la marca lleva además nombre accesible); el mínimo de 22 px aplica al mural.
