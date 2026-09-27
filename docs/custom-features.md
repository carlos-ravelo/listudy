# Custom Listudy features

## Study page

`assets/js/study.js` owns the chess engine and initializes feature views after the
chapter selector is ready. It supplies `getCurrentChapter()` and invokes each
view's `update()` after a chapter change.

- `modules/study_page_controls.js`: chapter picker, clipboard, keyboard and puzzle-run controls.
- `modules/study_collections.js`: collection rendering and user actions.
- `modules/study/collection_store.js`: browser storage, migrations and collection operations.
- `modules/study/chapter_pgn.js`: shared raw PGN extraction and chapter-link resolution.
- `templates/study/_chapter_controls.html.eex` and `_collection_modal.html.eex`: static markup.
- `assets/css/features/study_extensions.css`: feature styling.

Collections remain browser-local. Migration saves the replacement before deleting
legacy data; unreadable storage is preserved. Chapter links include a zero-based
index and title. A unique title can recover a link after reordering. These are
positional references, not permanent chapter IDs across simultaneous renames and
reordering. Legacy title-only links must match a unique title, never a substring. Title
comparison tolerates the whitespace around parentheses and braces added by the
study page’s PGN cleaner, including in Event headers. The chapter picker displays
chapter numbers so identically named lines can be distinguished.


## Game analysis

`Listudy.Games.Analyzer` loads owned studies, selects equally ranked results and
persists imported-game outcomes. `ChessEngine` exchanges one JSON batch with
`priv/python/pgn_parser.py`. Python modules have separate responsibilities:

- `positions.py`: PGN validation, game positions and normalized identity.
- `repertoire.py`: indexes all chapter variations and caches indexes by content.
- `matching.py`: scores chapters from actual matched moves and positions.

Position keys include pieces, side to move, castling rights and legal en passant;
move clocks are excluded only from matching. Full FEN and the exact game ply
remain available for replay. A chapter terminal is an end of book, not an error.
The matcher scans beyond departures to find later transpositions and retains
those earlier departures for display. Candidate ranking uses distinct matched
moves, then distinct noninitial positions. Equal top candidates are shown for
selection, including duplicate chapter titles. Bulk results with conflicting
outcomes are marked ambiguous and excluded from mistake training.

Quick analysis parses each submitted game once for all studies. Imports process
batches of up to 50 games. Index caches are disposable JSON files in the system
temporary directory (at most 128 entries). Study content and matcher version
invalidate both cached indexes and persisted analysis results. If matching
semantics change, bump the version in `repertoire.py` and `chess_engine.ex`.

Setup requires Python 3.8+ and `pip install -r priv/python/requirements.txt`.
Apply the `20260927000000_version_study_game_analysis` migration before syncing
imported games. Existing results are refreshed on the next platform sync; the
migration itself does not change historical results. The first refresh may take
longer because old results have no version.

Checks:

```sh
python3 -m unittest discover -s test/chess_analysis -v
node assets/test/unit/study_features.cjs
mix run --no-start -e 'ExUnit.start(); Code.require_file("test/chess_analysis/chess_engine_test.exs")'
# Requires the installed Playwright package and a local Chrome executable:
node assets/test/unit/study_features_browser.cjs
```
