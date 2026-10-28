# Bootstrap component migration plan

Date: 2026-10-21. Branch: `migration/bootstrap-ui`.
Documentation translated to English on 2026-10-22.
The analysis overview, personal library, and training pages are migrated. The four
training dialogs use Bootstrap. Collections and the opening picker complete
phase 4; creation and maintenance load their own Bootstrap resources. Chapter
editing and blank creation also use separate Bootstrap resources. Games,
comparison, and mistake practice complete the analysis-page migration. The
simplified tactics library also uses the shared layout.

## Outstanding work and next delivery

- [x] Separate resources, shared modal, navigation, and theme.
- [x] Analysis overview and PGN import (phase 1).
- [x] Personal library: groups, moving studies, and menus (phase 2).
- [x] Normalize controls in migrated dialogs.
- [x] Shared blocking-dialog detection for practice time, shortcuts, and feedback.
- [x] Phase 3: move settings, information, Sparring history, and progress to
  `ui_modal`; replace manual tabs and adapt close events.
- [x] Phase 3: prepare styles and enable the Bootstrap training layout; verify
  depth, reviews, and practice modes.
- [x] Phase 4: shared collections modal preserving drafts.
- [x] Phase 4: opening picker and Bootstrap creation/maintenance resources.
- [x] Phase 5: chapter editor and blank creation with Bootstrap resources.
- [x] Phase 5: imported games, comparison, and mistake practice.
- [x] Simplified tactics library with shared search and preferences.
- [x] Phase 5: shared theme adapters for fields and secondary buttons.
- [x] Phase 5: consolidated collection styles and removal of obsolete rules.
- [x] Phase 5: shared library/training variants and surfaces, preserving board
  styling and screen composition.
- [x] Phase 6: general Bootstrap resources, public search and other LiveViews,
  forms, content, administration, iframes, and book dialogs.
- [x] Remove Skeleton imports/sources and the legacy modal manager; preserve
  existing geometry in an application adapter.
- [x] LiveView: deferred script and idempotent color-hook mounting, event
  delegation after patches, and cleanup on destruction.
- [x] Follow-up JS reuse audit: `javascript-reusability-audit.md`.

Resource and component migration is complete across the site's page families.
Existing geometry, typography, and content rules remain as an application
adapter to preserve layouts; the grid has not been replaced. JavaScript
extraction proposals are documented in the [audit](javascript-reusability-audit.md)
as a separate refactoring effort. General regressions left pending during the
migration were resolved in the follow-up review below.

## Follow-up general regression review

The three previously blocked journeys pass completely with pages freshly
rendered by current controllers:

- `player_journey_browser.cjs`: the home page displays two favorites, matching
  the controller test, rather than the nine studies expected by the old browser
  test. Scroll coverage uses a long list created only inside the test. The
  journey uses the two current tactics panels and distinguishes primary links
  from language links.
- `analysis_training_browser.cjs`: directed practice starts Smart and preserves
  its entry position. A short review chain deliberately hides its empty message;
  the test checks the active session and position instead of requiring that
  message. The complete review, sync, interval, directed-link, and queue journey
  passes.
- `site_navigation_browser.cjs`: uses the current preferences menu and Bootstrap
  close control, and waits for a board only on the study page. The home page no
  longer contains a board or the old Practice menu.

Advancing the navigation journey exposed a real bug: board sizing did not reserve
existing spacing between the board and controls. At 1366×768, controls ended at
y=776. `ground.js` now deducts the rendered gap without changing CSS, structure,
or distribution. The test still requires controls to fit and also covers height
changes to 640, 900, and 768 px.

Validation: 23 controller tests; the three complete journeys above;
`native_training_browser.cjs` for other training modes; a successful production
build with the existing 180 Sass/performance warnings. The delivery records below
describe historical status. Limitations affecting these three journeys are now
closed.

## First delivery

