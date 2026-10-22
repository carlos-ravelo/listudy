# Responsibilities, Alpine, and components in `study.js`

Date: 2026-10-22. Reference: `4962dcc4`. Static review of the current code;
line numbers refer to that revision. This audit does not change the application.

## Findings

`study.js` combines page composition, several practice workflows, persistence,
and presentation. The useful boundary is for the engine to publish state and
receive commands while UI components display that state. Alpine fits controls
and views; Chessground and training rules retain their own implementations.

The file has 2,080 lines, 90 function declarations, 37 ES import declarations,
and 59 bindings in top-level variable declarations. The latter include constants
and adapter references, not just mutable state. `handle_move` has 265 lines and
`main` has 212. These figures come from the AST; they do not measure performance
or estimate removable code.

## Implementation progress

Delivery 1 is implemented after this audit. `study/preferences.js` owns the six
cyclic options and reads/writes through `StorageAdapter`; the engine reads their
values directly. `components/study_preferences.js` registers the Alpine view and
connects commands to model updates. The existing General panel is the component
root, preserving markup structure, IDs, classes, and Bootstrap tab ownership.

Stored translated values and tactics-specific keys/defaults remain compatible.
Preferences reload after hydration; controls stay disabled until the engine
publishes its ready snapshot. Initialization/reloading does not persist defaults,
and labels no longer act as preference state. The binding returns listener
cleanup without introducing a second page initializer.

`study.js` decreased from 2,080 to 1,896 lines. The responsibility map and line
references below describe the original audit revision. Depth, progress, comments,
run coordination, and general page teardown remain subsequent deliveries.

Verification covers model cycles, hydration, snapshot isolation, tactics defaults,
command cleanup, delayed account hydration in Chrome, edited DOM labels, icons,
sync/reload, existing study geometry, settings tabs, focus, depth, and tactics.

## Responsibility map

| Current responsibility | Evidence in `assets/js/study.js` | Suggested boundary |
| --- | --- | --- |
| Startup and composition | `main`, 1801–2012; initializes storage, board, trees, sessions, Sparring, controls, and modes | Keep a small composition entry point connecting modules and providing dependencies |
| PGN and chapter loading | `setup_trees`, 1204; `setup_chapter_select`, 1246; separate reading and practice trees | Document/chapter model; changing chapters remains a domain operation with a selection adapter |
| Move execution | `handle_move`, 402; `ai_move`, 1082; `play_move`, 1114; `start_training`, 1123 | Practice controller; separate evaluation, recording, and transition before extracting the whole workflow |
| Smart and directed practice | `smartIntroductionMove`, 140; `selectNextSmartPosition`, 155; `updateSmartRun`, 198 | Smart controller using existing selection and review models |
| Mistakes, weak chapters, and reviews | `showFailedPosition`, 227; queue/review functions, 668–777 | Run controllers with distinct policies; preserve ordering, recovery, and completion rules |
| Board state and context replay | `presentPracticePosition`, 94; `setup_move`, 1025 | Imperative Chessground adapter and cancelable replay controller |
| Hints, arrows, and explanations | `give_hints`, 841; `display_arrows`, 866; `create_comment`, 927; `display_comments`, 980 | Separate assistance decisions from comment and shape rendering |
| Preferences and depth | initialization, 279–310; toggles, 1365–1513; depth, 1515–1573; values, 1699–1737 | Preference model plus Alpine settings and depth components |
| Progress and persistence | recording, 787–818; `update_progress`, 1584; reset, 1660; hydration/sync in `main` | Progress projection, persistence, and reset separated from rendering |
| Reading and manual navigation | `update_read_mode_ui`, 2017; `set_read_mode`, 2027; navigation, 2039–2080 | Reading controller reusing existing tree/navigation components; Alpine reflects its state |

Existing extractions already provide useful boundaries: `position_review.js`,
`chapter_stats.js`, `progress_preservation.js`, `position_context.js`,
`study_sessions.js`, `study_activity.js`, `sparring/study_adapter.js`, and
`study/visualization.js`, among others. Reuse them and reduce the coordination
remaining in this file rather than introducing parallel models.

## UI already using Alpine

- `show.html.eex:36`: reading state, comment expansion, and overflow detection.
- `show.html.eex:69`: hint-button visibility according to reading mode.
- `_study_progress.html.eex:1`: chapter list through `x-for`, states, metrics,
  practice selection, and review actions.
