# Auditoría de pantallas y entrenamiento visual

Fecha: 17 de octubre de 2026.

## Alcance y método

23 rutas públicas revisadas en Chrome local a 1366×768 y 390×844: carga HTTP, errores JavaScript, desbordamiento horizontal y controles anidados. Se revisaron además las plantillas, controladores y sesiones de Daily Puzzle, puzzles nativos, Blind y Pieceless. Las pantallas privadas y de administración y los estados de todos los libros, artículos, usuarios y filtros no se han recorrido con datos de cada cuenta. Las pruebas automatizadas de Studies y análisis existentes complementan, pero no sustituyen, esa revisión.

## Hallazgos corregidos en esta iteración

- `lib/listudy_web/controllers/pieceless_tactic_controller.ex`: una tabla dedicada vacía producía un error 500. Se reutilizan puzzles nativos existentes con una ruta explícita; la solución SAN se convierte y valida antes de jugar. No se crean ejercicios ficticios ni registros nuevos. Una tabla dedicada con un solo ejercicio tampoco rompe Siguiente.
- `assets/js/pages/training/pieceless_tactics.js`: solución visible, reintento, promociones con el selector compartido, bloqueo al finalizar y limpieza al reiniciar. El HTML ya no duplica `id=info`; ocultar piezas deja de afectar a otros tableros.
- `lib/listudy_web/templates/tactic/daily.html.eex`: enlaces de regreso a las colecciones de tácticas, sin empujar al catálogo aleatorio antiguo después del puzzle.
- `lib/listudy_web/templates/live/blind_tactics.html.leex`: cabecera compacta compartida, instrucciones, botones semánticos, dificultad en configuración y ayuda desplegable. Se conserva el tablero durante actualizaciones LiveView.
- `assets/js/pages/training/blind_tactics.js`: dificultad acotada a la historia disponible, cambiar configuración no modifica el ejercicio en curso, posiciones iniciales FEN respetadas, reintento, ausencia de reinicio al conectar LiveView y bloqueo después de mostrar la solución.
- `lib/listudy_web/templates/component/infoboxes.html.eex`: cerrar avisos utiliza un botón real accesible por teclado, sin IDs duplicados ni símbolos que dependan de una fuente ausente.
- `assets/js/pages/training/tactics.js` y `templates/tactic/custom.html.eex`: abrir el editor sin posición o con base64 inválido deja de provocar excepciones de carga.
- `assets/js/components/chessboard_settings.js`: un iframe sin controles de configuración no intenta modificar elementos inexistentes.
- `lib/listudy_web/live/chessclicker_live.ex`: una colección de puzzles fáciles vacía muestra una salida útil en vez de un error 500. No se inventan ejercicios fáciles ni ratings.

## Inventario inicial observado

Los estados siguientes corresponden a la captura anterior a los arreglos. Los hallazgos de funcionalidad se verifican de nuevo tras construir los assets.

