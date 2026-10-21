# Plan de migración de componentes a Bootstrap

Fecha: 2026-10-21. Rama: `migration/bootstrap-ui`. Análisis inicial y biblioteca
personal y entrenamiento migrados. Los cuatro diálogos de entrenamiento usan
Bootstrap. Colecciones y selector de aperturas completan la fase 4; creación
y mantenimiento cargan ahora sus propios recursos Bootstrap. El editor de capítulos
y la creación desde cero también usan recursos Bootstrap separados. Partidas,
comparación y práctica de errores completan la migración de páginas de análisis.
La biblioteca simplificada de tácticas también usa el layout compartido.

## Pendientes y siguiente entrega

- [x] Recursos separados, modal compartido, navegación y tema común.
- [x] Página inicial de análisis e importación PGN (fase 1).
- [x] Biblioteca personal: grupos, mover estudios y menús (fase 2).
- [x] Normalización de controles en los diálogos ya migrados.
- [x] Detección común de diálogos para tiempo, atajos y feedback de entrenamiento.
- [x] Fase 3: trasladar ajustes, información, historial Sparring y progreso a
  `ui_modal`; sustituir las pestañas manuales y adaptar los eventos de cierre.
- [x] Fase 3: preparar los estilos necesarios y activar el layout Bootstrap en
  la página de entrenamiento; verificar profundidad, revisiones y modos de juego.
- [x] Fase 4: colecciones con modal compartido, conservando borradores.
- [x] Fase 4: selector de aperturas y recursos Bootstrap de creación y mantenimiento.
- [x] Fase 5: editor de capítulos y creación desde cero con recursos Bootstrap.
- [x] Fase 5: partidas importadas, comparación y práctica de errores.
- [x] Biblioteca simplificada de tácticas con buscador y preferencias compartidos.
- [ ] Fase 5: completar la limpieza de estilos y variantes de creación,
  mantenimiento y demás páginas migradas.
- [ ] Fase 6: migrar páginas heredadas y retirar Skeleton y el gestor antiguo
  cuando no queden consumidores.
- [ ] Incorporar hooks de montaje/destrucción cuando se migre una página LiveView.
- [ ] Después de la migración de componentes: análisis de reutilización de JS.

La siguiente entrega corresponde a la convergencia de estilos y variantes de
las páginas migradas: centralizar las variables de campos y botones secundarios,
unificar sus adaptadores y retirar las reglas sin consumidores comprobados.
Estas tareas del fork tienen prioridad sobre las páginas heredadas de fase 6.

## Primera entrega

Bootstrap 5.3.8 y Popper 2.11.8 están fijados en `assets/package.json`. El lockfile
local se actualizó; sigue excluido de Git por la política existente del repositorio.
La primera entrega activó el layout `bootstrap.html` y los recursos `bootstrap_ui`
en la página inicial de análisis. El resto se incorpora por entregas independientes.

La entrega reutiliza la navegación y el pie existentes, extrae los campos de
preferencias de sonido y tablero a plantillas compartidas y utiliza `ui_modal`
para esas preferencias y la importación PGN. El cambio de tema comparte módulo
con el bundle anterior. Se conservan las rutas, formularios, filtros y lógica de
sincronización, revisión y entrenamiento.

La base visual conserva los estilos del fork y su escala tipográfica sin cargar
Skeleton ni `app.scss` en análisis. La limpieza de estilos por componente de la
fase 5 sigue pendiente; no se presenta esta entrega como una migración completa.
Los hooks para LiveView se incorporarán cuando haya una página LiveView migrada.

Validación del servidor: 16 pruebas del proyecto de análisis y recorrido del
jugador pasaron; otras 11 ejecuciones de referencia generaron las páginas
comparables antes/después. La comprobación visual cubre 1280, 900, 390 y 320 px
en claro y oscuro, conservando las dimensiones y posiciones de las regiones
principales. La prueba `bootstrap_analysis_browser.cjs` verifica modales, foco,
Escape, backdrop, PGN, filtros, preferencias y navegación móvil.