- Editor and maintenance already register components through `Alpine.data`.

Progress already has a useful boundary: the engine emits `study-progress-updated`
and Alpine renders its data. The remaining work is separating data preparation
and the refresh timer from practice rules.

Bootstrap already owns modals and tabs through `bootstrap_modals.js`,
`bootstrap_study_controls.js`, and `dialog_lifecycle.js`. Those states must retain
one owner.

## Alpine candidates

| Priority | Candidate | Alpine responsibilities | Domain responsibilities |
| --- | --- | --- | --- |
| High | Hint, comment, delay, and review settings | Labels, icons, clicks, and selected values for the six cyclic controls | Valid values, defaults, persistence, and training effects |
| High | Practice depth | Slider, ± buttons, output, checkbox, bounds, and highlighting | Catalogue scope, per-chapter depth, and applying changes when settings close |
| Medium | Run indicators | Text, visibility, and action availability for Smart, mistakes, reviews, and weak chapters | Active run, counters, queue, and completion |
| Medium | PGN explanations | Safely rendered list of headings and comments | Which comments to reveal and when revealing them counts as assistance |
| Low | External analysis links | `href` and export command from a position snapshot | Complete PGN, orientation, selected variation, and Lichess fallback |

### Settings: the recommended first change

The six toggles (`toggle_arrows`, `toggle_arrow_type`, `toggle_key_move`,
`toggle_review`, `toggle_move_delay`, `toggle_comments`) read `textContent`, compare
translations, and write DOM, state, and storage. `set_options_values` writes the
same labels again.

The model should own the value, with the label derived from it. A component
registered as `studyPreferences` could connect existing controls to an option
model and shared cycling helper. The template would retain its buttons, classes,
IDs, accessible descriptions, and layout.

Stored values currently include translated strings. Stable identifiers require
a compatible reader or explicit migration preserving valid preferences. Tactics
also has separate defaults and keys (`tactics_show_arrows`,
`tactics_show_comments`) alongside repertoire settings. Do not combine this
storage-format change with the first UI extraction.

`key_move` is hidden in the template, but its preference still participates in
`start_training`; being hidden does not make it removable.

### Depth: visual control and deferred application

The component should receive the active chapter, available depth, value, and
enabled state. The engine continues interpreting `DEPTH_MAX = -1` and applying
scope. Chapter changes must refresh the component without accidentally writing
the previous chapter's value.

Currently, the slider marks `depthSettingsChanged` and updates progress, while
`onDialogClosed` decides whether to restart practice. Preserve that decision:
dragging the slider must not repeatedly restart sessions or alter Read. Closing
must not acquire a second Alpine modal manager.

### Indicators and comments

A status component can present `{ visible, message, completed }` and available
actions. It must not impose a generic message when Smart emits empty text:
short review chains deliberately hide it.

An explanation list could receive engine-prepared rows and use `x-for`/`x-text`.
Currently, `create_comment` constructs nodes and delegates to `set_text`, which
uses `textContent` for untrusted PGN text. Preserve this contract; replacing it
with `x-html` would change rendering security.

Revealing comments or arrows can change `assistedPositions` and therefore grading.
The visual component must not decide whether an answer was assisted or record a
review from a presentation watcher.

## Reusable candidates

| Proposed piece | Identified reuse | Scope and limits |
| --- | --- | --- |
| Cyclic option control | Six existing toggles share reading/cycling/label behavior | Option helper plus parameterized presentation; a general form generator is unnecessary |
| Study-settings model and view | Repertoires and tactics collections use the same screen with different defaults | Share model/component and parameterize differences; do not duplicate templates per study type |
| Run indicator | Smart, failed positions, and chapter runs update messages and visibility | Share presentation while retaining each run's rules and messages |
| Chapter-progress projection | Alpine progress panel and chapter picker consume `study-progress-updated` | Extract preparation of the common data they already share; retain the event and consumers |
| Move explanations | Read and practice use the same format with different reveal policies | Share rendering; do not assume the editor's comment form has the same contract |
| Position-context controller | Smart and mistake practice already use `presentPracticePosition` | Extract the adapter remaining in `study.js`, reusing `replayPositionContext`; do not build another replay implementation |

A Smart controller, chapter coordinator, or reset module can also improve
isolation with only one consumer. That is modularization, not evidence of reuse
across screens. The depth control also initially has only one mounting location.

