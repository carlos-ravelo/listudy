# Plan de migración de componentes a Bootstrap

Fecha: 2026-10-21. Rama: `migration/bootstrap-ui`. Análisis inicial y biblioteca
personal migrados; fase 3 iniciada con la detección común de diálogos bloqueantes.
Los diálogos de entrenamiento todavía utilizan sus contenedores originales.

## Pendientes y siguiente entrega

- [x] Recursos separados, modal compartido, navegación y tema común.
- [x] Página inicial de análisis e importación PGN (fase 1).
- [x] Biblioteca personal: grupos, mover estudios y menús (fase 2).
- [x] Normalización de controles en los diálogos ya migrados.
- [x] Detección común de diálogos para tiempo, atajos y feedback de entrenamiento.
- [ ] Fase 3: trasladar ajustes, información, historial Sparring y progreso a
  `ui_modal`; sustituir las pestañas manuales y adaptar los eventos de cierre.
- [ ] Fase 3: preparar los estilos necesarios y activar el layout Bootstrap en
  la página de entrenamiento; verificar profundidad, revisiones y modos de juego.
- [ ] Fase 4: colecciones y selector de aperturas, conservando borradores.
- [ ] Fase 5: extender componentes comunes al editor, creación, mantenimiento y
  restantes páginas de análisis; eliminar reglas visuales redundantes.
- [ ] Fase 6: migrar páginas heredadas y retirar Skeleton y el gestor antiguo
  cuando no queden consumidores.
- [ ] Incorporar hooks de montaje/destrucción cuando se migre una página LiveView.
- [ ] Después de la migración de componentes: análisis de reutilización de JS.

La siguiente entrega de interfaz es la fase 3. Su preparación no significa que
sus cuatro diálogos estén migrados. La biblioteca simplificada de tácticas y las
demás páginas sin activar Bootstrap conservan sus recursos anteriores.

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
recursos Bootstrap que análisis. La biblioteca simplificada de tácticas mantiene
su layout anterior. Las filas compartidas conservan su diseño y comportamiento
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
prepara el cambio de contenedores de fase 3, sin activarlo todavía ni cambiar la
distribución de entrenamiento.

`blocking_ui_browser.cjs` comprueba estos contratos con los consumidores reales
y el plugin Bootstrap, incluyendo transiciones, inicialización repetida y
reemplazo de nodos. Las regresiones de sesiones leen ahora la plantilla extraída
de ajustes y seleccionan su pestaña Practice antes de editar la meta.

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
| 2 | Completada para biblioteca personal | Biblioteca: carpetas, mover estudios y menús | Reutilizar el diálogo y unificar menús de acciones |
| 3 | En preparación; contenedores pendientes | Estudios: ajustes, información, historial Sparring y progreso | Migrar los contenedores y pestañas preservando el entrenamiento |
| 4 | Pendiente | Colecciones y selector de aperturas | Sustituir gestión manual de foco y cierre preservando borradores |
| 5 | Parcial: diálogos migrados normalizados | Botones, formularios y superficies del fork | Unificar variantes y eliminar reglas redundantes |
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
