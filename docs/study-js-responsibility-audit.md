# Responsabilidades, Alpine y componentes de `study.js`

Fecha: 2026-10-22. Referencia: `4962dcc4`. Revisión estática del código actual;
las líneas indicadas corresponden a esta revisión. No se modifica la aplicación.

## Resultado

`study.js` reúne composición de la página, varios flujos de práctica, persistencia
y presentación. La separación más útil es que el motor publique estado y reciba
comandos, mientras los componentes de interfaz muestran ese estado. Alpine encaja
en los controles y las vistas; Chessground y las reglas de entrenamiento conservan
su propia implementación.

El archivo tiene 2.080 líneas, 90 declaraciones de función, 37 declaraciones de
importación ES y 59 bindings en declaraciones de variables de nivel superior.
Estos últimos incluyen constantes y referencias a adaptadores, no solo estado
mutable. `handle_move` ocupa 265 líneas y `main`, 212. Las cifras se obtuvieron
del AST; no son una medida de rendimiento ni una estimación de código eliminable.

## Mapa de responsabilidades

| Responsabilidad actual | Evidencia en `assets/js/study.js` | Separación aconsejada |
| --- | --- | --- |
| Arranque y composición | `main`, 1801–2012; inicializa almacenamiento, tablero, árboles, sesiones, Sparring, controles y modos | Mantener un punto de composición pequeño que conecte módulos y entregue sus dependencias |
| Carga de PGN y capítulos | `setup_trees`, 1204; `setup_chapter_select`, 1246; árboles distintos de lectura y práctica | Modelo de documento/capítulos; cambiar capítulo es una operación de dominio con un adaptador de selección |
| Ejecución de jugadas | `handle_move`, 402; `ai_move`, 1082; `play_move`, 1114; `start_training`, 1123 | Controlador de práctica; separar evaluación, registro y transición antes de mover el flujo completo |
| Smart y práctica dirigida | `smartIntroductionMove`, 140; `selectNextSmartPosition`, 155; `updateSmartRun`, 198 | Controlador Smart sobre los modelos existentes de selección y revisión |
| Errores, capítulos débiles y revisiones | `showFailedPosition`, 227; funciones de colas y revisión, 668–777 | Controladores de recorridos con políticas diferenciadas; conservar orden, recuperación y condiciones de finalización |
| Estado del tablero y reproducción de contexto | `presentPracticePosition`, 94; `setup_move`, 1025 | Adaptador imperativo de Chessground y controlador de reproducción cancelable |
| Pistas, flechas y explicaciones | `give_hints`, 841; `display_arrows`, 866; `create_comment`, 927; `display_comments`, 980 | Separar las decisiones sobre asistencia de la construcción de comentarios y formas visuales |
| Preferencias y profundidad | inicialización, 279–310; toggles, 1365–1513; profundidad, 1515–1573; valores, 1699–1737 | Modelo de preferencias + componentes Alpine de ajustes y profundidad |
| Progreso y persistencia | registro, 787–818; `update_progress`, 1584; reset, 1660; hidratación y sincronización en `main` | Proyección de progreso, persistencia y reset separados del renderizado |
| Lectura y navegación manual | `update_read_mode_ui`, 2017; `set_read_mode`, 2027; navegación, 2039–2080 | Controlador de lectura que reutilice árbol y navegación existentes; Alpine refleja su estado |

Los módulos ya extraídos sí aportan separación: `position_review.js`,
`chapter_stats.js`, `progress_preservation.js`, `position_context.js`,
`study_sessions.js`, `study_activity.js`, `sparring/study_adapter.js` y
`study/visualization.js`, entre otros. Hay que reutilizarlos y reducir la
coordinación que permanece en el archivo, sin crear modelos paralelos.

## Interfaz que ya usa Alpine

- `show.html.eex:36`: lectura, expansión de comentarios y detección de overflow.
- `show.html.eex:69`: visibilidad del botón de pistas según el modo de lectura.
- `_study_progress.html.eex:1`: lista de capítulos mediante `x-for`, estados,
  métricas, selección de práctica y acciones de revisión.
