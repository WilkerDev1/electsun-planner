# Electsun Planner — Brief del proyecto (Versión 4 · Simple)

> Este documento resume la lluvia de ideas y las decisiones tomadas en el chat de diseño
> (conversación privada).
> Los diseños están en el lienzo de Claude Design: (privado)
> (la página **"Versión 4 · Simple"** es la vigente).

## Qué es

La tabla de Excel que usa el jefe para ver los proyectos solares, convertida en:

1. **Mural (TV):** una pantalla siempre encendida en la oficina. Es el centro del proyecto.
2. **Administración:** el lugar donde se cargan y editan los datos que alimentan el mural.

**Principio guía:** la oficina carga y actualiza, el jefe decide las prioridades y el mural solo muestra la información.
Si una función no mejora lo que se ve en la TV, o no hace más rápido actualizarla, no entra.
Debe ser simple. No es un SaaS completo: es "el Excel, pero cómodo".

## Usuarios

| Actor | Qué hace |
|---|---|
| Oficina administrativa | Usuario principal. Crea proyectos, cambia estados y fechas, asigna equipo y escribe avisos. Cambiar un estado debe tomar un clic. |
| Jefe | Lo mismo que la oficina, y además define la prioridad. |
| Mural (TV) | Solo lectura, sin login (URL fija), refresco automático, legible a 3–4 m. |
| Encargados / cuadrillas | Miran el mural y lo explican a sus equipos. |

## Modelo de datos

**Proyecto** (las columnas del Excel y algunos extras):

- Contratista/empresa (con color propio)
- Proyecto / cliente
- kWp
- Fecha de venta
- Lugar
- Encargado
- Cuadrilla
- Inicio
- Fin
- Estado
- Observación
- ➕ Prioridad (la marca el jefe; ordena las listas y el mural)
- ➕ "Mostrar observación en el mural" (con una fecha hasta la que se muestra)
- ➕ Parte (p. ej. "Parte 1": un proyecto por fases, como "se instala primero 8 paneles")
- ➕ Historial automático de cambios (quién cambió qué y cuándo)

**Estados (5)**, guardados como una lista editable y no fijos en el código:
`Por programar → Programado → En obra → Terminado`, más `En pausa`, que pide un motivo obligatorio.

**Catálogos:** cuadrillas (con sus miembros), encargados y contratistas (nombre y color; el avatar usa 2 letras: EL, CO, EC, EN, EV).

**Contratistas vistos en el Excel:** Electsun, Compusol, EcoSur, Enerval, Evolta.

**Validaciones** (problemas reales del Excel):
- Fecha de ejecución anterior a la de venta (caso de Panadería La Espiga).
- Mezcla de "NA" y "N/A": se normaliza como "sin fecha", es decir, *Por programar*.
- Una cuadrilla asignada a dos proyectos en las mismas fechas.

## Mural (1 sola vista, sin rotación) — formato 16:9, 1920×1080, modo claro

Hay dos iteraciones en el lienzo, y la configuración permite elegir cuál usa la TV.

**Iteración 2 (formato preferido):**
- **Arriba:** reloj en vivo y 4 indicadores: En obra · Próximos · Por programar · Terminados.
- **Izquierda, "Proyectos activos":** estado, equipo y fechas de cada proyecto.
  Los que están en obra muestran "Día 9 de 12" con una barra; los programados, "Inicia en N días".
- **Derecha:** "Calendario por equipo" de 2 semanas con línea de "hoy" (sin desbordes: el nombre va dentro de la barra si cabe, y si no, a un lado), y debajo "Por programar".
- **Abajo:** avisos fijos, sin texto en movimiento.

**Iteración 1:** una fila por proyecto, con los datos a la izquierda y su barra de inicio a fin en un timeline de 3 semanas a la derecha.

Reglas: poca densidad, letra grande, colores de estado que no choquen con los colores de los contratistas
(el naranja queda reservado para la marca y para "hoy"; "En pausa" va en magenta).

## Administración — dock lateral flotante

Dock: **Proyectos · Equipo · Mural** y el acceso **Ver TV**.

