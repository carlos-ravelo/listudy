# Training reuse

## Existing shared behavior

| Responsibility | Shared implementation | Consumers |
| --- | --- | --- |
| Coordinate notation, move inspection and UCI execution | `assets/js/modules/chess_moves.js` | Native tactics, Blind, Pieceless, endgames, Sparring, standalone Stockfish and legacy SAN/UCI wrappers |
| Legacy board/color helpers | `assets/js/modules/chess_utils.js` | Legacy board modes |
| Applying moves, undo and board synchronization | `assets/js/modules/board_game.js` | Study, native tactics, Pieceless, endgames, standalone Stockfish, Chessclicker and game-mistake practice |
| Board interaction, authoritative position restoration and legal destinations | `assets/js/modules/board_interaction.js` | Study, editor, Sparring, native tactics, Pieceless, endgames and Blind; `chess_utils.js` delegates destination mapping for legacy board modes |
| Board creation, movement, sizing, sound | `assets/js/modules/ground.js` | Study and native exercises; newer controllers also render Chessground directly |
| Alternative solution analysis | `assets/js/modules/tactic_alternatives.js` | Native tactics, Blind, Pieceless through `tactic_attempts.js` |
| Pending validation and stale response rejection | `assets/js/modules/tactic_attempts.js` | Native tactics, Blind, Pieceless |
| Promotion interaction and pending move | `assets/js/modules/promotion_controller.js` | Editor, Sparring, native tactics, Pieceless, endgames |
| Page resource cleanup | `assets/js/modules/page_scope.js` | Consumers that explicitly register resources |
| Visualization progression | `assets/js/modules/native_visualization.js`, `study/visualization.js` | Native visualization exercises and PGN visualization |

## Remaining differences to address

### Move input and promotion policy

`study.js` routes Sparring to its adapter but implements PGN Read and practice
through `uci_to_san` and `possible_promotion`. The latter can substitute an authored
underpromotion. The standalone Stockfish page also retains automatic queen promotion for user
input. These paths do not use the shared promotion controller. Blind selects
queen promotions when matching destinations. Shared move parsing now preserves
all five characters of engine promotion moves, including underpromotion.

Next, define and test the intended promotion behavior per exercise before moving
these callers onto shared input handling. Blind's destination-only interaction and
PGN authored underpromotion must be preserved or deliberately changed.

### Board interaction state

Study, editor, Sparring, native tactics, Pieceless and endgames share
`board_interaction.js` for turn/check state, legal destinations and blocking.
Native retries restore FEN, turn, movable color and destinations together.
Pieceless suppresses check while pieces are hidden; review can change interaction
without replacing the visible board. Mode-specific input handlers and user
preferences stay attached to Chessground.

Study uses shared restoration for practice, Read, replay and traps. Read and
practice retain input for both sides, while replay, traps and transitions lock
piece movement. Blind uses shared blocking while solving and shared restoration
only on reveal; its square-selection input and separate logical position remain
mode policies. Tests cover replay/trap recovery and hidden progress for both
orientations. Keep turn eligibility in each mode; a position's legal moves alone
do not authorize the player to move.

### Applying moves and rollback

`board_game.js` now applies SAN/UCI/coordinate input to the current chess position,
invokes move effects once, and renders the authoritative FEN, turn, check, last
move and legal input state. It also owns undo plus rendering; callers choose the
number of plies. A request to undo more history than exists changes nothing.
A rejected optimistic move restores the board without undoing game history.

Study retains PGN cursor updates; native tactics retains authored continuation
and delayed feedback; Pieceless updates its piece mask through the move callback;
endgames retains feedback records and objective checks; Chessclicker retains its
rewards; game practice retains grading and retry timing. Stockfish takeback uses
the same undo instead of reversing board coordinates twice. The legacy renderer's
manual en passant/promotion handling and visual reverse-move rollback are removed.

Blind intentionally advances a hidden logical position without rendering each
move. Sparring separates its model/session from browsing an older position; the
editor edits a variation tree. These consumers share position rendering and chess
move operations but do not use a controller that renders every committed move.

### Async work and resource lifetime