Limitación detectada: `analysis_training_browser.cjs:202` espera que
`#smart_run_status` sea visible al volver a practicar una línea. Esa comprobación
falla tanto con la página anterior como con la migrada; esperar a su visibilidad
también agota el tiempo. Los pasos anteriores de revisión, sincronización y
análisis completan su ejecución. El fallo no se da por resuelto ni se modifica
la lógica Smart dentro de esta entrega.

Después de la migración de interfaz queda pendiente la auditoría de reutilización
de funciones JavaScript solicitada por el usuario.

## Segunda entrega: biblioteca

La biblioteca personal (`/[locale]/studies`) utiliza ahora el mismo layout y
recursos Bootstrap que análisis. La biblioteca simplificada de tácticas mantuvo
su layout anterior en esta entrega y se incorpora en la entrega específica
descrita más adelante. Las filas compartidas conservan su diseño y comportamiento
también cuando aparecen en páginas que todavía no utilizan Bootstrap.

Los diálogos de grupos y movimiento reutilizan `ui_modal`; sus formularios se
definen una vez y las operaciones conservan los permisos y contratos existentes.
Los menús utilizan Bootstrap Dropdown manteniendo los elementos `details` y
`summary` actuales, sin moverlos ni cambiar su composición visual. Se mantiene
el menú abierto ante errores de guardado para permitir reintentar la acción.

La lógica de biblioteca recibe un adaptador de controles: Bootstrap gestiona
apertura, cierre y teclado; filtros, favoritos, selección y peticiones siguen
perteneciendo al módulo existente. Se conserva el foco dentro del diálogo cuando
un guardado deshabilita temporalmente los controles. El flujo de crear la primera
carpeta y después mover los estudios abre un único modal cada vez.

Validación: 29 pruebas del servidor de biblioteca, tácticas, análisis y recorrido
del jugador pasaron. El recorrido de navegador de biblioteca cubre filtros,
favoritos, selección múltiple, permisos, errores, grupos, renombrado, borrado,
persistencia y movimiento de estudios. La comparación antes/después verifica
las regiones principales a 1280, 900, 390 y 320 px en claro y oscuro, además del
diálogo de grupos y los controles de teclado y foco.

Los controles y diálogos de entrenamiento pertenecen a la fase 3; no se migraron
dentro de la entrega de biblioteca.

## Normalización de controles migrados

Antes de extender la migración a entrenamiento, se adopta una base común de
controles Bootstrap en los diálogos de biblioteca, PGN y preferencias. Los campos
de creación y renombrado de grupos usan `form-control`; los selectores usan
`form-select`; las acciones usan las variantes primaria y secundaria. Sonido
utiliza los controles de checkbox y rango de Bootstrap en las páginas migradas.
Las páginas con recursos heredados conservan sus controles anteriores.

`bootstrap_controls.scss` concentra el tamaño mínimo de 44 px, el tema de los
campos y las acciones secundarias. Se elimina la excepción `content-box` que
hacía más altos los campos de grupos y las reglas que anulaban los controles
Bootstrap de PGN y preferencias. La distribución de las páginas se mantiene;
los diálogos ajustan su altura al contenido normalizado. Las comprobaciones
visuales conservan la comparación de las regiones principales y comprueban
tamaños consistentes y ausencia de desbordamiento en los controles.

## Preparación de entrenamiento

`blocking_ui.js` centraliza la detección de diálogos abiertos. Navegación de
estudios, tiempo de práctica y feedback utilizan la misma condición. Reconoce
diálogos nativos, modales heredados visibles, colecciones y Bootstrap durante
sus transiciones de apertura y cierre. Un observador por documento actualiza
`data-ui-blocked` y notifica cambios; sigue funcionando al insertar o retirar
diálogos y cuando varios bundles importan el módulo.

Mientras exista un diálogo bloqueante, el tiempo de práctica y la caducidad de
avisos temporales se pausan, los atajos no avanzan el tablero y el feedback queda
oculto. Cerrar un diálogo no desbloquea la página si queda otro abierto. Esto
preparó el cambio de contenedores de fase 3, sin activarlo en esa entrega ni
cambiar la distribución de entrenamiento.

`blocking_ui_browser.cjs` comprueba estos contratos con los consumidores reales
y el plugin Bootstrap, incluyendo transiciones, inicialización repetida y
reemplazo de nodos. Las regresiones de sesiones leen ahora la plantilla extraída
de ajustes; la suite de Bootstrap verifica la selección contextual de pestañas.