| Ruta | HTTP inicial | Errores JS iniciales | Observación inicial |
|---|---:|---:|---|
| `/en/tactics/daily-puzzle` | 200 | 0 | Diseño antiguo y regreso al catálogo nativo. Botones anidados en enlaces. |
| `/en/blind-tactics` | 200 | 0 | Sin h1, acciones y configuración dispersas. |
| `/en/pieceless-tactics` | 500 | 0 | Error al seleccionar sobre una tabla vacía. |
| `/en/features/blind-tactics` | 200 | 0 | Sin fallo de carga observado; revisar jerarquía y componentes antes de ampliar. Botones anidados en enlaces. |
| `/en/features/pieceless-tactics` | 200 | 0 | Sin fallo de carga observado; revisar jerarquía y componentes antes de ampliar. Botones anidados en enlaces. |
| `/en/tactics/custom` | 200 | 1 | Excepción al abrir sin FEN. Editor manual poco integrado con PGN. Botones anidados en enlaces. |
| `/en/games/chessclicker` | 500 | 0 | Error si no existen puzzles de dificultad baja. |
| `/en/play-stockfish` | 200 | 0 | Sin fallo de carga observado; revisar jerarquía y componentes antes de ampliar. |
| `/en/books` | 200 | 0 | Sin fallo de carga observado; revisar jerarquía y componentes antes de ampliar. |
| `/en/books/best-chess-books` | 200 | 0 | Sin fallo de carga observado; revisar jerarquía y componentes antes de ampliar. Botones anidados en enlaces. |
| `/en/blog` | 200 | 0 | Sin fallo de carga observado; revisar jerarquía y componentes antes de ampliar. |
| `/en/stats` | 200 | 0 | Múltiples h1; no representa progreso personal de entrenamiento. |
| `/en/achievements` | 200 | 0 | Logros heredados, separados del progreso moderno. |
| `/en/webmaster` | 200 | 1 | Error del selector de tablero dentro del iframe. Botones anidados en enlaces. |
| `/en/openings` | 200 | 0 | Sin fallo de carga observado; revisar jerarquía y componentes antes de ampliar. |
| `/en/players` | 200 | 0 | Sin fallo de carga observado; revisar jerarquía y componentes antes de ampliar. |
| `/en/motif` | 200 | 0 | Sin fallo de carga observado; revisar jerarquía y componentes antes de ampliar. |
| `/en/events` | 200 | 0 | Sin fallo de carga observado; revisar jerarquía y componentes antes de ampliar. |
| `/session/new` | 200 | 0 | Formulario funcional; oportunidad de jerarquía y retorno al recorrido. |
| `/registration/new` | 200 | 0 | Formulario funcional; revisar mensajes de error y retorno tras registro. |
| `/en/privacy` | 200 | 0 | Sin fallo de carga observado; revisar jerarquía y componentes antes de ampliar. |
| `/en/terms-of-service` | 200 | 0 | Sin fallo de carga observado; revisar jerarquía y componentes antes de ampliar. |
| `/en/credits` | 200 | 0 | Sin fallo de carga observado; revisar jerarquía y componentes antes de ampliar. |

No se observó desbordamiento horizontal en esas dos resoluciones en el inventario inicial. Esto no certifica accesibilidad completa ni prueba todos los tamaños de pantalla.

## Mismatches y oportunidades pendientes

| Prioridad | Pantallas | Acción propuesta |
|---|---|---|
| Implementado | Visualización y colecciones | Full lines ofrece visualización con piezas ocultas, dificultad gradual y registro de ayudas, reutilizando el tablero, las posiciones y el progreso de Studies. |
| Implementado | Blind/Pieceless | Progreso local por modalidad: intentos, errores, ayudas, soluciones mostradas y cantidad real de jugadas o piezas ocultas. Dificultad adaptativa tras tres resoluciones completas sin errores ni ayuda; destinos legales opcionales y desactivados por defecto. Los reintentos inmediatos cuentan como repaso. Pieceless conserva la opción de ocultar todas las piezas. |
| Implementado | Puzzles nativos | Alternativas legales verificadas con tablebases o análisis local suficiente; continuación regenerada y fallback a la solución guardada si el análisis no concluye. |
| Implementado | Menú Practice | Blind y Pieceless se descubren desde Tactics incluso sin colecciones; se elimina el menú Practice redundante y se mantiene Tactics activo durante estos modos y sus guías. |
| Implementado | Guías de Blind y Pieceless | Guía compartida compacta: tres pasos, acceso directo a entrenar, imágenes con dimensiones y ayuda secundaria coherente con la dificultad y pistas actuales. |
| Media | Openings / Players / Motifs / Events | Los buscadores y detalles llevan al catálogo nativo, no a colecciones PGN. Decidir si se presentan como exploración de puzzles públicos o se ocultan del recorrido principal. |
| Implementado | Custom Tactic / Webmaster | Creación personal enlaza al editor y PGN existentes; compartir un puzzle mantiene formulario y enlace compatibles, último movimiento opcional y código de inserción secundario. Documentación compartida, adaptable y sin botones anidados. |
| Media | Libros / recomendaciones / blog | Componentes antiguos de listas, títulos y CTA; conviene alinearlos si siguen formando parte del producto, sin darles peso de entrenamiento. |
| Media | Perfil / logros / estadísticas | Unificar progreso útil para el jugador: práctica reciente y recuperación de errores. Los contadores históricos no equivalen a rating ni precisión. Perfil autenticado y datos privados requieren revisión con sesión. |
| Media | Acceso / registro / recuperación / ajustes | Revisar estados vacíos, errores, mensajes y destino de retorno con cuentas de prueba; no se han recorrido todos esos estados autenticados. |
| Baja | Chessclicker / Play Stockfish / páginas promocionales | Decidir si se mantienen como extras. Sparring ya cubre buena parte de jugar contra motor dentro del recorrido principal. |
| Baja | Legales / créditos | Mantener tipografía legible y navegación; no necesitan una experiencia de entrenamiento ni tarjetas nuevas. |