## Responsibilities to keep outside Alpine

- Move evaluation, promotions, continuation selection, NAG/traps, scheduling,
  recovery, and result recording.
- `Chess` and Chessground instances, complete PGN trees, catalogues, workers, and
  storage operations. Do not make them a global reactive store.
- Board animations, shapes, and overlays, which require imperative APIs.
- `StorageAdapter` persistence with current hydration, identities, and sync.
  Alpine's persistence mechanism does not replace that contract.
- Bootstrap modals and tabs, including focus, closing, and blocking events.

`analysis/game_replay.js` already handles linear replay with cached positions;
study practice has variations, scoring, and response selection. There is no
evidence for replacing both with one player. `game_progress.js` already shares
game evidence and directed-practice targets. `training_moves.js` already
centralizes expected-response splitting. None needs another wrapper merely to
make `study.js` look smaller.

## Coupling and extraction constraints

1. **Initialization.** `Alpine.start()` runs at line 48, before local variables
   and asynchronous hydration in `main`. New components must register before
   startup and receive ready state when it exists. Reading uninitialized
   variables or persisting defaults from `init()` could alter hydrated settings.
2. **One owner per state.** Replace manual writes when a control moves to Alpine.
   Do not keep `hidden`, `x-show`, and imperative handlers competing over its
   presentation. Components send commands; the engine confirms display state.
3. **Globals and mode changes.** `window.chess`, `window.trees`, `window.chapter`,
   `window.curr_move`, template configuration, and several modules share implicit
   state. Read, Sparring, and practice can replace it. The first delivery should
   encapsulate access without simultaneously changing those contracts.
4. **Cancellation.** `trainingSessionId` invalidates replies and pauses after
   context changes. Preserve it for moves, traps, context, and automatic advance.
5. **Lifecycle.** `main` installs listeners and a review timer without returning
   general teardown. `setupStudySessions` already exposes `destroy()`; several
   other adapters expose only `update()`. This is not evidence of duplication
   during a normal page load, but remounting requires propagating cleanup for
   each adapter's listeners, timers, and resources.
6. **File-coupled tests.** `study_navigation.cjs`, `smart_controls.cjs`, and
   `weak_practice_mode.cjs` extract functions from `study.js` through AST or slices.
   Extractions must migrate them to imports from the new modules while retaining
   domain scenarios and browser regressions.

Binding analysis found seven names without local references: `Chessground`,
`string_hash`, `clear_local_storage`, `tree_value`, `need_hint`, `value_sort`, and
`chapterMastery`. These are candidates for separate cleanup. This does not prove
that entire modules are unused or justify removing load-time effects without
reviewing other consumers.

## Proposed delivery order

| Delivery | Work | Relative risk | Required verification |
| --- | --- | --- | --- |
| 1 (complete) | Preference model and Alpine settings component; initially preserve stored format | Low/medium | Hydration, persistence, languages, tactics defaults, hints/comments, settings browser tests, and player journey |
| 2 | Depth component using the existing scope model | Medium | `practice_scope.cjs`, `study_navigation.cjs`, chapter changes, maximum sentinel, restart on close, and no restart in Read |
| 3 | Progress projection and run indicators; reuse the existing Alpine panel | Medium | Metrics, ordering, due-date timer, chapter selection, empty Smart messages, and sessions |
| 4 | Separate comment selection from rendering | Medium | Untrusted PGN text, variations, Read, hidden visualization, and assistance grading |
| 5 | Extract run/context coordination, then split `handle_move` | High | Smart, mistakes, weak chapters, reviews, Sparring, traps, underpromotion, assistance, cancellation, and directed practice |
| 6 | Reduce `main` to composition and formalize page teardown | High | Progress identity, resets, hydration/merge, navigation, remounting, and no duplicate resources |

Benefits do not require completing all six deliveries. The first removes visible
text as the preference controller and establishes a UI boundary without rewriting
move validation.

Each implementation delivery requires contract tests for extracted behavior,
relevant browser regressions, and a build. When rendering ownership changes,
compare geometry, themes, focus, and keyboard behavior without layout changes.
No token-saving estimate or arbitrary file-length target is promised.

## Audit validation scope

Function, template, adapter, and consumer review; AST analysis of `study.js` for
sizes and bindings. No training runs, benchmarks, or functional suites were
executed for this document. Listed risks are refactoring constraints, not newly
reproduced regressions.
