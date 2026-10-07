# Custom Listudy features

## Table of content

- [Custom Listudy features](#custom-listudy-features)
  - [Table of content](#table-of-content)
  - [Study page](#study-page)
    - [Reading a chapter](#reading-a-chapter)
    - [Chapter progress and recovery](#chapter-progress-and-recovery)
    - [Practice modes and spaced repetition](#practice-modes-and-spaced-repetition)
    - [Storage, reset and study layout](#storage-reset-and-study-layout)
  - [Game analysis](#game-analysis)
    - [Quick comparison page](#quick-comparison-page)
    - [Processing and setup](#processing-and-setup)
  - [Imported games and sync](#imported-games-and-sync)
    - [Mistake training](#mistake-training)
  - [Chapter editing](#chapter-editing)
    - [Study maintenance](#study-maintenance)

## Study page

`assets/js/study.js` owns the chess engine and initializes feature views after the
chapter selector is ready. It supplies `getCurrentChapter()` and invokes each
view's `update()` after a chapter change.

- `modules/study_page_controls.js`: chapter picker, clipboard, keyboard and puzzle-run controls.
- `modules/study_collections.js`: collection rendering and user actions.
- `modules/study/collection_store.js`: browser storage, migrations and collection operations.
- `modules/study/chapter_pgn.js`: shared raw PGN extraction and chapter-link resolution.
- `modules/study/chapter_stats.js`: mistakes, distinct move coverage and recovery.
- `modules/study/chapter_review.js`: chapter review cards and FSRS scheduling.
- `modules/study/study_move_tree.js`: clickable chapter notation, collapsible variations and position reconstruction with the existing chess library.
- `templates/study/_chapter_controls.html.eex` and `_collection_modal.html.eex`: static markup.
- `assets/css/features/study_extensions.css` and `study.css`: feature and progress styling.
- `templates/study/show.html.eex`: training controls and the Alpine-powered progress modal.

Collections remain browser-local. Migration saves the replacement before deleting
legacy data; unreadable storage is preserved. Chapter links include a zero-based
index and title. A unique title can recover a link after reordering. These are
positional references, not permanent chapter IDs across simultaneous renames and
reordering. Legacy title-only links must match a unique title, never a substring. Title
comparison tolerates the whitespace around parentheses and braces added by the
study page’s PGN cleaner, including in Event headers. The chapter picker displays
chapter numbers so identically named lines can be distinguished.

On small screens and devices with a touch pointer, two compact arrow buttons
below the board navigate to the previous or next move using the same actions
as the keyboard. Each button has a 44-pixel touch target and an accessible
label. Buttons are disabled at the corresponding end of a line and during
scheduled reviews. Manual navigation disqualifies the current run from a
clean FSRS result, just as keyboard navigation does.
Both input methods synchronize the position, turn, check indicator, last-move
highlight, legal moves, comments and analysis links. Navigating cancels pending
automatic replies, line resets and chapter advances from the previous position;
it does not record a correct move or a mistake. Navigation regression checks:
`node assets/test/unit/study_navigation.cjs`.

Unversioned static files revalidate with ETags instead of being cached for a year.
The study script URL includes a one-time revision to bypass previously cached
copies. Phoenix digest URLs keep their existing long-lived cache policy. Changes
to the endpoint cache policy require the running application to reload/restart.

### Reading a chapter

The compact **Mode: Practice / Mode: Read** toggle below the board changes how the chapter
is played. Practice is the default; the selected mode is not saved between visits.
Switching modes restarts the current chapter and cancels pending automatic actions.

In Read, the chapter starts at its initial position or custom FEN, including when
the study trains Black. Jump to key move and Max depth do not shorten the line.
The arrow buttons are visible on desktop as well as touch devices, and keyboard
navigation remains available. Comments always appear, independent of the saved
practice setting. A clickable move list appears beside the board on desktop and
below it on mobile. Desktop Number, White and Black columns align each full move, with
alternating row backgrounds and a soft panel surface. The current move uses a
subtle outline and bold text without a colored background; nested variations fold with
native disclosures and open automatically when navigating into them. Clicking a
move rebuilds its complete line from the chapter's starting position, preserving
the history and analysis links. Move numbers respect custom FENs, including Black
to move. A Starting position button returns to the beginning. Forward navigation
follows the first continuation in PGN order.
On mobile, Read sizes the board to at most 38% of the viewport height and limits
the scrolling move list to 18%, leaving room for the selected move's comments.
Moves wrap in a compact inline list with individual move-number prefixes instead
of columns; foldable variations and the active-move outline remain available.
In Read, the navigation arrows share the Moves heading instead of occupying a
separate row below the board; switching to Practice restores their board location.
Long comments initially show a six-rem preview with Show more / Show less.
Navigating to another position collapses the preview again. Switching modes or
resizing the viewport recalculates the board size; Practice keeps its full-width
board and normal comment display.
Moves may also be played on the board for either side. A move outside the chapter
is undone and prompts the reader to choose a chapter continuation.

Reading does not record attempts, mistakes, coverage, recovery, move scores or
FSRS results. There are no automatic opponent replies, line resets or chapter
advances, and the reader can stay at the end of a line. Entering Read stops active
weak-chapter, scheduled-review and puzzle runs. Starting one of those practice
flows switches back to Practice. Regression coverage for mode changes, branching,
comments and read-only statistics is in `assets/test/unit/study_navigation.cjs`.

Existing viewers were considered: [Lichess PGN Viewer](https://github.com/lichess-org/pgn-viewer)
and [mliebelt PGN Viewer](https://github.com/mliebelt/pgn-viewer) provide complete
game viewers with their own board and navigation state. This integration adds a
notation view over Listudy's existing parsed tree and reuses `chess.js` to replay
selected paths. Alpine controls Read visibility; native disclosure elements fold
variations. No additional PGN parser, chess engine or viewer dependency is added.
Tree numbering, branching, disclosure behavior and chapter switches are checked
with `node assets/test/unit/study_move_tree.cjs`.

### Chapter progress and recovery

A study contains chapters; a chapter is one PGN game and may contain alternative
moves inside its PGN tree. The progress UI treats the chapter as the user-facing
unit. `chapterMoveCatalog()` counts only moves the learner can play, across all
lines in that chapter. Automatic opponent replies do not enter the denominator.
Each playable move is identified by its SAN path through the tree, so replaying
the same move does not increase coverage. For a custom starting FEN, the first
move belongs to the learner; for a standard start, the study color determines
which plies belong to the learner.

| Measure | Meaning |
| --- | --- |
| Moves practiced | Distinct correct learner moves / all trainable learner moves in the chapter. The outside bar shows this percentage for the currently selected chapter, rounded to a whole number. |
| Recent first-try accuracy | Moves correct on the first try / learner moves tested in the last five completed practices, rounded to a percentage. The number of contributing practices is displayed. |
| Current / Last practice | Learner moves missed on the first try / moves tested in the ongoing practice, otherwise in the last ended practice. Interrupted practices are explicitly marked incomplete. |
| Clean moves since last mistake | Distinct correct learner moves accumulated since the most recent mistake. A mistake clears this set. The chapter recovers when this set covers every trainable move, even across several complete lines. |

One correct move can therefore make the bar 100% only when that is the chapter's
only trainable move. A 100% coverage bar says every move has been practiced at
least once; it does not claim that every attempt was correct. Green means all
trainable moves have been played correctly since the last mistake. Historical
mistake and correct-attempt totals are retained for internal calculations but are
not displayed. The recent metrics begin with new practice records; historical
totals cannot be converted into individual practice results. Older practice
records without first-result data are also excluded rather than converted.
Each decision is identified by its complete SAN path before the learner move.
Repeated mistakes at that decision count as one missed move; eventually playing
it correctly does not turn it into a first-try success. Only learner moves in
the practiced line form the denominator, not every move in the chapter or the
automatic opponent replies. For example, missing one of fifteen moves yields
`Last: 1/15 moves missed` and 93% first-try accuracy. Until a practice
completes, recent accuracy displays a dash. Read and manual navigation do not
create completed practice results. Leaving a line, changing chapters, resetting,
entering Read, reaching a depth cutoff or reloading marks an attempted practice
incomplete; empty practices are discarded. Only natural line completions without
manual navigation or key-move skipping enter the five-practice accuracy window.
Mistakes do not disqualify a completed practice. Practice records carry the PGN
signature so edited chapter content does not inherit recent results from old
content. Check these calculations with `node assets/test/unit/chapter_practice.cjs`.

The chapter picker above the board prioritizes the current or last practice's
missed/tested move ratio, using the same first-result data as Progress. Coverage
is a secondary measure in Progress rather than the selector's primary badge.
Its tooltip includes recent first-try accuracy and coverage. The cues are gray for new,
amber for due, green for recovered, red for mistakes and neutral for other
partial practice. Review due takes precedence in the picker when a chapter's
scheduled review time arrives. The Progress
modal lists chapters with due reviews first, then unrecovered chapters by
recent mistake rate; it shows recent accuracy, mistakes in the current or
last practice, distinct move coverage and the next review time where applicable.
Its chapter rows navigate
to the selected chapter. The current chapter is marked and scrolled into view
when the modal opens. Alpine.js renders the list and action-button state from
`study-progress-updated` and practice-run events.
The selector, modal and outside bar share `chapterProgressState()` for coverage,
recovery and status colors. Recent errors determine warning colors; historical
mistake totals alone no longer color these views. Green still requires complete
clean coverage, and pending reviews take precedence in the selector and modal.

### Practice modes and spaced repetition

The Progress modal contains two practice actions. Both use the chapter
board. Due reviews force a full line from the start; weak practice follows
normal chapter settings:

- **Practice weak chapters** selects chapters with at least one historical
  mistake that have not yet recovered. It orders them by a smoothed mistake
  ratio, `mistakes / (attempts + 5)`, with total mistakes as a tiebreaker.
  It advances after a line ends or reaches the configured Max depth. A chapter
  with several alternatives can remain weak afterward and be selected again
  in a later run.
- **Review due chapters** selects chapters with an FSRS review card whose due
  time has arrived. It orders them by due time and plays one full line from
  the chapter's starting position for each selected chapter. The button
  appears only when reviews are due or a review run is active. The picker and
  modal also mark due chapters. While the page stays open, a timer refreshes
  the UI when the next review becomes due.

The two actions have different selection rules but share practice results.
Completing an eligible clean line updates the chapter's FSRS card with
`Rating.Good`. The first mistake in an eligible run records `Rating.Again`
right away; further moves in that same run do not grade the card again.
FSRS uses one 10-minute learning step and one 10-minute relearning step, so
a missed line is normally due again in ten minutes. The date after a clean
line is calculated by FSRS rather than by a fixed Listudy interval. A chapter
has no FSRS card until an eligible practice result occurs; old correct and
mistake totals are not converted into invented reviews.

An eligible run starts at the chapter's beginning. Normal practice with Jump
to key move can skip known opening moves; if it skips moves, that run does not
grade FSRS. Manual forward/back navigation also disqualifies a clean review.
A Max depth cutoff does not count as a clean completion unless the actual PGN
line ends there. In Review due chapters mode, Listudy bypasses Jump to key
move and Max depth, and disables manual forward/back navigation so the learner
plays the whole selected line. Reset line restarts an unfinished run without
grading a clean completion; an earlier mistake in that run has already been
recorded. The due and weak queues are separate and stop
the automatic Puzzle run mode when started. Selecting a chapter manually stops
the active queue.

The scheduler is the pinned `ts-fsrs` package. Listudy records chapter-level
review results and lets the library calculate due dates; it does not implement
its own spaced-repetition formula. A single review card represents a chapter,
even when that chapter has multiple PGN alternatives. At present, one selected
full line grades that card; it does not prove every alternative was recalled
in that review. Hint use does not yet change the FSRS grade.

### Storage, reset and study layout

`study.js` persists two versioned JSON records per study through
`StorageAdapter`:

| Key suffix | Contents |
| --- | --- |
| `_chapter_stats` | Per-chapter `attempts`, `errors`, distinct `coveredMoves` and `cleanMoves` since the last mistake. |
| `_chapter_reviews` | Per-chapter FSRS card and a signature of the chapter's move tree and starting FEN. |

`StorageAdapter` writes to browser `localStorage` immediately and syncs to the
server's `user_settings` table for signed-in users. Anonymous progress stays
in the browser. The signature ignores comments and mutable training scores;
editing the move tree or starting FEN invalidates the old review card for that
chapter. Managed chapters carry a `ListudyChapterId` PGN header, and statistics
and review cards use this identity rather than their position. The first
maintenance save records `ListudyOriginalIndex` to migrate existing positional
records, excluding blank source chapters from the old playback indexes.
Reordering and renaming preserve progress; new and duplicated chapters start
fresh. Unmanaged PGNs still use positional keys; replacing the complete PGN
without retaining chapter identities does not guarantee progress continuity.
Existing attempt and
mistake totals are preserved when coverage fields are added, but past moves
cannot be reconstructed, so distinct coverage begins with newly recorded
moves. For old data without `cleanMoves`, a chapter with zero mistakes can
reuse its recorded `coveredMoves`; a chapter with mistakes must earn a clean
set after the update.

**Reset progress** in the modal confirms before clearing chapter statistics,
FSRS cards and the older move scores used for hints. The study page keeps its
most-used training actions visible: Reset line, Puzzle run, Analyze position,
and quick hint/comment toggles. The Settings disclosure holds Jump to key move,
Move delay, Board reset delay, hint-arrow type and Max depth. More actions
holds Play against Stockfish, Copy chapter and Favorite study. Study details
and Comments have their own disclosures. This keeps the main training area
compact while preserving the controls.

The asset build requires Node 20 or newer (`.nvmrc` and
`assets/package.json`). Webpack transpiles Alpine.js and `ts-fsrs` for the
existing Safari 13 and minifier targets. Focused study feature checks run with
`node assets/test/unit/study_features.cjs`; build assets with
`npm run deploy` from `assets/` after selecting Node 20.

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

The matcher returns `matched_plies` for comparison grouping. Imported-game
training records a final user-side departure only when equally ranked chapters
agree on its position and expected moves. Earlier departures remain visible in
the analysis, but are not training exercises: they may be another move order
that later transposes into the repertoire. Existing analysis results remain
valid at `positions-v3` because matching semantics have not changed.

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

## Imported games and sync

`Listudy.Games.ImportedGames` reads saved Chess.com and Lichess games in pages of
20. The list selects metadata only, then fetches study summaries for those games.
It shows a filtered total and supports newer/older cursor navigation. Filters
for platform, period, study and result use owner-scoped data. A game row opens
its comparison directly for the displayed study; the comparison page contains
saved study results and the PGN in a collapsible section. A game without a
matching chapter gets an explanation on that page. The old game detail URL
redirects to comparison. The training route also checks ownership before
reading mistakes.

`GameSync` stores a visible per-platform running/completed/failed state. A failed
Chess.com monthly archive now fails the sync, so the next attempt can retry the
same month. Lichess sync overlaps the prior 24 hours and relies on the
per-user/platform/game-ID unique constraint to deduplicate results. Imported
analysis reads only game metadata until it has identified pending games, then
loads PGNs in batches of 50.

Apply migration `20260928000000_scope_imported_games_and_index_recent_games` before
using the new routes or syncing. It scopes game uniqueness to the Listudy user,
adds indexes for recent-game queries and creates `game_syncs`. The initial
Lichess download covers one year and each platform request currently caps at
3,500 games; earlier history needs a separate backfill design. Background sync
runs as an unmonitored task, so a server restart can leave a stale `running`
state until the next sync.

### Mistake training

Exercises group positions by pieces, side to move, castling rights and legal
en passant. The two FEN clock fields are excluded from grouping, while a full
FEN remains available for the board. Different played mistakes at the same
position still appear separately. Multiple repertoire moves are accepted as
valid answers. The browser creates the position indicators once and only
updates indicators whose state changes.

### Chapter editor

Owners can choose **Edit chapter** on a study or its metadata edit page. Select
a position in the move tree, play a legal move to add a continuation or a
variation, and edit the selected position's comment. Existing continuations are
navigated rather than duplicated. The promotion selector supports underpromotion.
The move editor edits standard-chess chapters; chapter creation, duplication,
reordering and deletion are available in the maintenance screen described below.
The move editor does not delete individual moves, collaborate, or run engine analysis.

Alpine owns the editor controls, draft indicators and save state. The pure chapter
model stays independent of Alpine; Chessground and the move-tree renderer are
contained in the component lifecycle and kept outside reactive state.

Drafts are isolated from the study and training progress. **Save chapter** saves
one chapter and returns to playback. **Discard changes** restores its initial
snapshot. Switching chapters or leaving a dirty editor asks before discarding;
there is no automatic draft recovery after closing the page.

The server uses the existing python-chess dependency to validate every variation
and preserve headers, comments and NAGs. Only the edited chapter is reserialized;
other chapters retain their source text. A whole-file SHA-256 revision rejects
stale saves with HTTP 409. Upload replacements and editor saves share a locked,
atomic PGN writer. Existing review signatures already invalidate scheduled cards
when the chapter's move structure changes; comment-only edits keep those cards.

Checks: `node assets/test/unit/chapter_editor.cjs`,
`node assets/test/unit/chapter_editor_browser.cjs` (requires built assets and
Chrome), Python's `test_study_editor.py`, and the Elixir `study_pgn_test.exs` and
`study_editor_controller_test.exs` suites.

### Study maintenance

The study's Edit link opens a chapter list. Owners can rename titles inline,
move chapters up or down, and open the existing move/comment editor. A More menu
contains Duplicate and Delete. Add chapter creates an empty draft; saving enables
its editor link. New and duplicated chapters must be saved before editing moves.
Each row remains usable on mobile, with the title above its actions.

Changes remain in a draft until Save chapter changes. The save bar stays visible
at the bottom while scrolling; Discard changes restores the original list.
Deleting a chapter confirms its title, and at least one chapter must remain.
Leaving or opening an editor with an unsaved draft asks before discarding it.
Metadata, privacy and complete PGN replacement are in a separate expandable
section; deletion of the whole study is another disclosure.

The server checks ownership, validates chapter references and unique identities,
and uses the existing whole-file revision and atomic writer. Concurrent edits
return HTTP 409 and retain the local draft. Python-chess retains variations,
comments, NAGs and custom starting positions when serializing maintained chapters.
An all-empty study explains that moves must be added before practice can begin.

Checks: `test_study_maintenance.py`, `study_pgn_test.exs`,
`study_editor_controller_test.exs`, and `node assets/test/unit/chapter_identity.cjs`.