## Tercera entrega: entrenamiento

La página de estudio, incluidos los estudios de tácticas, activa el layout propio
con `bootstrap_study.js` y `bootstrap_study.css`. Comparte `bootstrap_common.js`
con análisis y biblioteca; carga una sola instancia de los plugins y no incorpora
Skeleton, `app.scss`, `app.js` ni el gestor antiguo de modales. Los estilos de
estudio y colecciones necesarios se incluyen por separado. La composición del
tablero, sidebar y navegación se mantiene.

Ajustes, información/comentarios, historial Sparring y progreso usan `ui_modal`.
Sus cuerpos están en parciales y conservan IDs, traducciones, formularios y
ámbitos Alpine. Las pestañas General/Practice/Sparring usan Bootstrap Tab, con
selección contextual y navegación por teclado; Sparring oculto en tácticas se
excluye también del recorrido de teclado. Se retiran la selección manual de
pestañas y los listeners de apertura, backdrop y retorno de foco sustituidos.

Los consumidores de progreso cierran mediante la API del modal compartido;
el cierre de ajustes mantiene la aplicación de cambios de profundidad. Los
controles de los diálogos reutilizan la normalización común; los cierres tienen
un objetivo mínimo de 44 px. Colecciones conservaba su contenedor en esta entrega; su migración
se registra a continuación en fase 4. No se migra el selector especializado de capítulos a un dropdown genérico.

`bootstrap_study_browser.cjs` compara las regiones principales en 1280, 900,
390 y 320 px, en claro y oscuro. Verifica pestañas, profundidad, metas de sesión,
comentarios, historial, navegación desde progreso, retorno del foco y móvil.
`sparring_browser.cjs` utiliza ya los plugins de Bootstrap en sus diálogos de
ajustes e historial. Las regresiones de sesiones y práctica débil siguen cubriendo
sus contratos de dominio. `bootstrap_tactics_browser.cjs` verifica el entrenamiento
con negras, preferencias separadas, lectura, progreso y exclusión de la pestaña
Sparring oculta del recorrido de teclado. El fallo previo de Smart descrito en la primera
entrega sigue registrado y no se da por corregido en esta migración.

La suite general `player_journey_browser.cjs` se detiene antes de probar los
estudios: en la portada espera nueve `.home-daily-study` y obtiene dos con las
fixtures generadas por `player_journey_test.exs`. No se altera esa expectativa
en esta entrega. La cobertura de entrenamiento se ejecuta directamente mediante
las suites de estudio, tácticas y Sparring. `site_navigation_browser.cjs` también
se detiene antes de abrir entrenamiento: espera un menú de portada
`.site-menu[data-nav-section="practice"]` que no está en la cabecera renderizada.
Las comprobaciones de foco y apertura de los nuevos diálogos se ejecutan en
`bootstrap_study_browser.cjs`.

Tamaños gzip de esta compilación: `bootstrap_study.css`, 32 420 bytes;
`bootstrap_study.js`, 25 295 bytes. El CSS heredado completo ocupa 35 180 bytes
gzip; `bootstrap_ui.css`, 23 459 bytes, y `bootstrap_ui.js`, 23 721 bytes. El
motor de estudio continúa en su bundle independiente de 149 869 bytes gzip.
Estas medidas describen los recursos; no representan ahorro de tokens.

## Fase 4: entrega de colecciones

`collection_modal` reutiliza `ui_modal`, con el cuerpo y la información de
cabecera extraídos a parciales. El modal común admite contenido adicional de
cabecera y un ID opcional para su botón de cierre. Se mantienen sidebar, lista,
formulario de creación y pie de estado en las posiciones existentes.

`study_collections.js` conserva organización, persistencia y recuperación de
errores. Solicita la apertura mediante `dialog_lifecycle.js`; Bootstrap gestiona
Escape, backdrop, scroll, foco contenido y retorno al disparador. Se retiran el
focus trap y los listeners de cierre propios, además de estilos del contenedor
y cabecera sustituidos. El cuerpo no se destruye al cerrar: el formulario,
título y color del borrador siguen disponibles al volver a abrir.
Si falla la creación después de deshabilitar el botón de envío, se recupera el
foco dentro del modal para mantener disponibles Escape y el reintento.