- El editor y mantenimiento ya registran componentes con `Alpine.data`.

El progreso ya ofrece un límite útil: el motor emite `study-progress-updated`
y Alpine renderiza sus datos. Lo pendiente ahí es separar la preparación de esos
datos y su temporizador de las reglas de práctica.

Bootstrap ya controla los modales y las pestañas a través de
`bootstrap_modals.js`, `bootstrap_study_controls.js` y `dialog_lifecycle.js`.
Esos estados deben conservar un único propietario.

## Candidatos para Alpine

| Prioridad | Candidato | Qué mostraría o manejaría Alpine | Qué conserva el dominio |
| --- | --- | --- | --- |
| Alta | Ajustes de pistas, comentarios, demora y revisión | Etiquetas, iconos, clics y valor seleccionado de los seis controles cíclicos | Valores válidos, defaults, persistencia y efectos sobre el entrenamiento |
| Alta | Profundidad de práctica | Slider, botones ±, output, checkbox, límites y resaltado | Alcance del catálogo, profundidad por capítulo y aplicación del cambio al cerrar ajustes |
| Media | Indicadores de recorridos | Texto, visibilidad y disponibilidad de acciones para Smart, errores, revisiones y capítulos débiles | Qué recorrido está activo, contadores, cola y finalización |
| Media | Explicaciones PGN | Lista de títulos y comentarios, con renderizado seguro | Qué comentarios revelar y cuándo su revelación cuenta como ayuda |
| Baja | Enlaces de análisis externo | `href` y comando de exportación sobre un snapshot de posición | PGN completo, orientación, variación seleccionada y fallback de Lichess |

### Ajustes: el primer cambio recomendado

Los seis toggles (`toggle_arrows`, `toggle_arrow_type`, `toggle_key_move`,
`toggle_review`, `toggle_move_delay`, `toggle_comments`) leen `textContent`,
comparan traducciones y escriben tanto el DOM como el estado y el almacenamiento.
`set_options_values` vuelve a escribir las mismas etiquetas.

El valor debe pertenecer al modelo y la etiqueta derivarse de él. Un componente
registrado como `studyPreferences` podría conectar los controles actuales con un
modelo de opciones y un helper de ciclo compartido. La plantilla mantendría sus
botones, clases, IDs, descripciones accesibles y distribución.

Los valores guardados hoy incluyen textos traducidos. Introducir identificadores
estables requiere un lector compatible o una migración explícita que conserve
preferencias válidas. También hay defaults y claves independientes para tácticas
(`tactics_show_arrows`, `tactics_show_comments`), además de las claves de repertorio.
No conviene mezclar este cambio de formato con la primera extracción de interfaz.

`key_move` está oculto en la plantilla, pero su preferencia aún participa en
`start_training`; no puede eliminarse solo porque no aparezca en pantalla.

### Profundidad: control visual y efecto diferido

El componente debe recibir el capítulo activo, profundidad disponible, valor y
habilitación. El motor sigue interpretando `DEPTH_MAX = -1` y aplicando el alcance.
Un cambio de capítulo debe refrescar el componente sin escribir accidentalmente
el valor del capítulo anterior.

Hoy el slider marca `depthSettingsChanged` y actualiza progreso, pero el reinicio
de práctica se decide mediante `onDialogClosed`. Hay que conservar esa decisión:
arrastrar el slider no debe reiniciar la sesión repetidamente ni alterar Read.
Tampoco debe reemplazarse ese cierre por un segundo gestor Alpine del modal.

### Indicadores y comentarios

Un componente de estado puede presentar `{ visible, message, completed }` y
acciones disponibles. No debe imponer un mensaje genérico cuando Smart emite
texto vacío: las cadenas cortas de repaso lo ocultan deliberadamente.

