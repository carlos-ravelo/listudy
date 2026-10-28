# Training reuse

## Existing shared behavior

| Responsibility | Shared implementation | Consumers |
| --- | --- | --- |
| Legal destinations, SAN/UCI conversion | `assets/js/modules/chess_utils.js` | Legacy board modes |
| Board interaction, authoritative position restoration and legal destinations | `assets/js/modules/board_interaction.js` | Editor, Sparring, native tactics, Pieceless, endgames; `chess_utils.js` delegates destination mapping for legacy board modes |
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
underpromotion. `play_stockfish.js` also converts coordinates to SAN and extracts
only four characters from an engine best move. These paths do not use the shared
promotion controller. Blind selects queen promotions when matching destinations.
These are observed implementation differences, not proof that every path fails.

Next, define and test the intended promotion behavior per exercise before moving
these callers onto shared input handling. Blind's destination-only interaction and
PGN authored underpromotion must be preserved or deliberately changed.

### Board interaction state

Editor, Sparring, native tactics, Pieceless and endgames share
`board_interaction.js` for turn/check state, legal destinations and blocking.
Native retries restore FEN, turn, movable color and destinations together.
Pieceless suppresses check while pieces are hidden; review can change interaction
without replacing the visible board. Mode-specific input handlers and user
preferences stay attached to Chessground.

`study.js` and Blind still render their own positions. Their destination mapping
now uses the shared implementation through `chess_utils.js`. Next, migrate Study's
replay/trap states and Blind's visible/logical position split after adding tests
for those policies. Keep turn eligibility in each mode; a position's legal moves
alone do not authorize the player to move.

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
history. PGN practice follows a variation tree; Sparring plays beyond the authored
line; endgames evaluates an objective. SAN/UCI conversion and temporary position
inspection are candidates for reuse. Accepting a move, selecting an opponent reply,
completing an exercise and awarding progress remain domain policies.

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