`bootstrap_collections_browser.cjs` utiliza la página renderizada y comprueba
organización, mover capítulos, renombrado, error y reintento de guardado,
exportación PGN, conservación de borrador, error de creación, foco, cierre,
persistencia y temas en escritorio/móvil. `study_features_browser.cjs` comprueba
colecciones de invitado con el mismo plugin Bootstrap y navegación por capítulos.
Los controladores siguen comprobando acceso y creación de estudios.

El selector de aperturas quedó pendiente en la entrega de colecciones. Su
migración se completa en la entrega descrita a continuación.

## Fase 4: selector de aperturas y formularios

El selector usa `ui_modal` y el parcial `_opening_options.html.eex`. Alpine
conserva búsqueda normalizada, selección y actualización del campo oculto;
`dialog_lifecycle.js` delega apertura y cierre a la única instancia de Bootstrap
del recurso común. Se conservan los borradores de metadatos y capítulos al abrir,
cancelar o seleccionar una apertura. Enter en la búsqueda no envía el formulario.

Creación por importación y mantenimiento usan el layout Bootstrap con recursos
`bootstrap_management.js` / `bootstrap_management.css`, sin `app.js`, Skeleton,
jQuery ni Select2. La carga de estos dos últimos no tenía inicialización efectiva
y se retira. El editor de tablero y la creación desde cero se incorporan en
la entrega de fase 5 descrita a continuación.
Los errores HTML de creación conservan estos recursos, y los errores de campo
renderizados por Phoenix siguen visibles pese al `display: none` predeterminado
de Bootstrap para `.invalid-feedback`. El script de Alpine tiene URL versionada
para evitar ejecutar una copia antigua que todavía espere un `dialog` nativo.

Se mantienen columnas, paneles y orden de los formularios, normalizando campos y
acciones a las variantes Bootstrap. El alcance no incluye cambiar sus layouts.
La prueba `bootstrap_management_browser.cjs` compara anchos y columnas en 1280,
900, 390 y 320 px, con ambos temas, y verifica búsqueda, selección, Escape,
backdrop, foco, borradores, guardado con error y respuesta HTML de validación.
`study_maintenance_browser.cjs` conserva la regresión de renombrado, ordenación,
duplicación, borrado, conflictos y guardado de capítulos.

## Fase 5: editor y creación desde cero

El editor de capítulos y `source=blank` usan el layout Bootstrap con recursos
`bootstrap_editor.js` / `bootstrap_editor.css`. Comparten navegación, preferencias,
tema y variantes de campos y botones; `study_editor.js` conserva una única
inicialización de Alpine y tiene URL versionada. Estas páginas ya no cargan
Skeleton ni `app.js`. El tablero, el árbol de variantes, la promoción y la
composición de posiciones mantienen sus componentes especializados y su distribución.

Los atajos y la copia de jugadas respetan los diálogos bloqueantes compartidos.
Al abrir preferencias se evita que Ctrl/Cmd+Z sobre el contenedor del diálogo
haga que Chrome deshaga el último comentario del editor; los campos del propio
diálogo conservan su edición nativa. Se mantienen borradores y la recuperación
tras errores de guardado.

La comparación de regiones cubre 1280, 900, 390 y 320 px en claro y oscuro para
edición, creación de repertorio y creación de tácticas. Las pruebas del editor y
creación cubren historial, variantes, promociones, composición de posiciones,
análisis local Stockfish y guardado. La limpieza transversal de estilos sigue
pendiente; la fase 5 permanece parcial. Las páginas restantes de análisis se
incorporan en la entrega siguiente.

Validación: 16 pruebas del servidor; cuatro pruebas unitarias de carga, historial,
promoción y composición; `chapter_editor_browser.cjs`,
`study_creation_browser.cjs` y `bootstrap_editor_browser.cjs`. El build de
producción conserva las advertencias existentes de Sass y tamaño de recursos.

## Fase 5: partidas, comparación y práctica de errores

