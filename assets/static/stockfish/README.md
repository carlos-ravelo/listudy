# Listudy browser engine

Distribution: `stockfish@19.0.1`, maintained by Nathan Rugg and contributors.
Source and corresponding release: https://github.com/nmrugg/stockfish.js/tree/v19.0.1
Release downloads: https://github.com/nmrugg/stockfish.js/releases/tag/v19.0.1

Webpack copies these files from the exact npm dependency into `/stockfish/19.0.1/`:

- `stockfish-19-lite-single.js` and `.wasm`: default single-thread WebAssembly engine.
- `stockfish-19-asm.js`: JavaScript compatibility engine from the same release.
- `Copying.txt`: GPLv3 engine license.

The Lite network prioritizes download size over maximum strength. Native UCI_Elo
settings are approximate engine targets. They are not equivalent to FIDE,
Chess.com or Lichess ratings, and this browser build/search budget has not been
independently calibrated. Changing the engine build or search conditions can
change its playing strength. Analysis runs with strength limiting disabled.

Install dependencies in assets, then run `npm run deploy` or the development
webpack command. `scripts/update_stockfish_wasm.sh` invokes this build. To upgrade,
update both the exact package version and `assets/stockfish.config.js`; verify
readiness, searches, Elo options, fallback and cancellation before deployment.
