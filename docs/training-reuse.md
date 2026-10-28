# Training reuse

## Existing shared behavior

| Responsibility | Shared implementation | Consumers |
| --- | --- | --- |
| Coordinate notation, move inspection and UCI execution | `assets/js/modules/chess_moves.js` | Native tactics, Blind, Pieceless, endgames, Sparring, standalone Stockfish and legacy SAN/UCI wrappers |
| Legacy board/color helpers | `assets/js/modules/chess_utils.js` | Legacy board modes |
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