La lista de explicaciones podría recibir filas preparadas por el motor y usar
`x-for`/`x-text`. Hoy `create_comment` construye nodos y delega en `set_text`, que
usa `textContent` para el texto PGN no confiable. Ese contrato debe mantenerse;
reemplazarlo por `x-html` cambiaría la seguridad del renderizado.

Revelar comentarios o flechas puede modificar `assistedPositions` y, con ello,
la calificación. El componente visual no debe decidir si una respuesta fue
asistida ni registrar una revisión desde un watcher de presentación.

## Qué puede ser reutilizable

| Pieza propuesta | Reutilización identificada | Alcance y límites |
| --- | --- | --- |
| Control de opción cíclica | Seis toggles actuales comparten lectura/ciclo/etiqueta | Helper de opciones + presentación parametrizada; no hace falta un generador general de formularios |
| Modelo y vista de ajustes de estudio | Repertorios y colecciones tácticas usan la misma pantalla con defaults distintos | Compartir componente y modelo, parametrizando las diferencias; no duplicar la plantilla por tipo de estudio |
| Indicador de recorrido | Smart, posiciones falladas y recorridos de capítulos actualizan mensajes y visibilidad | Compartir presentación conservando reglas y textos específicos de cada recorrido |
| Proyección de progreso de capítulos | Panel Alpine y selector de capítulos reciben `study-progress-updated` | Extraer la preparación común de datos que ya comparten; conservar el evento y los consumidores existentes |
| Explicaciones de jugadas | Read y práctica muestran el mismo formato, con distintas políticas de revelación | Compartir el renderizado; no asumir que el formulario de comentarios del editor tiene el mismo contrato |
| Controlador de contexto de posición | Smart y práctica de errores ya usan `presentPracticePosition` | Extraer el adaptador que sigue en `study.js`, reutilizando `replayPositionContext`; no crear otra implementación de reproducción |

Un controlador Smart, un coordinador de capítulos o un módulo de reset también
pueden mejorar el aislamiento, aunque todavía tengan un único consumidor.
Eso es modularización; no demuestra por sí solo reutilización entre pantallas.
El control de profundidad también tiene inicialmente un solo lugar de montaje.

## Qué conservar fuera de Alpine

- Evaluación de jugadas, promociones, selección de continuaciones, NAG/trampas,
  scheduling, recuperación y registro de resultados.
- Instancias de `Chess`, Chessground, árboles PGN completos, catálogos, workers
  y operaciones de almacenamiento. No convertirlos en un store reactivo global.
- Las animaciones del tablero, formas y overlays: requieren sus APIs imperativas.
- La persistencia mediante `StorageAdapter`, con hidratación, identidades y
  sincronización actuales. El mecanismo de persistencia de Alpine no sustituye
  ese contrato.
- Modales y pestañas Bootstrap, junto con sus eventos de foco, cierre y bloqueo.

`analysis/game_replay.js` ya resuelve reproducción lineal con posiciones cacheadas;
la práctica de estudios tiene variaciones, puntuación y selección de respuestas.
No hay evidencia para sustituir ambas por un único reproductor. `game_progress.js`
ya comparte evidencia procedente de partidas y objetivos de práctica dirigida.
`training_moves.js` ya concentra la separación de respuestas esperadas. Ninguno
necesita envolverse otra vez para reducir visualmente el tamaño de `study.js`.

## Acoplamientos y condiciones de extracción

1. **Inicialización.** `Alpine.start()` ocurre en la línea 48, antes de las
   variables locales y de la hidratación asíncrona de `main`. Los nuevos
   componentes deben registrarse antes del arranque y recibir un estado listo
   cuando exista. Leer directamente variables aún no inicializadas o persistir
   defaults desde `init()` puede alterar las preferencias hidratadas.
2. **Un propietario por estado.** Sustituir las escrituras manuales de un control
   cuando pase a Alpine. No mantener a la vez `hidden`, `x-show` y handlers
   imperativos compitiendo por su presentación. Los componentes envían comandos;
   el motor confirma el estado que deben mostrar.
