# Auditoría de reutilización de JavaScript

Fecha: 2026-10-21. Revisión posterior a la migración de componentes Bootstrap.

## Ya compartido

- `bootstrap_common.js`: navegación, preferencias, tema y arranque de biblioteca.
  También conserva los filtros y la preferencia de rating del catálogo, tanto
  en páginas normales como tras actualizaciones LiveView.
- `dialog_lifecycle.js` y `blocking_ui.js`: apertura/cierre y detección de diálogos
  bloqueantes. Los consumidores conservan sus reglas de dominio.
- `color_toggles.js`: filtros de color de biblioteca y búsqueda pública. El hook
  LiveView delega eventos, tolera remontajes y elimina sus listeners al destruirse.
- `promotion_picker.js`, `chapter_picker.js`, `study_move_tree.js`: controles de
  ajedrez reutilizados sin sustituirlos por menús genéricos.
- `study/practice_sessions.js`: modelo de sesiones, objetivos y tiempo activo.
  Estudio y práctica de errores comparten el modelo.

## Extracciones completadas

- `modules/search_text.js`: `normalizeSearchText(value)` compartido por los modos
  simple y completo de biblioteca y el selector de aperturas. Los consumidores
  conservan el recorte de espacios y la selección de campos.
- `modules/download_pgn.js`: `downloadPgn(pgn, filename)` compartido por
  colecciones, Lichess y sparring. Conserva el MIME PGN y libera la URL después
  del clic; cada consumidor conserva su nombre, contenido y flujo adicional.

- `modules/request_json.js`: transporte JSON compartido por carga/guardado del
  editor, mantenimiento de capítulos, creación de estudios desde colecciones,
  organización de biblioteca y sincronización de colecciones con la cuenta.
  Centraliza credenciales, cabeceras JSON/CSRF y errores `JsonRequestError` con
  `status` y `data`. Propaga `AbortSignal`, conserva cancelaciones y no reintenta.
  Las revisiones, comprobaciones de respuestas tardías, borradores y mensajes
  permanecen en cada consumidor. Las respuestas sin JSON usan el mensaje de
  error del consumidor; las escrituras sin token CSRF se rechazan antes de enviar.
  El guardado de metadatos con `FormData` y archivos conserva su transporte actual.

- `modules/practice_activity.js`: eventos de actividad, foco, visibilidad,
  bloqueo e intervalo compartidos por estudio y práctica de errores. Devuelve
  una función de limpieza idempotente; `setupStudySessions().destroy()` también
  libera el evento de progreso y sus controles. El estudio conserva renderizado
  cada segundo, guardado cada 15 segundos y sincronización al ocultarse; errores
  conserva su intervalo de 15 segundos y su política de persistencia. Cada modo
  conserva elegibilidad, inactividad del tracker y finalización al salir. La
  práctica de errores instala el adaptador una vez durante la vida de la página.

- `modules/editable_target.js`: `isEditableTarget` compartido por navegación
  y copia del editor, por los atajos del visor de partidas y por la navegación
  del estudio. La opción
  `includeContentEditableFalse` conserva la protección más amplia del visor;
  el editor permite atajos sobre contenido estático, salvo que un antecesor
  editable siga protegido como antes. Resúmenes, diálogos, selección de texto,
  teclas modificadoras y estados del editor permanecen en cada consumidor.
  El visor y la navegación del estudio también ignoran eventos durante
  composición IME. El estudio conserva sus flechas con Shift y permite
  navegar sobre contenido estático con `contenteditable="false"`.

## Ampliación posterior

La segunda revisión encontró dos consumidores adicionales del mismo transporte:
`components/study_library.js` y `study/collection_account.js`. Ambos reutilizan
`requestJson`; no se añadió otro wrapper. La biblioteca conserva la selección y
sus mensajes localizados cuando falla una operación. `CollectionAccount` conserva
la cola de snapshots, sus revisiones y la copia local pendiente; identifica los
conflictos mediante `JsonRequestError.status === 409` y bloquea nuevas escrituras
hasta una recarga explícita, incluso si el servidor devuelve un 409 sin JSON.
Las pruebas cubren cambios durante un guardado, errores HTTP, respuestas inválidas,
recuperación y conflictos al reabrir una cuenta con cambios locales pendientes.

La navegación de `modules/study_page_controls.js` también reutiliza
`isEditableTarget`: deja de repetir la detección de campos y protege las formas
vacía y `plaintext-only` de `contenteditable`. Sus pruebas cubren composición,
modificadores, eventos cancelados, contenido estático y eventos cuyo destino es
el documento, además del bloqueo de atajos por diálogos.

## Estado

Las extracciones iniciales y las ampliaciones de transporte y navegación están
completadas. Las pruebas
cubren los consumidores y los contratos compartidos; no hay nuevas extracciones
pendientes dentro de este alcance.

## Regresiones generales revisadas

Antes de ampliar la auditoría a `study.js`, se resolvieron los tres recorridos
bloqueados documentados en el [plan de migración](bootstrap-migration-plan.md).
Las expectativas antiguas de portada, navegación y mensajes Smart se actualizaron
contra los contratos actuales y los recorridos pasan completos. También se
corrigió un fallo real de tamaño del tablero: el cálculo reserva ahora su margen
inferior existente para que los controles quepan en la altura de la ventana.
Se conserva la distribución y se verifican cambios de altura, anchura y los
entrenamientos que comparten el módulo de tablero.

## Orden de implementación

1. Completado: normalización de búsqueda y descarga PGN.
2. Completado: transporte JSON, validado primero en mantenimiento y extendido
   al editor y a creación de estudios desde colecciones.
3. Completado: adaptador de actividad, con pruebas de tiempo activo, políticas
   de persistencia, limpieza y remontaje.
4. Completado: predicado de destino editable y regresiones de atajos, copia,
   selección, composición y exclusiones propias del visor.

No conviene unificar por apariencia métodos como `save`, `play` o `refresh`:
editor, colecciones y entrenamiento tienen contratos y estados diferentes.
Tampoco hace falta envolver las APIs de Bootstrap si el wrapper solo cambia
nombres y no elimina una política repetida.

Las extracciones conservan las funciones de dominio en cada consumidor.
El ahorro de tokens no se ha medido. El beneficio comprobable sería reducir los
lugares que hay que leer y modificar cuando cambia un comportamiento compartido.