Bootstrap 5.3.8 and Popper 2.11.8 are pinned in `assets/package.json`. The local
lockfile was updated; existing repository policy still excludes it from Git.
The first delivery enabled `bootstrap.html` and `bootstrap_ui` resources for the
analysis overview. Other pages followed in separate deliveries.

This delivery reused navigation and footer, extracted sound/board preferences
into shared templates, and used `ui_modal` for those preferences and PGN import.
Theme switching shared a module with the previous bundle. Routes, forms, filters,
sync, review, and training logic were preserved.

The visual foundation preserved fork styling and typography without loading
Skeleton or `app.scss` on analysis. Cross-component style cleanup in phase 5 was
still pending at this point; this was not presented as a complete migration.
LiveView hooks were deferred until a LiveView page was migrated.

Server validation: 16 analysis/player-journey tests passed; 11 additional
reference runs generated comparable before/after pages. Visual checks covered
1280, 900, 390, and 320 px in light/dark themes, preserving main-region positions
and dimensions. `bootstrap_analysis_browser.cjs` verified modals, focus, Escape,
backdrop, PGN, filters, preferences, and mobile navigation.

Limitation identified then and resolved in the follow-up review:
`analysis_training_browser.cjs:202` expected `#smart_run_status` to be visible
when returning to line practice. This failed with both previous and migrated
pages; waiting for visibility also timed out. Earlier review, sync, and analysis
steps passed. Smart logic was not changed in that delivery; the expectation was
corrected during the subsequent general regression review.

The requested JavaScript reuse audit remained scheduled after UI migration.

## Second delivery: library

The personal library (`/[locale]/studies`) adopted the same Bootstrap layout and
resources as analysis. The simplified tactics library retained its previous
layout at this stage and was migrated in a later delivery. Shared rows preserved
their design and behavior on pages still using legacy resources.

Group/move dialogs reuse `ui_modal`; their forms have one definition and retain
existing permissions and operation contracts. Menus use Bootstrap Dropdown while
retaining existing `details`/`summary` markup and visual composition. Menus remain
open after save failures so users can retry.

Library logic receives a controls adapter: Bootstrap manages opening, closing,
and keyboard behavior; filters, favorites, selection, and requests remain in the
existing module. Focus stays inside the dialog while saving temporarily disables
controls. Creating the first folder and then moving studies opens one modal at
a time.

Validation: 29 library, tactics, analysis, and player-journey server tests passed.
The library browser journey covers filters, favorites, multiple selection,
permissions, errors, groups, rename/delete, persistence, and moving studies.
Before/after comparisons cover main regions at 1280, 900, 390, and 320 px in both
themes, plus group dialogs and keyboard/focus behavior.

Training controls and dialogs belonged to phase 3 and were not migrated in the
library delivery.

## Normalizing migrated controls

Before extending migration to training, library, PGN, and preference dialogs
adopted a common Bootstrap control foundation. Group creation/rename fields use
`form-control`, selects use `form-select`, and actions use primary/secondary
variants. Sound uses Bootstrap checkbox/range controls on migrated pages. Legacy
pages retained their previous controls during this delivery.

`bootstrap_controls.scss` centralizes the 44 px minimum size, field theme, and
secondary actions. The `content-box` exception that enlarged group fields and
rules overriding Bootstrap PGN/preference controls were removed. Page layouts
remain unchanged; dialogs accommodate normalized content height. Visual checks
preserve main-region comparison and verify consistent control sizes without
overflow.

## Training preparation

`blocking_ui.js` centralizes open-dialog detection. Study navigation, practice
time, and feedback use the same condition. It recognizes native dialogs, visible
legacy modals, collections, and Bootstrap opening/closing transitions. One
observer per document updates `data-ui-blocked` and emits changes. It handles
inserted/removed dialogs and imports from multiple bundles.

While a blocking dialog exists, practice time and transient-message expiry pause,
shortcuts cannot advance the board, and feedback is hidden. Closing one dialog
does not unblock the page if another remains open. This prepared phase 3 without
enabling its new containers or changing training composition in this delivery.

