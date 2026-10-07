# Library delegation audit

Reviewed: 2026-10-07. Scope: the current fork's study playback, repertoire
comparison, progress storage, browser engine integration, and development tooling.
This is an assessment and migration proposal, not a dependency upgrade.

## Decision

Keep Phoenix/Ecto, Chessground, Python chess parsing, and FSRS. Investigate
replacing the browser PGN processing pipeline with a library-backed adapter.
Modernize the browser Stockfish distribution independently. Preserve Listudy's
training and repertoire-matching rules as application code.

The current application already delegates most chess primitives. The main
opportunity is reducing the custom code between those dependencies, rather than
replacing the whole stack or moving each feature into a service.

## Evidence and limits

Source inspection covered the manifests and the files linked below. Five existing
JavaScript regression scripts passed using Node 20.14.0: `chapter_practice.cjs`,
`study_navigation.cjs`, `study_move_tree.cjs`, `study_features.cjs`, and
`training_moves.cjs`. All 11 Python matching tests passed with
`python3 -m unittest discover -s test/chess_analysis -p 'test_*.py'`.
The invalid-SAN message in that Python run comes from an invalid-input test.

No candidate library was installed or benchmarked. Browser end-to-end tests,
full Elixir tests, and production builds were not run for this assessment.
Recommendations about fit are engineering judgments, not demonstrated migration
results. Upstream manifests indicate source-tree versions, not necessarily the
latest npm release. Tests, documentation, releases, and use by other projects
are maintenance signals; none guarantees future community support.

## Responsibility map

| Responsibility | Current implementation | Decision | Migration cost |
| --- | --- | --- | --- |
| Browser move legality, FEN, SAN, check detection | `chess.js` declared as `^0.10.3` | Keep behind an adapter initially; consider current chess.js or Chessops after the PGN experiment | Medium/high: used across study, tactics, replay, and endgames |
| PGN chapters, variants, annotations | `pgn-parser` plus cleaner, splitter, tree conversion and annotation helpers | Highest-value candidate for delegation to `chessops/pgn` | Medium with a compatibility adapter; high if replacing the stored model immediately |
| Interactive board | `chessground` `^9.2.1` | Keep; assess a version/package migration separately | Medium: interaction, shapes, layout and imports must be checked |
| Read-only PGN display | Custom study move tree and game replay | Consider Lichess PGN Viewer on a standalone content page; retain integrated training UI | Medium/high for the existing study page |
| Browser analysis engine | `stockfish.wasm` `^0.10.0`, copied assets and fallback workers | Evaluate a current browser build, with a small UCI adapter | Medium: assets, startup, browser capabilities and cancellation |
| Review scheduling | `ts-fsrs` pinned to `5.4.2` | Keep | Low for the current integration; upgrades still need scheduling regression checks |
| Server chess rules and PGN | Python `chess==1.11.2` | Keep | No replacement warranted by this audit |
| Repertoire matching, training rules and progress meaning | Listudy modules in JS, Elixir and Python | Keep and isolate from UI/dependency APIs | Refactoring work, not a library substitution |
| Local/cloud progress synchronization | `StorageAdapter` and Phoenix progress endpoint | Repair delivery semantics and define conflicts before choosing a library | Medium; storage wrappers alone cannot solve it |

Manifest: [assets/package.json](../assets/package.json). Python dependency:
[requirements.txt](../priv/python/requirements.txt). The installed `pgn-parser`
is 2.2.1, which differs from the lower bound in its declared range. A committed
npm lockfile is absent and `assets/package-lock.json` is ignored.

## 1. PGN processing: investigate first

The browser calls `pgn-parser`, annotates its output, and converts it into the
training tree. It separately splits the PGN into chapter strings for collections.
The template also rewrites the entire input before parsing.

Relevant source:

- [study template](../lib/listudy_web/templates/study/show.html.eex): `clean_pgn()`.
- [study.js](../assets/js/study.js): `setup_trees()` and `splitChapterPgn()` usage.
- [tree_from_pgn.js](../assets/js/modules/tree_from_pgn.js): `annotate_pgn()` and `generate_move_trees()`.
- [chapter_pgn.js](../assets/js/modules/study/chapter_pgn.js): lexical chapter splitting and URL resolution.
- [chess_utils.js](../assets/js/modules/chess_utils.js): annotation conversion and move notation adapters.

A direct execution of the existing cleaner confirmed this transformation:

