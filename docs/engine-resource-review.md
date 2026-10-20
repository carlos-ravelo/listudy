# Revisión de recursos del motor

Se comparó Stockfish 19 Lite WASM, la distribución instalada, con Hash de 8,
16, 32 y 64 MiB. Se usaron tres posiciones (inicial, medio juego y final),
700 ms por búsqueda y dos rondas con el orden de tamaños invertido. Cada
búsqueda comenzó con `ucinewgame`. Ejecución local en Node 22; estos resultados
no representan un benchmark de móviles ni una medición de Elo.

| Hash por worker | Profundidad inicial | Medio juego | Final |
|---|---|---|---|
| 8 MiB | 18 / 18 | 17 / 17 | 45 / 45 |
| 16 MiB | 19 / 19 | 17 / 17 | 45 / 45 |
| 32 MiB | 18 / 17 | 17 / 17 | 45 / 45 |
| 64 MiB | 18 / 18 | 17 / 17 | 45 / 45 |

No se observó una mejora consistente al aumentar el tamaño por encima del
valor predeterminado. Se mantiene un máximo solicitado de 16 MiB por worker.
Cuando `navigator.deviceMemory` informa hasta 1 GiB se solicitan 4 MiB; hasta
2 GiB, 8 MiB. Es una medida de consumo, sin prometer más velocidad ni igual
profundidad. Con dos workers simultáneos, el Hash solicitado suma como máximo
8, 16 o 32 MiB respectivamente; WASM, redes y UI consumen memoria adicional.

La opción se negocia mediante la respuesta UCI del motor y se aplica antes de
`isready`. Se respetan sus límites y nunca se aumenta un valor predeterminado
menor. Sin información de memoria se conserva el presupuesto de 16 MiB; si el
motor no anuncia una opción Hash válida se conserva su configuración.

## Opciones aplazadas

- Opening Explorer añade autenticación y dependencia externa. El repertorio
  PGN ya resuelve las respuestas teóricas sin red; un libro adicional necesita
  primero un caso de uso concreto.
- La distribución actual no descarga una NNUE separada y los recursos del
  motor ya tienen URLs versionadas y caché HTTP prolongada. No se añade otra
  copia en IndexedDB o un Service Worker sin una necesidad offline demostrada.
- El abandono automático queda fuera del entrenamiento de finales: completar
  la conversión es parte del ejercicio. Una opción para Sparring puede evaluarse
  cuando haya una necesidad clara.