## Comparación con Chessvis

Fuentes primarias consultadas:

- [Chessvis actual](https://www.chessvis.com/): destaca puzzles visualizados, ejercicios de relaciones entre piezas y una entrada progresiva al juego a ciegas.
- [Ficha del desarrollador en Google Play](https://play.google.com/store/apps/details?hl=es&id=com.conceptual.chessvis): describe seguimiento progresivo de movimientos, puzzles por categoría y rating y juego a ciegas. La comparación se basa en lo anunciado, no en una prueba completa de su aplicación ni en evidencia de superioridad pedagógica.
- [Manual histórico de Chessvis](https://www.chessvis.com/doc.php): detalla reconstrucción de posiciones memorizadas, seguimiento de jugadas y puzzles mostrados desde posiciones anteriores. Es documentación histórica y no demuestra por sí sola su funcionamiento actual.

| Capacidad | Listudy verificado | Oportunidad |
|---|---|---|
| Resolver desde un diagrama anterior | Blind mantiene el tablero congelado y presenta las jugadas ocultas. | Es una base válida; hacer comprensible su dificultad y medir resultados. |
| Resolver sin piezas | Pieceless usa un tablero vacío y la lista de piezas iniciales. | Añadir ayudas graduales y revisión del razonamiento, sin premiar consultas como aciertos. |
| Escalones de dificultad | Número de jugadas ocultas manual. | Secuencias de 1–2–4 jugadas según resultados; permitir bajar dificultad. |
| Reconstrucción de posiciones | No se encontró como módulo del recorrido. | Posible ejercicio futuro apoyado en el editor de tablero; no es necesario para corregir los modos actuales. |
| Seguimiento e interacción de piezas | Se sigue una secuencia implícitamente al resolver. | Ejercicios cortos de casilla final, piezas atacadas y defensores; reutilizar Chess/chessground. |
| Historial y práctica personal | Los modos nativos tienen contadores heredados; Studies tiene progreso más completo. | Compartir el registro de sesiones, sin atribuir ratings ni precisión inventada. |
| Colecciones propias y comentarios | Studies ya importa PGN y permite Full lines y revisión. | Priorizar un modo de visualización dentro de ese mismo flujo. |

Recomendación: conservar el catálogo y las mecánicas nativas que aportan valor; consolidar la experiencia alrededor de Tácticas y del motor de sesiones de Studies. El entrenamiento visual sobre PGN y la progresión nativa de Blind/Pieceless ya están implementados. La siguiente prioridad alta pendiente es evaluar alternativas equivalentes en los puzzles nativos, sin aceptar automáticamente cualquier jugada ganadora.

## Verificación de esta iteración

- La primera repetición del recorrido público eliminó las excepciones del editor vacío, del iframe de Webmaster y de Pieceless. Reveló una incompatibilidad adicional en el renderizado del estado vacío de Chessclicker; se corrigió usando una plantilla LiveView y se añadió una regresión HTTP específica.
- 14 pruebas de controlador: retorno de Daily Puzzle, catálogo Pieceless vacío, ejercicio único, promoción, PGN con FEN, Blind vacío y Chessclicker sin puzzles fáciles, además del recorrido principal existente.
- Chrome a 320, 390 y 1366 px: posiciones iniciales especiales, cambios de dificultad sin alterar el ejercicio activo, reintento, bloqueo tras finalizar, solución visible, subpromoción y cierre de avisos con teclado.
- Regresión de Sparring con Stockfish real y del recorrido home → estudio/colecciones → Daily Puzzle.
- Las oportunidades de la tabla no implican que esas nuevas funciones estén implementadas. No se han añadido rating personal, adaptación automática ni equivalencia de jugadas en los modos nativos.