`blocking_ui_browser.cjs` verifies these contracts with real consumers and the
Bootstrap plugin, including transitions, repeated initialization, and replaced
nodes. Session regressions read the extracted settings template; Bootstrap tests
verify contextual tab selection.

## Third delivery: training

Study playback, including tactics studies, enabled its dedicated layout with
`bootstrap_study.js` and `bootstrap_study.css`. It shares `assets/js/modules/site_common.js`
with analysis/library, loads one instance of plugins, and excludes Skeleton,
`app.scss`, `app.js`, and the old modal manager. Necessary study/collection styles
are included separately. Board, sidebar, and navigation composition is preserved.

Settings, information/comments, Sparring history, and progress use `ui_modal`.
Their bodies are partials retaining IDs, translations, forms, and Alpine scopes.
General/Practice/Sparring tabs use Bootstrap Tab with contextual selection and
keyboard navigation. Sparring hidden in tactics is also excluded from keyboard
focus. Replaced manual tab selection, opening, backdrop, and focus-return
listeners were removed.

Progress consumers close through the shared modal API; closing settings retains
application of depth changes. Dialog controls reuse shared normalization; close
targets are at least 44 px. Collections retained its container during this
delivery and moved in phase 4. The specialized chapter picker was not replaced
by a generic dropdown.

`bootstrap_study_browser.cjs` compares main regions at 1280, 900, 390, and 320 px
in light/dark themes. It checks tabs, depth, session goals, comments, history,
progress navigation, focus return, and mobile behavior. `sparring_browser.cjs`
uses Bootstrap plugins for settings/history. Session and weak-practice regressions
retain domain coverage. `bootstrap_tactics_browser.cjs` verifies training as
Black, separate preferences, reading, progress, and exclusion of the hidden
Sparring tab from keyboard focus. The earlier Smart failure remained pending
then; its expectation was corrected in the follow-up regression review.

At this stage, `player_journey_browser.cjs` stopped before study tests: it expected
nine `.home-daily-study` elements and received two from `player_journey_test.exs`
fixtures. That expectation was not changed in this delivery. Study, tactics, and
Sparring suites directly covered training. `site_navigation_browser.cjs` also
stopped before training because it expected the removed
`.site-menu[data-nav-section="practice"]`. New-dialog focus/opening checks ran
in `bootstrap_study_browser.cjs`. Both blocked journeys were later resolved in
the follow-up review above.

Build gzip sizes at this delivery: `bootstrap_study.css`, 32,420 bytes;
`bootstrap_study.js`, 25,295 bytes. Full legacy CSS was 35,180 gzip bytes;
`bootstrap_ui.css`, 23,459 bytes; `bootstrap_ui.js`, 23,721 bytes. The study engine
remained a separate 149,869-byte gzip bundle. These describe resources, not token
savings.

## Phase 4: collections delivery

`collection_modal` reuses `ui_modal`, with body and heading information extracted
to partials. The shared modal supports additional heading content and an optional
close-button ID. Sidebar, list, creation form, and status footer retain their
positions.

`study_collections.js` retains organization, persistence, and error recovery. It
requests opening through `dialog_lifecycle.js`; Bootstrap handles Escape,
backdrop, scroll, focus containment, and focus return. The custom focus trap,
closing listeners, and replaced container/header styles were removed. Closing
does not destroy the body: form, title, and color drafts remain on reopening.
Creation failure after disabling submit restores focus inside the modal to keep
Escape and retry available.

`bootstrap_collections_browser.cjs` uses the rendered page and covers organization,
chapter moves, rename, failed saves/retry, PGN export, drafts, creation failure,
focus, dismissal, persistence, and desktop/mobile themes. `study_features_browser.cjs`
checks guest collections with the same Bootstrap plugin and chapter navigation.
Controllers continue checking access and study creation.