Todas las páginas de análisis usan ahora el layout Bootstrap: partidas importadas,
comparación de partidas guardadas, comparación de un PGN cargado, resultados sin
coincidencias y práctica de errores. Comparten `bootstrap_analysis.js` /
`bootstrap_analysis.css`, navegación, preferencias y controles, sin cargar
Skeleton ni `app.js`. El recurso de la página inicial sigue siendo `bootstrap_ui`.
Se mantienen las columnas, las dimensiones del tablero, los grupos de capítulos,
los filtros y la lógica de revisión. Los scripts de reproducción y práctica
llevan versión para evitar reutilizar código anterior desde caché.

Los atajos de reproducción consultan `hasBlockingUi`, también durante las
transiciones de los diálogos. La práctica usa el mismo detector y sus eventos
para excluir de la sesión el tiempo dedicado a preferencias. Sus controles,
pistas, respuestas, resúmenes y datos de progreso conservan su comportamiento.

Validación: 14 pruebas del servidor; pruebas unitarias de progreso de partidas,
sesiones y movimientos aceptados; regresión de comparación y la prueba
`bootstrap_analysis_workspace_browser.cjs`. Esta última compara las regiones
antes/después a 1280, 900, 390 y 320 px en claro y oscuro, y verifica atajos,
preferencias, pausa del tiempo, pistas, respuestas, resumen, filtros y estados
vacíos, sin coincidencias y PGN cargado. El build de producción pasa con las
advertencias existentes de Sass y tamaño de recursos.

La regresión general `analysis_training_browser.cjs` conserva el fallo previo en
la línea 202: espera visible `#smart_run_status` al volver a la práctica de una
línea. Los pasos anteriores de práctica correcta, progreso compartido y
sincronización pasan. Ese fallo sigue registrado y no se da por resuelto.

## Biblioteca simplificada de tácticas

El centro de tácticas usa el layout Bootstrap con `bootstrap_tactics.js` /
`bootstrap_tactics.css`. Reutiliza `bootstrap_common.js`, la plantilla de
biblioteca, su buscador simplificado y los diálogos comunes de preferencias,
sin `app.js` ni Skeleton. Los ejercicios incluidos, las colecciones propias y
guardadas y los enlaces de visualización conservan su distribución. No se añaden
las funciones de organización de la biblioteca personal a este centro.

El componente `puzzle_filters` recibe una opción explícita `bootstrap` para
normalizar campos y botón de práctica cuando lo consume esta página. Su valor
predeterminado mantiene compatibles los consumidores LiveView pendientes de
migración; el componente no inspecciona las asignaciones internas del socket.
Los estilos comunes de enlaces de visualización se extraen a
`features/tactics_discovery.css`, usado por ambos sistemas de recursos.

Validación: 25 pruebas de servidor para biblioteca, clasificación, catálogo,
filtros y LiveView. `bootstrap_tactics_library_browser.cjs` compara regiones a
1366, 900, 390 y 320 px en claro y oscuro, con colecciones y como invitado, y
verifica búsqueda inicial, resultados vacíos, restablecimiento, colecciones
guardadas, preferencias, enlaces y envío de filtros con valores seleccionados.
La regresión de descubrimiento cubre también las guías y herramientas que siguen
usando el layout anterior. Su comprobación de regiones ahora mide los dos
paneles visibles, en lugar de pedir un único elemento a un selector múltiple.
El build de producción pasa con las advertencias de Sass y tamaño de recursos.

## Objetivo y alcance

Reducir HTML, CSS y JavaScript repetidos mediante Bootstrap 5.3 y plantillas
compartidas de Phoenix. Priorizar la interfaz añadida o ampliada en este fork.
Alpine conserva el estado de aplicación; Bootstrap gestiona sus controles de UI.

Restricción de diseño acordada: conservar la distribución visual actual,
navegación y tema. La separación del layout se refiere a su plantilla técnica y
recursos, no a un rediseño. Adoptar los controles y comportamientos de Bootstrap
cuando mejoren la implementación; está autorizada la normalización de campos,
botones, espaciado interno y estados de foco. No conservar excepciones heredadas
solo para reproducir inconsistencias anteriores. Comparar capturas antes/después
y verificar la composición de las pantallas y sus funciones. Cualquier propuesta
de cambio en la distribución debe consultarse con el usuario antes de aplicarla.
Las guías de diseño no autorizan cambios de layout.