```text
Before: [Event "Plan (A) 0-0"]
        1. e4 {Keep (this) and 0-0} e5 *
After:  [Event "Plan ( A ) O-O"]
        1. e4 { Keep ( this ) and O-O } e5 *
```

This changes metadata and comment text as well as move tokens. It illustrates why
normalization should follow token boundaries. It does not establish that every
study currently fails.

Chessops provides PGN parsing/writing, a variation tree, tree transformations, and
structured comment annotations. That overlaps with custom parsing and tree
construction here. Its compatibility helpers also target Chessground.
[Chessops capabilities](https://github.com/niklasf/chessops).

Important differences: its parser can skip invalid tokens and syntax parsing does
not establish legal moves. Validate SAN while walking each branch from its starting
position and define the intended malformed-input behavior. Use the streaming
parser's complexity budget for large imports. [PGN source and semantics](https://github.com/niklasf/chessops/blob/main/src/pgn.ts).

It is a candidate, not a drop-in replacement. Start by returning the current node
shape (`move`, `children`, comments and move indexes) from an adapter. Preserve
training scores and timestamps separately from the standard PGN model. Rewriting
PGN can normalize whitespace and headers: retain the original text when exact
chapter export matters. Do not assume a serializer replaces the raw splitter
without changing export behavior.

The current parser already supports recursive variations and comments; this is
not a claim that it lacks those features. The benefit must be demonstrated by
deleting surrounding custom logic. Its upstream maintenance cadence was not
established during this audit. [pgn-parser documentation](https://github.com/kevinludwig/pgn-parser).

## 2. Chess rules: avoid two permanent browser engines

Listudy already uses chess.js for legal moves. Helpers such as
`ground_legal_moves()` convert its output for Chessground and remain legitimate
integration code. However, `initial_fen()` extracts a header from serialized PGN,
and `san_to_uci()` returns `a1` to `a1` for an illegal move. Prefer explicit
starting-position data and a structured error over either workaround.

The inspected upstream chess.js manifest is 1.4.0. Its current documented API
uses methods such as `loadPgn()`, `getHeaders()` and `isCheck()`; invalid moves and
invalid PGN can throw. Our code expects older names such as `load_pgn()` and
`in_check()`, and often checks for `null` or `false`. A version bump therefore
needs call-site and error-handling changes. [Manifest](https://github.com/jhlywa/chess.js/blob/master/package.json),
[API documentation](https://jhlywa.github.io/chess.js/).

Choose one long-term browser rules implementation after the PGN experiment:
current chess.js for a smaller conceptual change, or Chessops if consolidating
PGN, notation and positions demonstrably reduces code. Temporary coexistence is
reasonable for comparison. Permanent duplication adds bundle weight and risks
different acceptance/normalization behavior.

## 3. Board and viewer: different jobs

Keep Chessground. Listudy's hints, legal destinations and learner interactions
need an interactive board. The inspected upstream manifest uses the scoped
package `@lichess-org/chessground`, version 10.4.2, with a declared Node >=24
engine; our project declares Node >=20. Check the exact published target before
an upgrade. [Upstream manifest](https://github.com/lichess-org/chessground/blob/master/package.json).

Lichess PGN Viewer supplies read-only navigation, variations, comments and
accessibility. Its documented non-goals include custom user moves and engine
support. That makes it a plausible option for an independent preview, but an
awkward replacement for the same board switching between Read and Practice.
Integrating it would need coordination with our chapter selection, progress,
deviation overlays and training state. [Viewer documentation](https://github.com/lichess-org/pgn-viewer).

## 4. Stockfish: upgrade the distribution, keep a small integration

[stockfish.js integration](../assets/js/modules/stockfish.js) selects threaded
WASM or a fallback worker. [play_stockfish.js](../assets/js/play_stockfish.js)
and [endgames.js](../assets/js/endgames.js) send UCI commands through global `sf`.
[The copy script](../scripts/update_stockfish_wasm.sh) installs engine assets.

Upstream describes `stockfish.wasm` as an older compatibility port. The current
Lichess build is optimized for Lichess and its own README points external users
to `nmrugg/stockfish.js` for easier integration.
[Legacy port](https://github.com/lichess-org/stockfish.wasm),
[Lichess build guidance](https://github.com/lichess-org/stockfish-web).

Evaluate a lightweight, single-threaded build first; the alternative project
offers several engine sizes and threading options. Measure download size,
startup and analysis speed on target devices. Preserve an explicit fallback
policy. A stronger engine does not automatically produce a better mobile
experience. [Stockfish.js distribution](https://github.com/nmrugg/stockfish.js).

Our adapter still owns worker lifetime, readiness, `stop`, stale responses,
timeouts and conversion of UCI output into UI results. A raw engine package does
not remove those responsibilities.

## 5. Keep the existing server and scheduling boundaries

[chapter_review.js](../assets/js/modules/study/chapter_review.js) already calls
FSRS for scheduling. Mapping a clean line to `Good`, a mistake to `Again`, choosing
one card per chapter, and invalidating cards when chapter content changes are
Listudy policies. Keep those outside the scheduler.
[FSRS implementation](https://github.com/open-spaced-repetition/ts-fsrs).

[positions.py](../priv/python/chess_analysis/positions.py) delegates PGN and SAN
to python-chess. [repertoire.py](../priv/python/chess_analysis/repertoire.py) and
[matching.py](../priv/python/chess_analysis/matching.py) implement position indexing,
transpositions, departures and chapter ranking. Those are application behavior,
not duplicated chess move generation. Python-chess supports PGN trees, comments
and headers. [Library documentation](https://github.com/niklasf/python-chess).

[ChessEngine](../lib/listudy/chess_engine.ex) is a JSON/process boundary to that
matcher despite its name; it is not running Stockfish. Changing browser engine
assets does not replace repertoire comparison. No evidence here warrants
replacing Phoenix/Ecto or moving the Python boundary into a new network service.

## 6. Storage and tooling need clearer contracts

[StorageAdapter](../assets/js/storageAdapter.js) updates local storage and debounces
cloud writes. It does not check `response.ok`, removes regular pending writes
before confirming success, and does not synchronize deletion. The
[progress controller](../lib/listudy_web/controllers/progress_controller.ex)
upserts opaque per-user key/value records. A failed HTTP response can therefore
be treated as successful delivery. This is a delivery-semantics finding from
source, not a reproduced network failure.

An IndexedDB wrapper would not decide cross-device conflicts, account isolation,
retry behavior or deletion semantics. Define those first. Keep native fetch and
storage where they suffice; introduce a queue library only against a demonstrated
requirement.

The [CI workflow](../.github/workflows/deploy.yml) selects Node 13, while
[.nvmrc](../.nvmrc) selects 20 and the package manifest requires >=20. It builds
assets but does not invoke the five JS regression scripts or the Python matching
suite. Commit a lockfile, align runtime versions, and run those checks in CI before
changing central dependencies. Keep the existing bundler initially; changing
Webpack and the chess model together would make regressions harder to isolate.

Several JS tests extract or transform source to access functions. Expose pure
modules through explicit interfaces so tests can import behavior directly. That
does not require choosing a new test framework immediately.

## Suggested sequence and acceptance criteria

1. **Make dependency resolution and tests reproducible.** Align CI and local
   runtimes, track the npm lockfile, and add existing JS/Python checks. No product
   behavior change is needed.
2. **Introduce one PGN adapter and a shared fixture corpus.** Compare the current
   pipeline with Chessops without changing the live training model. Cover nested
   variations, multiple games, empty chapters, duplicate titles, custom FEN with
   Black to move, promotions, castling, annotations, BOM, malformed input and
   results inside comments. Check original-text export as well as parsed meaning.
3. **Adopt only if the adapter removes meaningful custom parsing code.** Require
   stable chapter identity, equivalent legal positions and preservation of
   annotations. Verify review signatures and persisted move identifiers; version
   or migrate them explicitly if normalization changes their meaning. Keep a
   rollback path using the old parser during evaluation.
4. **Choose the browser rules library.** Adapt errors and imports across studies,
   tactics, replay and endgames. Avoid permanent dual engines.
5. **Modernize Stockfish independently.** Check worker startup, readiness,
   cancellation, fallback behavior, downloads and responsiveness in real browsers.
6. **Improve sync and module ownership.** Separate training session state from DOM,
   board, persistence and notation APIs; retain Listudy's training decisions.

Chessops is GPL-3.0-or-later, while this repository contains an AGPLv3 license.
Chessground and the viewer also document GPL licenses. Preserve notices and
record the selected package licenses during adoption; `assets/package.json`'s
MIT label should not be treated as the application's authoritative license.
This audit records package metadata, not a legal compatibility opinion.

The first useful experiment is PGN parsing behind an adapter. The success measure
is less custom code with preserved study behavior, not a longer dependency list.