The opening picker remained pending in this delivery and was completed next.

## Phase 4: opening picker and forms

The picker uses `ui_modal` and `_opening_options.html.eex`. Alpine retains
normalized search, selection, and hidden-field updates. `dialog_lifecycle.js`
delegates opening/closing to the one Bootstrap instance from common resources.
Metadata/chapter drafts survive opening, cancellation, and opening selection.
Enter in search does not submit the form.

Import creation and maintenance use the Bootstrap layout with
`bootstrap_management.js` / `bootstrap_management.css`, without `app.js`, Skeleton,
jQuery, or Select2. The last two had no effective initialization and were removed.
Board editing and blank creation followed in phase 5. Creation-error HTML retains
these resources; Phoenix field errors remain visible despite Bootstrap's default
`display: none` for `.invalid-feedback`. The Alpine script has a versioned URL to
avoid cached copies expecting a native `dialog`.

Form columns, panels, and order remain unchanged while fields/actions use
normalized Bootstrap variants. `bootstrap_management_browser.cjs` compares widths
and columns at 1280, 900, 390, and 320 px in both themes and checks search,
selection, Escape, backdrop, focus, drafts, failed saves, and validation HTML.
`study_maintenance_browser.cjs` preserves chapter rename, ordering, duplication,
deletion, conflict, and saving coverage.

## Phase 5: editor and blank creation

Chapter editing and `source=blank` use the Bootstrap layout with
`bootstrap_editor.js` / `bootstrap_editor.css`. They share navigation, preferences,
theme, and field/button variants. `study_editor.js` retains one Alpine startup
and a versioned URL. These pages no longer load Skeleton or `app.js`. Board,
variation tree, promotion, and position composition retain their specialized
components and arrangement.

Shortcuts and move copying respect shared blocking dialogs. Opening preferences
prevents Ctrl/Cmd+Z on the dialog container from making Chrome undo the editor's
last comment; fields inside the dialog retain native editing. Drafts and recovery
after saving failures are preserved.

Region comparison covers 1280, 900, 390, and 320 px in light/dark themes for editing,
repertoire creation, and tactics creation. Editor/creation tests cover history,
variations, promotions, position composition, local Stockfish analysis, and saving.
Cross-page style cleanup and remaining analysis pages were still pending at this
stage, so phase 5 was partial.

Validation: 16 server tests; four loading/history/promotion/composition unit tests;
`chapter_editor_browser.cjs`, `study_creation_browser.cjs`, and
`bootstrap_editor_browser.cjs`. The production build retained existing Sass and
resource-size warnings.

## Phase 5: games, comparison, and mistake practice

All analysis pages adopted Bootstrap: imported games, saved-game comparison,
uploaded-PGN comparison, unmatched results, and mistake practice. They share
`bootstrap_analysis.js` / `bootstrap_analysis.css`, navigation, preferences, and
controls, without Skeleton or `app.js`. Overview resources remain `bootstrap_ui`.
Columns, board dimensions, chapter groups, filters, and review logic are retained.
Replay/practice scripts have versioned URLs to avoid cached legacy code.

Replay shortcuts consult `hasBlockingUi`, including dialog transitions. Practice
uses the same detector/events to exclude time in preferences. Controls, hints,
answers, summaries, and progress retain their behavior.

Validation: 14 server tests; game-progress, session, and accepted-move unit tests;
comparison regression and `bootstrap_analysis_workspace_browser.cjs`. The latter
compares main regions at 1280, 900, 390, and 320 px in both themes and verifies
shortcuts, preferences, paused time, hints, answers, summaries, filters, and empty,
unmatched, and uploaded-PGN states. Production builds pass with existing warnings.

The previously recorded `analysis_training_browser.cjs:202` failure still existed
at this delivery. Correct practice, shared progress, and sync steps passed; the
status-visibility expectation was corrected in the follow-up review.

## Simplified tactics library

