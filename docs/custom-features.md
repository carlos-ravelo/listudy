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

Unversioned static files revalidate with ETags instead of being cached for a year.
The study script URL includes a one-time revision to bypass previously cached
copies. Phoenix digest URLs keep their existing long-lived cache policy. Changes
to the endpoint cache policy require the running application to reload/restart.

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
moves, then distinct noninitial positions. Equal top candidates are grouped by
their comparison outcome, including duplicate chapter titles. The exact matched game plies, final position, expected moves,
entry point and earlier departures must agree before chapters share a group.
Bulk results with conflicting outcomes are marked ambiguous and excluded from mistake training.

### Quick comparison page

- `Listudy.Games.AnalysisComparison`: groups equally ranked chapters conservatively.
- `AnalysisView`: chess move labels and chapter links.
- `templates/analysis/quick_result.html.eex` and `_comparison_outcome.html.eex`: one game board, comparison outcomes and expandable chapter lists.
- `assets/js/quick_result.js`: comparison selection and navigation controls.
- `assets/js/modules/analysis/game_replay.js`: game replay, exact position occurrences and comparison arrows.
- `assets/css/features/analysis_comparison.css`: responsive comparison layout.

The uploaded game opens immediately. Selecting another comparison reuses the
parsed game in the browser without another request. Equivalent chapters stay in
one expandable list; their unplayed continuations can still differ. Different
outcomes remain selectable alternatives. Match-count terminology is explained in
“How this match was found” instead of being the primary result label. Earlier
departures can be inspected on the same board.

Named chapter links carry both `chapter` and the zero-based `chapter_index` for
compatibility with older name-based navigation. Synthetic “Chapter N” names use
only the index because the study page translates those labels. Chapter links open
in a new tab to preserve the uploaded-game comparison. `chapter_index=5` means
chapter 6, and the study page already resolves this parameter before starting
training.

The matcher now returns `matched_plies` for comparison grouping. This adds display
data without changing ranking or persisted results, so the analysis version stays
at `positions-v3`.

### Processing and setup

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
