# Training reuse

## Existing shared behavior

| Responsibility | Shared implementation | Consumers |
| --- | --- | --- |
| Coordinate notation, move inspection and UCI execution | `assets/js/modules/chess_moves.js` | Native tactics, Blind, Pieceless, endgames, Sparring, standalone Stockfish and legacy SAN/UCI wrappers |
| Legacy board/color helpers | `assets/js/modules/chess_utils.js` | Legacy board modes |
| Line exercise progression | `assets/js/modules/line_exercise.js` | Native tactics, Pieceless, Blind and Chessclicker; adapters retain presentation and rewards |
| Applying moves, undo and board synchronization | `assets/js/modules/board_game.js` | Study, native tactics, Pieceless, endgames, standalone Stockfish, Chessclicker and game-mistake practice |
| Board interaction, authoritative position restoration and legal destinations | `assets/js/modules/board_interaction.js` | Study, editor, Sparring, native tactics, Pieceless, endgames and Blind; `chess_utils.js` delegates destination mapping for legacy board modes |
| Board creation, movement, sizing, sound | `assets/js/modules/ground.js` | Study and native exercises; newer controllers also render Chessground directly |
| Alternative solution analysis | `assets/js/modules/tactic_alternatives.js` | Native tactics, Blind, Pieceless through `tactic_attempts.js` |
| Pending validation and stale response rejection | `assets/js/modules/tactic_attempts.js` | Native tactics, Blind, Pieceless |
| Promotion interaction and pending move | `assets/js/modules/promotion_controller.js` | Editor, Sparring, native tactics, Pieceless, endgames |
| Page and exercise lifetimes | `assets/js/modules/training_lifecycle.js` | Native tactics, Blind, Pieceless, Chessclicker, endgames and standalone Stockfish |
| UCI worker protocol, search cancellation and full-strength/limited-strength options | `assets/js/modules/sparring/uci_engine.js` | Sparring, alternative validation, endgame analysis and standalone Stockfish |
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

`training_lifecycle.js` now owns a page scope and a replaceable exercise scope
for native tactics, Blind, Pieceless, Chessclicker and endgames. Restart destroys
the old exercise's board, promotion picker, masks, engine/feedback resources and
queued handlers. A cached page departure suspends the exercise while keeping page
listeners; cached restoration explicitly initializes a fresh exercise. Permanent
navigation releases both scopes, including intervals, observers and DOM handlers.
Native tactics preserves same-puzzle LiveView updates and forces initialization
on cached return even when a destroyed board's DOM is still connected.

Exercise input handlers are guarded by their owning scope. Pending native delays
use scoped sleeps, which resolve on disposal while session revisions prevent old
replies from committing. Autoplay and visualization settings now expose cleanup
and release their listeners/control bindings. Chessclicker's page intervals are
released on permanent navigation; its exercise feedback timeout is reset per run.

Study replay retains `study/run_lifecycle.js` and the Study page owns its resources
through `mountStudyPage`. Sparring has its session lifecycle; editor network reads
and analysis still have distinct counters. Endgames retains generation guards for
analysis/hints alongside owned engine resources. Standalone Stockfish now uses
`createUciEngine` for lazy worker initialization, full-strength searches and
protocol errors, and `training_lifecycle.js` for board/worker disposal and guarded
input. Search completion must belong to the active run and unchanged position.
Reset and takeback dispose the old worker; cached-page suspension disposes resources
and return resumes the existing history with a fresh worker. Progress timers are
scoped to the run. Takeback removes two plies after a completed turn, or the single
player ply while waiting for a reply. Errors allow recovery through reset/takeback.

### Solution representation and exercise rules

Native tactics consumes SAN, Pieceless consumes UCI and Blind reconstructs a
history. `chess_moves.js` shares temporary move inspection, UCI parsing/formatting
and UCI execution across these adapters, engine history, alternative analysis and
Sparring. An invalid inspection never undoes an existing move. SAN inspection
retains chess.js's accepted notation rules rather than implementing a second SAN
parser. The standalone Stockfish adapter preserves engine promotion choices and
reports absent or malformed best moves without changing history.

`line_exercise.js` now normalizes authored SAN/UCI to one legal continuation,
inspects player attempts, delegates alternative analysis, commits the player/reply
pair and detects completion for native tactics, Pieceless, Blind and Chessclicker.
The session owns pending state, reset/stop invalidation and delayed-reply guards;
accepted alternatives replace the remaining line after validation. Malformed or
unavailable analysis remains inconclusive. A stored final opponent ply is retained
for reveal when no further player decision follows, preserving exercise semantics.

Adapters retain feedback, retry timing, visualization and scoring. Native tactics
keeps its short opponent delay and unconfirmed-move feedback. Pieceless moves its
piece mask through the board callback. Blind commits the logical position without
rendering it, reconstructs its authored history only for an accepted alternative,
and preserves authored underpromotion for destination-only answers. Chessclicker
keeps exact-line acceptance and its reward/next-puzzle behavior without an engine.

PGN practice follows a variation tree, Sparring plays beyond the authored line,
and endgames evaluates an objective. They can use the same chess position/input
layer, but their move acceptance, reply selection and completion policies differ.
Do not encode these policies as flags in a universal controller.

## Other identified duplication to address

| Responsibility | Observed implementations | Intended boundary |
| --- | --- | --- |
| Exercise turn progression | Native tactics, Blind, Pieceless and Chessclicker now use `line_exercise.js` | Shared continuation/validation/completion; adapters retain visibility, timing and rewards |
| Attempt state and cancellation | Native validation wrapper, Study replay revisions, endgame/editor counters, scoped Stockfish searches | Reusable attempt/task lifetimes with separate scopes for analysis, network reads and page resources |
| Startup/reset/teardown | Native modes and endgames now use `training_lifecycle.js`; Study uses its existing page owner | Shared page/run ownership; adapters retain loading and exercise identity checks |
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