The tactics hub uses `bootstrap_tactics.js` / `bootstrap_tactics.css` and the
Bootstrap layout. It reuses `assets/js/modules/site_common.js`, the library template, simplified
search, and shared preference dialogs, without `app.js` or Skeleton. Included
puzzles, owned/saved collections, and visualization links retain their layout.
Personal-library organization features are not added to this hub.

`puzzle_filters` receives an explicit `bootstrap` option to normalize fields and
the practice button. Its default kept pending LiveView consumers compatible; it
does not inspect internal socket assigns. Shared visualization-link styles moved
to `features/tactics_discovery.css`, used by both resource systems during migration.

Validation: 25 server tests for library, classification, catalogue, filters, and
LiveView. `bootstrap_tactics_library_browser.cjs` compares regions at 1366, 900,
390, and 320 px in both themes, with collections and as a guest. It checks initial
search, empty results, reset, saved collections, preferences, links, and submitted
filter values. Discovery regression also covers guides/tools still on the old
layout at that stage. Region checks measure both visible panels rather than
expecting one node from a multiple-match selector. Production builds pass with
Sass/resource-size warnings.

## Phase 5: control adapters and style ownership

`components/bootstrap_control_mixins.scss` centralizes Bootstrap field themes and
secondary-button states. Editor, creation/maintenance, analysis, and modals use
these adapters with their existing borders; dialog interaction retains its border
variant. Dimensions/selectors remain in component files. Shared palette/state
changes have one definition.

Collection base styles moved from `study_extensions.css` to
`study_collections.css`. Active rules remain; already overridden width, shadow,
spacing, and unused `collection-danger` rules were removed. The editor stopped
loading unused collection styles. Legacy styles/managers with consumers were
retained at this stage.

The build emitted identical CSS for `bootstrap_ui`, `bootstrap_management`,
`bootstrap_analysis`, and `bootstrap_tactics`. Collection regression compares old
and new container, column, row, selector, navigation-button, and footer styles at
1280, 900, 390, and 320 px in both themes. It also covers drafts, focus, chapter
moves, failed saves, export, and long lists. Editor regression checks composition
and flows affected by removing unrelated styles. Library/training surface
convergence remained pending, so phase 5 was still partial.

## Phase 5: shared practice variants and surfaces

`components/practice_controls.css` centralizes the practice palette, primary and
secondary variants, focus, and accent-bordered surfaces. Library, session resume,
and practice actions share primary definitions. Catalogue filters use the same
colors, including dark-theme focus. Both Bootstrap and the previous bundle used
this component during migration.

`practice_theme.css` retains composition, sizes, and screen-specific adaptations.
Practice panels, study context, comments, and session completion share border and
background definitions; padding and visibility remain feature-owned. Control
layout and behavior are unchanged.

`practice_controls_browser.cjs` compares old/current CSS for library, tactics,
mistake practice, study, and creation at 1280, 900, 390, and 320 px in both themes.
It compares dimensions/styles, hover, keyboard focus, and disabled buttons. Study
regression covers settings, depth, goals, comments, history, and progress;
discovery also checks pages still using previous resources at that point. Builds
pass with existing Sass/resource-size warnings.

This delivery completed phase 5 convergence for migrated pages; site-wide
migration continued in phase 6. Completing this visual phase did not resolve the
general regressions, which were handled later as recorded above.

## Phase 6: general resources, LiveView, and books

Remaining pages use `bootstrap_site.js` / `bootstrap_site.css`, including content,
general forms, administration, native training, and the exercise iframe. Public
search uses `bootstrap_discovery` and retains shared study rows. LiveViews retain
routes/events; `live_view.js` loads deferred. Color-hook mounting is idempotent,
event delegation survives control replacement, and destruction removes listeners.

`app.js`, `app.scss`, `skeleton.css`, and the old modal manager/styles were removed.
`site_foundation.css` retains derived geometry, typography, content, and utility
rules with original attribution. `site_controls.scss` adapts general selectors to
Bootstrap controls while preserving dimensions and native typography where it
was part of the layout. This application adapter is intentional; existing
compositions were not replaced with Bootstrap's grid. Page layout is unchanged.

