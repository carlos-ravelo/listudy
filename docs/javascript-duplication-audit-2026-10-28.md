# JavaScript duplication audit

Date: 2026-10-28.

## Scope and method

Reviewed the current source inventory of 134 JavaScript files under `assets/js/`.
Used repository-wide responsibility searches, an exact-block comparison excluding
imports/comments/blank lines, and manual inspection of consumers and existing
shared modules. Previous audit documents were treated as leads, not evidence of
the current implementation. This is a source review, not a measured duplication
percentage or an exhaustive browser regression assessment.

No application code was changed. The findings below distinguish a reproduced
behavioral divergence from consolidation opportunities.

## 1. Achievement thresholds repeat behavior and have diverged

Priority: medium. Confirmed in an isolated execution of current source.

Sources:

- [Achievement subclasses](../assets/js/components/achievements.js), especially
  `Student`, `Student2`, `Student3`, and `Student4` (lines 200–265).
- [Study completion](../assets/js/pages/study/study.js),
  `achievement_end_of_line()` (lines 308–318).

The student classes repeat event registration, counter lookup, numeric threshold
checking, and unlocking. They differ mainly in metadata, thresholds, and event
names. Endgame and tactics achievement subclasses repeat the counter/threshold
pattern too.

The study producer explicitly dispatches only the first two student events. No
producer for the third or fourth event was found under `assets/` or `lib/`.
Those classes only evaluate their counter inside their event callbacks.

Reproduction: initialize all four student classes with 500 learned lines, stub
only popup rendering, then execute the actual `achievement_end_of_line()` body.
The counter becomes 501; only `achievement_student` and `achievement_student2`
are unlocked. The 100- and 500-line achievements remain locked. This isolates the
event contract; it does not assert that these listeners mount on every study page.

Recommendation: describe threshold achievements as data and evaluate all matching
thresholds through one counter-change event. Preserve existing storage keys,
thresholds, visibility, and special achievements such as Konami and Night Owl.
Check mounting and initial evaluation as part of that change.

## 2. PGN annotation normalization has two implementations

Priority: medium. Consolidation candidate; no user-facing failure reproduced.

Sources:

- [Training tree creation](../assets/js/modules/pgn/tree_from_pgn.js),
  `createNode()` (lines 3–9).
- [Editor PGN import](../assets/js/modules/study/chapter_editor.js),
  `loadPgn()` / `line()` (lines 65–86).

Both translate `!`, `?`, `!!`, `??`, `!?`, and `?!` to numeric annotation glyphs,
combine them with explicit `$N` annotations, and remove duplicates. One converts
explicit values with `String(nag)` first; the other assumes strings. Changing the
annotation contract requires keeping both implementations aligned.

Recommendation: share annotation extraction/normalization only. Preserve the
separate tree builders: the editor validates legal moves, enforces a single
chapter and matching initial position, and manages editable comments/history;
training retains source indexes and puzzle metadata. Those differences justify
separate orchestration. Validate explicit/symbolic/duplicate annotations through
both consumers before changing them.

## 3. Engine score presentation repeats perspective conversion

Priority: low to medium. Consolidation candidate with intentional differences.

Sources:

- [Editor analysis](../assets/js/pages/study/study_editor.js),
  `analyzePosition()` (lines 135–139).
- [Sparring labels](../assets/js/modules/sparring/study_adapter.js),
  `evaluation()` (lines 316–321).
- [Evaluation bar](../assets/js/components/evaluation_bar.js),
  `evaluationBarValue()` (lines 3–9).

All three convert side-to-move centipawn scores into White's perspective and
handle mate scores. Formatting differs: editor uses fixed decimals and `M`;
Sparring uses locale-aware numbers and signed mate labels; the bar uses compact
labels and delegates probability conversion to `winningChances()`.

Recommendation: consider sharing score perspective/terminal-mate interpretation
if it needs to change. Keep each consumer's text format and locale policy. Do not
replace all three with one formatter merely to remove similar arithmetic, and do
not treat different labels alone as proof of a bug.

## 4. Tactics and Chessclicker duplicate puzzle input loading

Priority: low. Small, concrete duplication.

Sources:

- [Tactics](../assets/js/pages/training/tactics.js), `setup_last_move()` and
  `load_data()` (lines 89–110).
- [Chessclicker](../assets/js/pages/training/chessclicker.js), the same functions
  (lines 104–121).

Both read `fen`, `color`, `moves`, and `last_move` from the same hidden-input
contract and split the last move into board highlight squares. Tactics guards
against a missing last move; Chessclicker does not. That is a source-level
difference, not a reproduced Chessclicker failure: its input contract may ensure
that a last move is present.

Recommendation: share the puzzle snapshot reader and last-move parsing when this
area next changes. Keep the exercise startup, rewards, and next-puzzle behavior
in their consumers. The small size does not justify a general puzzle controller.

## Existing reuse and boundaries to preserve

- Board mutations and restoration already use `board_game.js` and
  `board_interaction.js` across multiple modes.
- Native tactics, Blind, Pieceless, and Chessclicker already share
  `line_exercise.js`; alternative validation uses `tactic_attempts.js`.
- Editor and endgame analysis use `latest_task.js`; shared page/run resource
  ownership uses `page_scope.js` and `training_lifecycle.js`.
- Study and game-mistake practice share `practice_sessions.js` and
  `practice_activity.js`.
- Promotion controls, PGN downloading, JSON requests, and search normalization
  already have shared implementations.
- Study replay, engine analysis, and exercise validation have different
  cancellation contracts; similar revision checks are not sufficient reason to
  unify their state machines.
- Collection account synchronization and study progress synchronization differ
  in merge/recovery/conflict policy. Do not merge them because both save JSON.
- Repertoire grading, endgame objectives, visualization scoring, and Chessclicker
  rewards retain different rules. A universal controller would hide these rules
  behind options instead of removing equivalent logic.

## Recommended order

1. Fix and consolidate the achievement counter/event contract with coverage for
   all tiers, initial evaluation, and component mounting.
2. Extract PGN annotation normalization with importer integration coverage.
3. Consolidate score interpretation only if a common semantic contract is agreed.
4. Extract puzzle snapshot loading when touching those two modes.

The review found localized repeated policies rather than evidence that the
application needs a broad rewrite. File count is not a useful success metric for
these changes; fewer independently maintained copies of the same rule is.

## Implementation follow-up

The four recommendations were implemented after this review:

- Achievement thresholds are declared as data. `achievement_progress.js` updates
  counters and publishes one event for all tiers. The shared site entry mounts
  achievement controls on study and native training pages too. Initial counters
  are evaluated once; LiveView updates rerender the list without registering new
  achievement instances or counting another document visit. Storage keys,
  thresholds, hidden tiers, and special achievement rules are retained.
- `pgn/annotations.js` normalizes annotations for both training trees and editor
  imports. Their distinct tree construction and validation rules remain separate.
- `scoreForPlayer()` in `sparring/evaluation.js` owns perspective and terminal
  mate interpretation. Editor, Sparring, and evaluation-bar formats remain distinct.
- `training/puzzle_data.js` reads current puzzle inputs and validates the last
  move for Tactics and Chessclicker. Page adapters retain assignments to the global
  lexical bindings supplied by templates, including after LiveView updates.

Regression coverage exercises all achievement tiers and mounting, importer
agreement and PGN round trips, score perspectives and presentation, and both puzzle
input adapters. Browser coverage loads the actual site, study, and tactics bundles.