«Páginas actuales del fork» significa las páginas que tenemos hoy, después de
nuestros cambios: biblioteca, análisis, editor y entrenamiento. Se adaptan esas
mismas plantillas a Bootstrap, conservando sus rutas y funciones. No se crean
copias paralelas de las páginas. «Heredado» identifica las piezas del proyecto
original que todavía utilizan, como Skeleton, el layout base y algunos controles.

Las páginas migradas utilizarán un layout propio con recursos Bootstrap y nuestro
tema, sin cargar Skeleton ni el conjunto global de estilos y scripts heredados.
Se reutiliza la lógica de aplicación y se extraen los módulos compartidos que
necesiten ambos layouts. La separación se hace por página completa para evitar
mantener dos sistemas globales de estilos dentro de una misma página.

La prioridad se establece por origen, reutilización y riesgo, no solo por pantalla:
una página heredada puede contener componentes nuevos del fork.

No se migran en estas fases los motores, el procesamiento PGN, almacenamiento,
FSRS, legalidad de movimientos ni el funcionamiento del tablero. El selector de
promoción, árbol de jugadas y selector de capítulos ya compartidos conservan sus
APIs; solo se revisará su presentación cuando corresponda.

## Evidencia del fork

Referencia de esta revisión: HEAD `4db28cdd`. Comparación con la referencia local
`upstream/master`; ancestro común `83e0a955f843cdeb11e443417f93f8dabacca226`.
No se ha actualizado la referencia remota. Ese ancestro incluye integraciones
de upstream y no se presenta como la fecha original de creación del fork.

Hitos propios comprobados en el historial:

| Área | Evidencia | Clasificación |
| --- | --- | --- |
| Análisis de partidas | `e83cbf49`, 2026-06-18 | Añadido en el fork |
| Colecciones | `17ba2593`, 2026-09-27 | Añadido en el fork |
| Biblioteca compacta | `d1b02af8`, 2026-10-07 | Añadido en el fork |
| Diálogos de ajustes e información | `b2599986`, 2026-10-14 | Ampliación propia de estudios |
| Sparring | `9d66cbd8`, 2026-10-16 | Añadido en el fork |
| Tema de práctica | `b320fe5f`, 2026-10-17 | Estilos propios compartidos |
| Selector de capítulos compartido | `5fe2df1d`, 2026-10-19 | Reutilización propia que conservar |
| Gestor antiguo de modales | `987540c2`, 2020-09-26 | Heredado; compatibilidad inicial |
| Skeleton | `b60bde49`, 2020-06-26 | Heredado; retirada posterior |

## Orden de ejecución

Cada fase debe producir un cambio revisable y reversible. Las fases siguientes
dependen de que la integración y la limpieza de la anterior estén verificadas.

| Fase | Estado | Alcance | Resultado exigido |
| --- | --- | --- | --- |
| 0 | Base implementada; hooks LiveView cuando aplique | Layout propio y recursos Bootstrap separados de los heredados | Compilación selectiva, tema único y dependencias compartidas identificadas |
| 1 | Completada | Página inicial de análisis e importación PGN | Primera página con layout Bootstrap y diálogo compartido en uso real |
| 2 | Completada: biblioteca personal y biblioteca simplificada de tácticas | Biblioteca: carpetas, mover estudios y menús | Reutilizar el diálogo y unificar menús de acciones |
| 3 | Completada | Estudios: ajustes, información, historial Sparring y progreso | Migrar los contenedores y pestañas preservando el entrenamiento |
| 4 | Completada | Colecciones y selector de aperturas | Sustituir gestión manual de foco y cierre preservando borradores |
| 5 | Parcial: páginas de análisis, diálogos, creación, mantenimiento y editor | Botones, formularios y superficies del fork | Unificar variantes y eliminar reglas redundantes |
| 6 | Pendiente | Componentes heredados y retirada de Skeleton | Completar la convergencia después de estabilizar el fork |

## Fase 0: integración y reglas comunes

- Fijar una versión exacta de Bootstrap 5.3 al implementar y actualizar el lockfile
  principal de `assets`. Incorporar Popper si lo necesitan los menús elegidos.
- Usar el Webpack y Sass existentes con entradas propias para el layout Bootstrap.
  Importar únicamente componentes necesarios. Rejilla, contenedores y estilos
  base se incorporan según las necesidades de las páginas migradas.