Sound/board preferences and both book-dialog types use `ui_modal`. Affiliate
details and recommendations have their own partials and accessible triggers;
Bootstrap handles focus, Escape, and backdrop. Puzzle filters initialize from
common resources and preserve the rating cookie in the tactics hub.

Validation: the complete web-server suite plus study search passed 111 tests.
General-page checks compare regions at 1280, 900, 390, and 320 px in both themes,
including home, content, registration, LiveView search, books, endgames, exercise
tool, iframe, and administration. They also verify preferences, book focus/return,
and hook lifecycle. Native-training regressions cover visualization, errors,
retries, and promotions. Builds retain Sass/resource-size warnings. The later JS
audit is delivered separately.

Emitted gzip sizes, excluding engine/LiveView bundles already loaded separately:
`bootstrap_site.css`, 45,889 bytes; `bootstrap_site.js`, 26,815 bytes;
`bootstrap_discovery.css`, 24,005 bytes; `bootstrap_discovery.js`, 24,374 bytes.
These are tracking measurements, not claimed reductions from the previous bundle.
The reference admin table already overflowed on mobile; comparison requires no
additional overflow without changing its layout. Native tests now await
Chessground's asynchronous callbacks before reading errors, removing a test race.

## Objective and scope

Reduce repeated HTML, CSS, and JavaScript through Bootstrap 5.3 and shared Phoenix
templates. Prioritize UI added or extended in this fork. Alpine retains application
state; Bootstrap manages its UI controls.

Agreed design constraint: preserve current visual distribution, navigation, and
theme. Layout separation means the technical template/resources, not redesign.
Adopt Bootstrap controls/behavior when they improve implementation. Normalization
of fields, buttons, internal spacing, and focus states is authorized. Do not keep
legacy exceptions solely to reproduce old inconsistencies. Compare before/after
screenshots and verify screen composition and functionality. Proposed changes to
screen distribution require asking the user first. Design guidance does not
authorize layout changes.

"Current fork pages" means today's library, analysis, editor, and training pages,
after our changes. Adapt the same templates while retaining routes/functions;
do not create parallel page copies. "Inherited" identifies original pieces they
still used, including Skeleton, the base layout, and some controls.

Migrated pages use dedicated Bootstrap resources and our theme without loading
Skeleton or all legacy global resources. Application logic is reused, extracting
shared modules as needed during transition. Migration happens per complete page
to avoid maintaining two global style systems on one page.

Priority depends on origin, reuse, and risk, not just screen name: an inherited
page can contain new fork components.

These UI phases do not migrate engines, PGN processing, storage, FSRS, move
legality, or board behavior. Shared promotion, move-tree, and chapter-picker APIs
are retained; presentation is reviewed where appropriate.

## Fork evidence

Reference for the initial review: HEAD `4db28cdd`, compared with the local
`upstream/master` reference; common ancestor
`83e0a955f843cdeb11e443417f93f8dabacca226`. The remote reference was not refreshed.
This ancestor includes upstream integrations and is not presented as the original
fork-creation date.

Milestones verified in history:

| Area | Evidence | Classification |
| --- | --- | --- |
| Game analysis | `e83cbf49`, 2026-06-18 | Added in the fork |
| Collections | `17ba2593`, 2026-09-27 | Added in the fork |
| Compact library | `d1b02af8`, 2026-10-07 | Added in the fork |
| Settings/information dialogs | `b2599986`, 2026-10-14 | Fork-specific study extension |
| Sparring | `9d66cbd8`, 2026-10-16 | Added in the fork |
| Practice theme | `b320fe5f`, 2026-10-17 | Shared fork styling |
| Shared chapter picker | `5fe2df1d`, 2026-10-19 | Fork reuse to preserve |
| Legacy modal manager | `987540c2`, 2020-09-26 | Inherited; initial compatibility |
| Skeleton | `b60bde49`, 2020-06-26 | Inherited; removed later |

