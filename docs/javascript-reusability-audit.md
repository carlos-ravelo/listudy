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

## Próximas extracciones recomendadas

| Prioridad | Duplicación comprobada | Propuesta | Condiciones que deben conservarse |
| --- | --- | --- | --- |
| Alta | `components/study_library.js` define la misma normalización NFD en los modos simple y completo; `study_maintenance.js` la repite para aperturas | `normalizeSearchText(value)` en un módulo pequeño de texto | Acentos, mayúsculas locales, espacios y búsquedas vacías; cada consumidor sigue decidiendo qué campos buscar |
| Alta | `modules/study_collections.js`, `modules/study/lichess_analysis.js` y `modules/sparring/study_adapter.js` crean Blob, enlace temporal y revocación diferida para PGN | `downloadPgn(pgn, filename)` | Nombre actual, tipo MIME, gesto del usuario y revocación posterior al clic; el adaptador de Lichess conserva su flujo adicional |
| Media | `study_editor.js`, `study_maintenance.js` y `modules/study_collections.js` repiten cabeceras JSON/CSRF y tratamiento de respuestas | Transporte `requestJson` compartido, con AbortSignal y errores HTTP tipados | No reintentar escrituras automáticamente; conservar conflictos 409, revisiones, cancelación, mensajes localizados y borradores en el consumidor |
| Media | `modules/study_sessions.js` y `train_mistakes.js` conectan el tracker a actividad, visibilidad, foco, bloqueo e intervalos | Adaptador de actividad que devuelva una función de limpieza | Mantener sus distintas políticas de sesión, persistencia, inactividad y salida; probar exclusión del tiempo en diálogos y ausencia de listeners/intervalos duplicados |
| Media | `study_editor.js` y `quick_result.js` comprueban elementos editables antes de ejecutar atajos | Predicado de destino editable con opciones explícitas | `contenteditable=false`, composición, selección y teclas modificadoras; resumen y diálogo siguen siendo exclusiones de cada función |

## Orden de implementación

1. Normalización de búsqueda y descarga PGN: funciones pequeñas con consumidores
   y comportamiento bien delimitados.
2. Transporte JSON: introducir primero un consumidor y cubrir fallos, conflictos
   y cancelaciones antes de extenderlo.
3. Adaptador de actividad y política de teclado: refactorizar después de contar
   con pruebas de ciclo de vida y regresiones de práctica.

No conviene unificar por apariencia métodos como `save`, `play` o `refresh`:
editor, colecciones y entrenamiento tienen contratos y estados diferentes.
Tampoco hace falta envolver las APIs de Bootstrap si el wrapper solo cambia
nombres y no elimina una política repetida.

La auditoría identifica trabajo posterior; no cambia esas funciones de dominio.
El ahorro de tokens no se ha medido. El beneficio comprobable sería reducir los
lugares que hay que leer y modificar cuando cambia un comportamiento compartido.
