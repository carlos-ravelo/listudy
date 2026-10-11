# Custom Listudy features

## Table of contents

- [Custom Listudy features](#custom-listudy-features)
  - [Table of contents](#table-of-contents)
  - [Study page](#study-page)
    - [Reading a chapter](#reading-a-chapter)
    - [Chapter progress and recovery](#chapter-progress-and-recovery)
    - [Practice modes and spaced repetition](#practice-modes-and-spaced-repetition)
    - [Storage, reset and study layout](#storage-reset-and-study-layout)
  - [Game analysis](#game-analysis)
    - [Quick comparison page](#quick-comparison-page)
  - [Imported games and sync](#imported-games-and-sync)
    - [Mistake training](#mistake-training)
  - [Chapter editing](#chapter-editing)
    - [Study maintenance](#study-maintenance)
  - [Collections and derived studies](#collections-and-derived-studies)

## Study page

The chapter picker shows chapter numbers to distinguish chapters with identical
names. Chapter links can recover their destination by a unique title after
reordering.

On small screens and touch devices, arrow buttons below the board navigate to
the previous or next move. Manual navigation excludes the current run from a
clean FSRS review. Navigation is disabled during scheduled reviews.

### Reading a chapter

The compact **Mode: Practice / Mode: Read** toggle below the board changes how the chapter
is played. Practice is the default; the selected mode is not saved between visits.
Switching modes restarts the current chapter and cancels pending automatic actions.

In Read, the chapter starts at its initial position or custom FEN, including when
the study trains Black. Jump to key move and Max depth do not shorten the line.
The arrow buttons are visible on desktop as well as touch devices, and keyboard
navigation remains available. Comments always appear, independent of the saved
practice setting. A clickable move list appears beside the board on desktop and
below it on mobile. Desktop columns align each full move. The current move is highlighted; nested
variations can be collapsed and open automatically when navigating into them. Clicking a
move jumps to that position in its variation. Move numbers respect custom FENs, including Black
to move. A Starting position button returns to the beginning. Forward navigation
follows the first continuation in PGN order.
On mobile, the board and scrolling move list leave room for comments. Moves
appear in a compact inline list, and navigation arrows share the Moves heading.
Long comments can be expanded with Show more / Show less. Practice keeps its
full-width board and normal comment display.
Moves may also be played on the board for either side. A move outside the chapter
is undone and prompts the reader to choose a chapter continuation.

Reading does not record attempts, mistakes, coverage, recovery, move scores or
FSRS results. There are no automatic opponent replies, line resets or chapter
advances, and the reader can stay at the end of a line. Entering Read stops active
weak-chapter, scheduled-review and puzzle runs. Starting one of those practice
flows switches back to Practice.

### Chapter progress and recovery

A study contains chapters; a chapter is one PGN game and may contain alternative
moves inside its PGN tree. The progress UI treats the chapter as the user-facing
unit. Coverage counts only moves the learner can play, across all
lines in that chapter. Automatic opponent replies do not enter the denominator.
Replaying the same move in the same variation does not increase coverage. For a custom starting FEN, the first
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
Mistakes do not disqualify a completed practice. Editing chapter moves prevents old practice results from contributing to recent
accuracy for the updated content.

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
when the modal opens. The selector, modal and outside bar use consistent coverage and recovery cues.
Recent errors determine warning colors; historical mistake totals alone do not.
Green requires complete clean coverage, and pending reviews take precedence in
the selector and modal.

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
a successful review. The first mistake in an eligible run records a failed review
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

A single review card represents a chapter,
even when that chapter has multiple PGN alternatives. At present, one selected
full line grades that card; it does not prove every alternative was recalled
in that review. Hint use does not yet change the FSRS grade.

### Storage, reset and study layout

Signed-in users synchronize progress with their account; anonymous progress
stays in the browser. Editing moves or the starting position resets the chapter's
scheduled review card; comment-only edits keep it. Renaming and reordering
chapters through study maintenance preserve progress. New and duplicated chapters
start fresh. Replacing the complete PGN does not guarantee progress continuity.

**Reset progress** in the modal confirms before clearing chapter statistics,
FSRS cards and the older move scores used for hints. The study page keeps its
most-used training actions visible: Reset line, Puzzle run, Analyze position,
and quick hint/comment toggles. The Settings disclosure holds Jump to key move,
Move delay, Board reset delay, hint-arrow type and Max depth. More actions
holds Play against Stockfish, Copy chapter and Favorite study. Study details
and Comments have their own disclosures. This keeps the main training area
compact while preserving the controls.

## Game analysis

Games can be compared against the variations in owned studies to identify
repertoire departures and later transpositions. Matching considers the board,
side to move, castling rights and legal en passant. Reaching the end of a chapter
is treated as an end of book.

The matcher scans beyond departures to find later transpositions and retains
those earlier departures for display. Candidate ranking uses distinct matched
moves, then distinct noninitial positions. Equal top candidates are grouped by
their comparison outcome, including duplicate chapter titles. The exact matched game plies, final position, expected moves,
entry point and earlier departures must agree before chapters share a group.
Bulk results with conflicting outcomes are marked ambiguous and excluded from mistake training.

### Quick comparison page

The comparison page shows the uploaded game with selectable comparison outcomes. Equivalent chapters stay in
one expandable list; their unplayed continuations can still differ. Different
outcomes remain selectable alternatives. Match-count terminology is explained in
“How this match was found” instead of being the primary result label. Earlier
departures can be inspected on the same board.

Chapter links open in a new tab to preserve the uploaded-game comparison.

Imported-game training records a final user-side departure only when equally ranked chapters
agree on its position and expected moves. Earlier departures remain visible in
the analysis, but are not training exercises: they may be another move order
that later transposes into the repertoire.

## Imported games and sync

The analysis overview opens with **Last week** selected and orders training targets by the number of deviations, highest first (ties use the study title). Explicit **All time** and **Last month** choices still work, and training links carry the selected period.

Connected account cards check for newer finished games on page load. A notice
beside **Sync games** indicates when recent games are available. Manual syncing
remains available if the check fails. This checks recent games rather than gaps
in older history. Newly finished Chess.com games can take time to appear.

Imported games support platform, period, study and result filters, a filtered
total, and newer/older page navigation. Each game opens its saved comparison for
the selected study, with its PGN in an expandable section. Games without a
matching chapter show an explanation.

Sync displays a running, completed or failed status for each platform. The initial
Lichess import covers one year, and each platform request is currently limited to
3,500 games.

### Mistake training

Exercises group positions by pieces, side to move, castling rights and legal
en passant. The two FEN clock fields are excluded from grouping, while a full
FEN remains available for the board. Different played mistakes at the same
position still appear separately. Multiple repertoire moves are accepted as
valid answers.

## Chapter editing

Owners can choose **Edit chapter** on a study or its metadata edit page. Select
the chapter title heading to rename it or copy its selected text. The chapter
selector sits beside Back to study, separate from the editing actions. Title changes
are saved with **Save chapter**.
Select
a position with the move list, navigation buttons or Left / Right arrow keys.
Keyboard navigation remains available outside comment fields and other inputs. Select
Copy the highlighted move with Ctrl+C (Cmd+C on macOS), including its move number.
Selected text and text fields retain their normal copy behavior.
Select
a position in the move tree, play a legal move to add a continuation or a
variation, and edit the selected position's comment. Existing continuations are
navigated rather than duplicated. The promotion selector supports underpromotion.
The move editor edits standard-chess chapters; chapter creation, duplication,
reordering and deletion are available in the maintenance screen described below.
The move editor does not delete individual moves, collaborate, or run engine analysis.

Drafts are isolated from the study and training progress. **Save chapter** saves
one chapter in place, keeping the selected position. **Back to study** leaves
the editor. **Discard changes** restores its initial
snapshot. Switching chapters or leaving a dirty editor asks before discarding;
there is no automatic draft recovery after closing the page.

Saving changes preserves other chapters. Concurrent edits are detected and
rejected to avoid overwriting another save. Changes to moves reset the chapter's
scheduled review card; comment-only edits keep it.

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

Concurrent edits retain the local draft for recovery. Maintained chapters preserve
variations, comments and custom starting positions. Empty studies explain that
moves must be added before practice can begin.

## Collections and derived studies

The collections dialog lists collection names and chapter counts in a visible side panel (horizontal choices on mobile). **Add to collection** directly adds the current chapter to the active collection and confirms it with **Added to collection**. **Collections** opens the dialog to switch collections and manage chapters; **Add current chapter** also saves to the selected collection from inside the dialog. Chapters can be reordered, moved, removed, or exported as PGN.

Collection names can be edited inline. PGN export sits beside the title; the overflow menu contains only destructive actions. Save recovery controls appear only when account synchronization needs attention. Empty collections disable study creation, and source study headers visually separate chapter groups.

Signed-in users automatically save collections to their account. Conflicting
saves across tabs or devices are detected. Failed saves keep the local draft,
with **Retry save**, **Reload saved collections**, and PGN export available.
Reloading replaces the local draft. Browser collections are merged into the
first account that imports them, preserving saved collections and deduplicating
identical chapters. Anonymous collections stay in the browser.

**Create study** asks for a title and practice side, saves outstanding collection edits, and creates a private study owned by the signed-in user. Chapters retain order, comments, variations and starting positions. Exported PGN records the source study. Practice history and spaced repetition start fresh. The source studies and collection are retained; derived chapters are independent snapshots. The new study opens in maintenance.

Collections support up to 100 names, 500 chapters per collection and 2 MB in total. Creating a study requires one standard-chess chapter per entry.