- **Proyectos:** una tabla tipo Excel en la que estado, equipo y fechas se editan dentro de la celda. Tiene filtros por estado, avisos de errores de datos, botones para agregar, importar y exportar Excel, y un ícono para decidir si la observación sale en el mural.
  Al pulsar el lápiz, la tabla se compacta en una lista y el panel de edición se abre al lado, sin cambiar de pantalla. Ese panel guarda solo, avisa si el equipo está ocupado en esas fechas, muestra cómo quedará la barra en el calendario, la prioridad y el historial.
- **Equipo:** cuadrillas y sus miembros, encargados, y empresas con su color.
- **Mural:** el enlace para la TV, la elección del diseño (iteración 1 o 2), las semanas que abarca el timeline, qué secciones se muestran, los avisos generales y una vista previa en vivo.

## Sistema visual (sacado de los diseños V4)

Las fuentes de referencia están en `design/v4/*.dc.html`. Son componentes de Claude Design: los datos de demo están en el bloque `<script>` y el layout en `<x-dc>`.

- **Tipografía:** Plus Jakarta Sans (400–800) con `font-variant-numeric: tabular-nums`. En el mural el texto mínimo es de 22 px.
- **Base:** fondo `#F4F5F7`, tarjetas `#FFFFFF` con radio de 22–24 px, texto `#1B1F27`, texto secundario `#5F6675` / `#475467`, bordes `#EAECF0`.
- **Marca:** naranja `#EA6A1F`; "hoy" `#C2410C`.
- **Estados:**
  | Estado | Sólido | Texto | Fondo |
  |---|---|---|---|
  | En obra | `#0B7A68` | `#095C4F` | `#E0F4EF` |
  | Programado | `#6172F3` | `#3538CD` | `#EEF0FE` |
  | Por programar | — | `#3F4859` | `#EFF1F5` |
  | En pausa | — | `#A11C47` | `#FDECF1` |
- **Empresas** (punto de color y monograma):
  Electsun `#0EA5E9` (EL) · Compusol `#EA580C` (CO) · EcoSur `#CA8A04` (EC) · Enerval `#7C3AED` (EN) · Evolta `#16A34A` (EV).
- **Calendario:** días laborables de lunes a sábado (el domingo no aparece). La barra que viene de antes del rango tiene la esquina izquierda recta, y la etiqueta va dentro de la barra si ocupa 5 días o más.
- **Mural:** 1920×1080 fijo, refresco cada 30–60 s. Si se pierde la conexión, sigue mostrando los últimos datos con la hora de la última actualización.

**Reglas de la tabla de Proyectos** (sacadas de `V4Proyectos`):
- *Programado* exige fecha de inicio y equipo.
- *En pausa* exige un motivo.
- Hay choque de cuadrilla cuando el mismo equipo tiene otro proyecto no terminado con fechas que se solapan.
- Los filtros por estado muestran un contador por estado.

**Configuración del mural** (`V4Config`): diseño 1 o 2 · timeline de 2, 3 o 4 semanas · orden de los próximos (por fecha o con la prioridad primero) · interruptores para Esperando fecha, Observaciones, Bandera de prioridad, Reloj y kWp (apagado por defecto) · avisos generales con fecha de caducidad.

## Datos de demo

Se usan los 18 proyectos del Excel original. Los nombres de empleados y cuadrillas ("Cuadrilla 1–3") son de ejemplo hasta tener los reales.
Normalmente hay de 3 a 4 proyectos en obra a la vez.

## Fuera de la v1 (no se descarta, solo espera su turno)

Gestión de tareas · notas auditables (autor, hora, lugar, verificación) · ciclo detallado de 9 etapas ·
kanban · calendario semanal · gestión de clientes · dashboard · rotación de pantallas en el mural ·
notificaciones por WhatsApp · fotos y materiales · roles y permisos · multiempresa · modo oscuro.

Todo eso ya está diseñado en las otras páginas del lienzo, como archivo de ideas.

## Preguntas abiertas

- El ciclo real de madurez de la empresa (pedir el informe al jefe).
- Los nombres reales de cuadrillas, encargados y empleados.
- Stack técnico y dónde se aloja (todavía no está decidido).