Native alternative validations now share pending state and reset cancellation.
Study replay uses `study/run_lifecycle.js`; Sparring has a session lifecycle;
endgames and the editor still own revision counters for engine or network work.
Native tactics retains its revision counter for animation delays. The standalone
Stockfish page uses a raw worker listener and its own reset/takeback handling.

Next, cover restart, navigation and teardown during pending work, including a new
request starting before an old response completes. Reuse `page_scope.js` for page
resource cleanup where appropriate. Do not combine page lifetime, attempt lifetime
and analysis lifetime into one counter: they invalidate different work.

### Solution representation and exercise rules

Native tactics consumes SAN, Pieceless consumes UCI and Blind reconstructs a
history. `chess_moves.js` shares temporary move inspection, UCI parsing/formatting
and UCI execution across these adapters, engine history, alternative analysis and
Sparring. An invalid inspection never undoes an existing move. SAN inspection
retains chess.js's accepted notation rules rather than implementing a second SAN
parser. The standalone Stockfish listener preserves engine promotion choices and
ignores absent or malformed best moves.

The next larger boundary is a line-exercise session for native tactics, Blind and
Pieceless: normalize the authored continuation to UCI, inspect an attempt, validate
alternatives, advance the player/reply pair, and report completion. Visibility,
feedback timing and progress recording remain adapters. Preserve authored replies
and the existing alternative-validation confidence policy with shared contract
tests before replacing these flows.

PGN practice follows a variation tree, Sparring plays beyond the authored line,
and endgames evaluates an objective. They can use the same chess position/input
layer, but their move acceptance, reply selection and completion policies differ.
Do not encode these policies as flags in a universal controller.

## Other identified duplication to address

| Responsibility | Observed implementations | Intended boundary |
| --- | --- | --- |
| Exercise turn progression | Native tactics, Blind, Pieceless and Chessclicker each select authored moves/replies and detect completion | A shared line-exercise session; mode adapters retain visibility, timing and rewards |
| Attempt state and cancellation | Native validation wrapper, Study replay revisions, endgame/editor counters, raw Stockfish listener | Reusable attempt/task lifetimes with separate scopes for analysis, network reads and page resources |
| Startup/reset/teardown | Entry-specific `main` functions, LiveView update listeners, pagehide/pageshow handling and observers | Shared resource lifecycle using existing `page_scope.js`; adapters load their own exercise data |
| Navigation and rewind | Study PGN cursor, endgame feedback reconstruction, Sparring browsing/retry and Stockfish takeback | Shared position reconstruction and rendering; keep edit, browse and practice-retry policies distinct |
| Hints and solution reveal | Board arrows/piece markers in Study, game practice and Blind; engine hints in endgames/Sparring | Shared hint presentation and assistance events; retain authored versus engine hint selection |
| Grading and completion records | Puzzle progress, visualization tracker, Study reviews, game practice, endgame achievements and Chessclicker rewards | Shared attempt outcome events and once-only recording; retain existing storage identities and scheduling semantics |
| Analysis presentation | Endgame continuation/evaluation rendering, editor analysis text, Sparring evaluation details | Shared score/PV formatting with explicit perspective; adapters choose when analysis is allowed |
| Preferences and feedback | Study preferences, native visualization settings, autoplay state, generic info boxes and page-specific feedback | Reuse existing settings/feedback primitives; preserve per-mode defaults and localized text |

This is a source-level inventory of training entry points and their directly used
modules, not a claim that all repeated-looking code has equivalent behavior.
Shared chess/board primitives now have multiple consumers. The remaining high-value
work is to share exercise orchestration and resource ownership, with integration
tests for every migrated adapter.

## Verification strategy

Shared unit tests cover promotion choice/cancel/reset and validation races.
Adapter tests must also run the same applicable scenarios through actual mode
entry points: ordinary moves, illegal moves, promotion, rejected and inconclusive
alternatives, repeated input while waiting, restart during analysis and retry.
Browser checks must load each page's real CSS bundle: adding editor styles to a
Sparring fixture previously concealed its missing promotion styles.

Keep subsequent extractions separate and preserve current exercise behavior with
tests before migrating consumers. A shared helper only prevents divergence when
all relevant consumers use it and their integration is verified.