## Execution order

Each phase must produce a reviewable, reversible change. Later phases depend on
verified integration and cleanup of the previous one.

| Phase | Status | Scope | Required outcome |
| --- | --- | --- | --- |
| 0 | Foundation implemented; LiveView hooks where applicable | Dedicated layout and resources separated from legacy assets | Selective build, one theme, identified shared dependencies |
| 1 | Complete | Analysis overview and PGN import | First real page using Bootstrap and shared dialog |
| 2 | Complete: personal and simplified tactics libraries | Library groups, moves, and menus | Reuse dialogs and unify action menus |
| 3 | Complete | Study settings, information, Sparring history, progress | Migrate containers/tabs while preserving training |
| 4 | Complete | Collections and opening picker | Replace manual focus/closing while preserving drafts |
| 5 | Complete for migrated fork pages | Fork buttons, forms, and surfaces | Unify variants and remove redundant rules |
| 6 | Complete with existing-geometry adapter | Inherited components and Skeleton removal | Complete convergence after stabilizing fork pages |

## Phase 0: integration and common rules

- Pin an exact Bootstrap 5.3 version and update the main `assets` lockfile during
  implementation. Add Popper if selected menus require it.
- Use existing Webpack/Sass with dedicated entries. Import only needed components;
  add grid, containers, and foundation styles according to migrated-page needs.
- Separate CSS/JS loading in layouts/headers. Bootstrap pages must not import
  `app.scss` or the full legacy `app.js`. Extract necessary board/sound preferences,
  navigation, and theme into shared modules independent of Skeleton.
- Audit header, footer, flash messages, and global settings before the pilot.
  Reuse data/logic and adapt necessary pieces. Retain the previous layout for
  pages awaiting migration.
- Check emitted resources/CSS: `.modal`, `.container`, and `.alert` collide between
  systems. Do not load `assets/js/components/modal.js` or legacy modal CSS on
  Bootstrap pages. Account for backdrop and body-scroll changes.
- Centralize colors, spacing, radii, focus, and sizes in theme definitions. Connect
  existing `data-theme` to `data-bs-theme`; do not add another preference.
- Build minimal shared infrastructure: modal template with title/content/actions,
  button variants, plugin initialization/cleanup. Keep unique IDs/translations;
  avoid another component framework.
- Define one blocking-modal detector recognizing native, legacy, collection, and
  Bootstrap dialogs, including transitions during migration.
- Adapt `study_sessions.js`, `study_page_controls.js`, and feedback visibility
  consumers previously relying on `dialog[open]` or inline styles.
- Make initialization idempotent. Use mount/destroy hooks for LiveView-replaced
  nodes and release plugin instances/listeners.
- Bootstrap is the single owner of control opening, closing, and selection.
  Alpine communicates through APIs/events as needed.

Exit criteria: dedicated layout/resources, successful build, and verification
that pending pages still use their earlier resources. Phase 1 validates the new
layout on a real page.

## Phase 1: analysis pilot

Main files: `templates/analysis/index.html.eex`, `assets/js/analysis_overview.js`,
and `analysis_presentation.css`.

Adapt the existing analysis template, including buttons, forms, and structure
needed without Skeleton. Review style dependencies before moving resources.
Other analysis pages switch layout once adapted.

Migrate PGN import to the common dialog template. Preserve submission, validation,
and input after errors. Replace coordinate-based manual closing/focus restoration
with component behavior/events. Retain initial textarea focus.

Verify Escape, backdrop, initial/return focus, mobile scroll, accessible labels,
dark theme, and no duplicate listeners. Record added/removed CSS/JS and compressed
asset sizes. Continue if the solution removes custom code without accumulating
another layer of visual exceptions.

## Phases 2–4: shared behavior