- Separar la carga de CSS y JavaScript en los layouts y sus cabeceras. El layout
  Bootstrap no debe importar `app.scss` ni cargar el `app.js` heredado completo.
  Extraer sus funciones necesarias, como preferencias de tablero y sonido,
  navegación y tema, a módulos compartidos sin dependencias de Skeleton.
- Auditar cabecera, pie, mensajes flash y ajustes globales antes del piloto.
  Adaptar las piezas necesarias al nuevo layout reutilizando sus datos y lógica.
  Mantener el layout anterior para las páginas pendientes de migración.
- Comprobar los recursos y CSS emitidos: `.modal`, `.container` y `.alert` tienen
  nombres compartidos entre ambos sistemas. El gestor de
  `assets/js/components/modal.js` y el CSS de modales heredados no deben cargarse
  en páginas Bootstrap. Contemplar el backdrop y los cambios de scroll del body.
- Centralizar colores, espaciado, radios, foco y tamaños en un archivo de tema.
  Conectar el `data-theme` existente con `data-bs-theme`; no crear otra preferencia.
- Crear el mínimo de infraestructura compartida: plantilla de modal con título,
  contenido y acciones; variantes de botón; inicialización y limpieza de plugins.
  Mantener IDs únicos y traducciones. Evitar un nuevo framework de componentes.
- Definir un único mecanismo para saber si un modal bloquea la interacción.
  Durante la transición debe reconocer diálogos nativos, modales heredados,
  colecciones y modales Bootstrap, incluidos sus estados de transición.
- Adaptar `study_sessions.js`, `study_page_controls.js` y los selectores de
  visibilidad de feedback que hoy dependen de `dialog[open]` o estilos inline.
- Hacer la inicialización idempotente. Para nodos reemplazados por LiveView,
  usar hooks de montaje y destrucción y liberar instancias y listeners.
- Cada control tiene un solo propietario de apertura, cierre y selección:
  Bootstrap. Alpine se comunica mediante su API y eventos cuando sea necesario.

Salida: layout y recursos propios preparados, build correcto y comprobación de
que las páginas pendientes siguen usando sus recursos anteriores. La fase 1
valida el nuevo layout sobre una página real.

## Fase 1: piloto en análisis

Archivos principales: `templates/analysis/index.html.eex`,
`assets/js/analysis_overview.js` y `analysis_presentation.css`.

Adaptar la plantilla actual de análisis al layout Bootstrap, incluyendo botones,
formularios y estructura necesarios para que funcione sin Skeleton. Revisar las
dependencias de sus estilos antes de trasladarlos al nuevo conjunto de recursos.
Las demás páginas de análisis cambian de layout cuando estén adaptadas.

Migrar el diálogo de importación PGN a la plantilla común. Conservar envío,
validación y texto introducido tras errores. Reemplazar el cierre manual por
coordenadas y la restauración de foco por el comportamiento del componente y
sus eventos. Mantener el enfoque inicial del textarea.

Verificar Escape, backdrop, foco inicial, retorno al disparador, scroll móvil,
etiquetado accesible, tema oscuro y ausencia de listeners duplicados.
Registrar CSS/JS añadido y eliminado y tamaño comprimido de los assets.
Continuar con las fases posteriores si la solución permite eliminar código
propio sin acumular una segunda capa de excepciones visuales.

## Fases 2 a 4: comportamientos compartidos

Biblioteca: `study/index.html.eex`, `components/study_library.js` y
`study_library.css`. Conservar selección múltiple, filtros, favoritos, permisos
y resultados de las peticiones. El flujo mover → crear carpeta → volver a mover
debe cerrar un modal antes de abrir el siguiente; no apilar modales Bootstrap.
Preservar el foco del disparador incluso si se vuelve a renderizar una fila.

Estudios: `_study_settings`, diálogo de información, `_sparring_history` y
`progress_modal` en `show.html.eex`; `study_page_controls.js` y consumidores.
Conservar la selección contextual de General/Practice/Sparring y sus eventos.
Para el modal de progreso, verificar todos sus consumidores antes de retirar
el mecanismo heredado. Los modales deben seguir pausando el tiempo de práctica,
bloqueando atajos del tablero y ocultando feedback superpuesto.