3. **Globals y cambios de modo.** `window.chess`, `window.trees`, `window.chapter`,
   `window.curr_move`, la configuración de la plantilla y varios módulos comparten
   estado implícito. Read, Sparring y práctica pueden reemplazarlo. La primera
   entrega debe encapsular el acceso sin cambiar simultáneamente esos contratos.
4. **Cancelación.** `trainingSessionId` invalida respuestas y pausas al cambiar
   de contexto. Debe conservarse en jugadas, trampas, contexto y autoavance.
5. **Ciclo de vida.** `main` instala listeners y un temporizador de revisiones,
   pero no devuelve un teardown general. `setupStudySessions` ya ofrece
   `destroy()`; varios otros adaptadores solo exponen `update()`. No hay aquí
   prueba de duplicación en una carga normal, pero un remontaje exige propagar
   limpieza de listeners, timers y recursos de cada adaptador.
6. **Pruebas acopladas al archivo.** `study_navigation.cjs`, `smart_controls.cjs`
   y `weak_practice_mode.cjs` extraen funciones de `study.js` mediante AST o slices.
   Las extracciones deberán migrar esas pruebas a imports de los nuevos módulos,
   manteniendo escenarios de dominio y las regresiones de navegador.

El análisis de bindings detecta siete nombres sin referencias locales:
`Chessground`, `string_hash`, `clear_local_storage`, `tree_value`, `need_hint`,
`value_sort` y `chapterMastery`. Son candidatos a una limpieza separada; esto no
demuestra que sus módulos completos estén sin uso ni permite retirar efectos de
carga sin revisar sus otros consumidores.

## Orden propuesto

| Entrega | Trabajo | Riesgo relativo | Verificación necesaria |
| --- | --- | --- | --- |
| 1 | Modelo de preferencias y componente Alpine de ajustes; conservar inicialmente el formato guardado | Bajo/medio | Hidratación, persistencia, idiomas, defaults de tácticas, pistas y comentarios; navegador de ajustes y recorrido del jugador |
| 2 | Componente de profundidad sobre el modelo de alcance existente | Medio | `practice_scope.cjs`, `study_navigation.cjs`, cambio de capítulo, sentinel de máximo, reinicio al cerrar y ausencia de reinicio en Read |
| 3 | Proyección de progreso y presentación de indicadores; aprovechar el panel Alpine actual | Medio | Métricas, orden, timer de vencimientos, selección de capítulos, mensajes vacíos de Smart y sesiones |
| 4 | Selección de comentarios separada de su renderizado | Medio | Texto PGN no confiable, variantes, Read, visualización oculta y calificación de ayuda |
| 5 | Extraer coordinación de recorridos y contexto; después dividir `handle_move` | Alto | Smart, errores, capítulos débiles, revisiones, Sparring, trampas, underpromotion, ayuda, cancelación y práctica dirigida |
| 6 | Reducir `main` a composición y formalizar teardown de página | Alto | Identidad de progreso, resets, hidratación/merge, navegación, remount y ausencia de recursos duplicados |

No es necesario completar estas seis entregas antes de obtener beneficios.
La primera elimina el uso del texto visible como controlador de preferencias y
establece una frontera de interfaz sin reescribir la validación de jugadas.

Para cada entrega de implementación: pruebas de contrato de lo extraído,
regresiones de navegador pertinentes y compilación. Cuando cambie la propiedad
del renderizado, comparar geometría, temas, foco y teclado sin introducir cambios
de layout. No se promete una reducción de tokens ni un objetivo arbitrario de
líneas para el archivo.

## Alcance de la validación de esta auditoría

Lectura de funciones, templates, adaptadores y consumidores; análisis del AST de
`study.js` para tamaños y bindings. No se ejecutaron entrenamientos, benchmarks ni
suites funcionales para este documento. Los riesgos descritos son condiciones de
refactorización, no nuevas regresiones reproducidas.