Library: `study/index.html.eex`, `components/study_library.js`, and
`study_library.css`. Preserve multiple selection, filters, favorites, permissions,
and request results. Move → create folder → return to move must close one modal
before opening another; do not stack Bootstrap modals. Preserve trigger focus
even after row rerendering.

Studies: `_study_settings`, information dialog, `_sparring_history`, and
`progress_modal` in `show.html.eex`, plus `study_page_controls.js` and consumers.
Preserve contextual General/Practice/Sparring selection/events. Verify all progress
consumers before removing legacy behavior. Modals must keep pausing practice time,
blocking board shortcuts, and hiding overlapping feedback.

Collections: `_collection_modal.html.eex` and `study_collections.js`. Preserve
internal forms, error recovery, active selection, and drafts. Remove the manual
focus trap only when Bootstrap replaces it. Then migrate `_opening_picker.html.eex`
and `study_maintenance.js`, retaining Alpine search/selection.

Each migrated component adopts necessary common fields/buttons. A page switches
layout only once its controls/surfaces work without legacy resources. Phase 5
completes remaining fork pages, including editor, creation, and maintenance.

## Phase 5: fork visual convergence

Extend common variants to editor, creation/maintenance, analysis, library, and new
training controls. Reuse `study_list_row.html.eex`; do not create a separate row
implementation for each screen.

Extract shared styling from `practice_theme.css`, `study_presentation.css`,
`study_extensions.css`, `study_library.css`, and `chapter_editor.css`. The theme
owns visual values, components own states, and screens retain composition and
domain requirements.

Evaluate Bootstrap Icons separately; it is not bundled with Bootstrap. Centralize
repeated SVGs before adding a dependency if the existing catalogue is sufficient.
Do not replace the specialized chapter picker with a generic dropdown that loses
search, metrics, or navigation.

## Phase 6: inherited interface

Books/dialogs, older forms, and general Skeleton structure belong to this phase.
Sound/board preferences already use shared modals on migrated pages; remove old
wrappers on remaining pages. Resource separation and shared module extraction
belong to phase 0.

Remove the old modal manager once it has no consumers. Retire Skeleton by style
family, verifying authentication, content, administration, and iframe pages before
removing its global import.

## Validation and completion criteria

- Capture desktop/mobile before/after screenshots in light/dark themes.
- Run `npm run deploy` from `assets` for each implementation delivery.
- Select relevant existing tests under `assets/test/unit`, including
  `study_library_browser.cjs`, `study_navigation.cjs`, `study_modes_browser.cjs`,
  `study_sessions_browser.cjs`, `study_feedback_browser.cjs`, `sparring_browser.cjs`,
  `study_maintenance_browser.cjs`, `study_creation_browser.cjs`, and
  `chapter_editor_browser.cjs`.
- Run corresponding template/controller tests when rendering changes. Add missing
  coverage for focus, Escape, modal transitions, and LiveView node replacement.
- A phase is complete when journeys pass, keyboard/focus work, state has one owner,
  and replaced styles/listeners are removed.
- Compare compressed sizes, removed custom rules/handlers, and the number of places
  needed to change a component. Token savings are an expectation requiring
  comparable-task measurements, not promised percentages.
- Revert a phase through its commit. Do not add permanent flags maintaining two
  implementations of the same component. Business data/contracts remain
  compatible during migration.

## References

- [Official Webpack integration](https://getbootstrap.com/docs/5.3/getting-started/webpack/).
- [Selective Sass and JavaScript imports](https://getbootstrap.com/docs/5.3/customize/optimize/).
- [JavaScript API](https://getbootstrap.com/docs/5.3/getting-started/javascript/).
- [Modals and limitations](https://getbootstrap.com/docs/5.3/components/modal/).
- [Current architecture](architecture.md).

Current status is recorded under "Outstanding work and next delivery" and in the
execution table. Delivery records describe each historical scope and limitation.
