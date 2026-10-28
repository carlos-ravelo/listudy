# JavaScript organization

- `entries/`: section assets and startup code.
- `pages/`: page controllers, grouped by study, analysis, and training.
- `components/`: reusable interface controls and their DOM behavior.
- `modules/`: shared behavior, grouped by responsibility:
  - `board/`: moves, board interaction, rendering adapters, and promotion flow.
  - `engine/`: workers, UCI communication, engine positions, and tablebases.
  - `training/`: exercises, attempts, progress, and training lifetimes.
  - `pgn/`: move trees, PGN parsing helpers, and downloads.
  - `study/`, `analysis/`, `sparring/`: behavior specific to those domains.

Keep small cross-cutting helpers directly in `modules/`. Add a folder when
several related files share a responsibility. Place reusable interface controls
in `components/`, even when they are used by only one domain. Page controllers
compose components and modules; they may also be direct Webpack entries.

Webpack entry names determine public bundle URLs independently of source paths.