Colecciones: `_collection_modal.html.eex` y `study_collections.js`.
Conservar formularios internos, recuperación de errores, selección activa y
borradores; retirar el focus trap manual solo cuando lo reemplace Bootstrap.
Migrar después `_opening_picker.html.eex` y `study_maintenance.js`, manteniendo
la búsqueda y selección Alpine.

En cada componente migrado se adoptan también los botones y campos comunes que
necesite. Cada página cambia de layout cuando todos sus controles y superficies
necesarios funcionan sin los recursos heredados. La fase 5 completa la migración
de las restantes páginas del fork, incluyendo editor, creación y mantenimiento.

## Fase 5: convergencia visual del fork

Extender las variantes comunes a editor, creación y mantenimiento de estudios,
análisis, biblioteca y controles nuevos de entrenamiento. Reutilizar
`study_list_row.html.eex`; no reemplazarlo por otra fila específica por pantalla.

Extraer estilos compartidos de `practice_theme.css`, `study_presentation.css`,
`study_extensions.css`, `study_library.css` y `chapter_editor.css`. El tema define
los valores visuales; el componente define sus estados; cada pantalla conserva
solo su composición y las necesidades propias del dominio.

Evaluar Bootstrap Icons como decisión separada, ya que no viene incluido en
Bootstrap. Centralizar primero los SVG repetidos sin introducir otra dependencia
si el catálogo actual basta. No reemplazar el selector especializado de capítulos
por un dropdown genérico que pierda búsqueda, métricas o navegación.

## Fase 6: interfaz heredada

Dejar para esta fase libros y sus modales, formularios antiguos y estructura
general basada en Skeleton. Sonido y tablero ya usan el modal compartido en las
páginas migradas; queda retirar sus envoltorios antiguos en las demás páginas.
Los cambios de separación de recursos y extracción de módulos compartidos
pertenecen a fase 0.

Eliminar el gestor antiguo de modales cuando no tenga consumidores. Retirar
Skeleton por familias de estilos, verificando páginas de autenticación, contenido,
administración e iframes antes de borrar su importación global.

## Validación y criterio de terminado

- Registrar capturas antes/después en escritorio y móvil, con tema claro/oscuro.
- Ejecutar `npm run deploy` desde `assets` en cada entrega de implementación.
- Seleccionar pruebas existentes según lo cambiado: `study_library_browser.cjs`,
  `study_navigation.cjs`, `study_modes_browser.cjs`, `study_sessions_browser.cjs`,
  `study_feedback_browser.cjs`, `sparring_browser.cjs`,
  `study_maintenance_browser.cjs`, `study_creation_browser.cjs` y
  `chapter_editor_browser.cjs` bajo `assets/test/unit`.
- Ejecutar las pruebas de plantillas/controladores correspondientes cuando cambie
  su renderizado. Añadir cobertura específica para foco, Escape, flujo entre
  modales y reemplazo de nodos LiveView donde no exista.
- Una fase termina cuando sus flujos pasan, el teclado y foco funcionan, no hay
  doble gestión del estado y se han retirado estilos/listeners sustituidos.
- Comparar tamaño comprimido, reglas y handlers propios eliminados y número de
  lugares que hay que editar para cambiar un componente. El ahorro de tokens es
  una expectativa; medirlo solo con tareas comparables, sin prometer porcentajes.
- Revertir una fase mediante su commit; no añadir flags permanentes que mantengan
  dos implementaciones del mismo componente. Los datos y contratos de negocio
  permanecen compatibles durante la migración.

## Referencias

- [Integración oficial con Webpack](https://getbootstrap.com/docs/5.3/getting-started/webpack/).
- [Importaciones selectivas de Sass y JavaScript](https://getbootstrap.com/docs/5.3/customize/optimize/).
- [API JavaScript](https://getbootstrap.com/docs/5.3/getting-started/javascript/).
- [Modales y sus limitaciones](https://getbootstrap.com/docs/5.3/components/modal/).
- [Arquitectura actual](architecture.md).

El estado actual se registra en «Pendientes y siguiente entrega» y en la tabla
de ejecución. Los apartados de entregas detallan el alcance y sus límites.
