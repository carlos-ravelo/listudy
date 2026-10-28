# JavaScript reusability audit

Date: 2026-10-21. Review following the Bootstrap component migration.
Documentation translated to English on 2026-10-22.

## Already shared

- `assets/js/modules/site_common.js`: navigation, preferences, theme, and library startup.
  It also preserves catalogue filters and rating preferences on regular pages
  and after LiveView updates.
- `dialog_lifecycle.js` and `blocking_ui.js`: dialog opening/closing and detection
  of blocking dialogs. Consumers retain their domain rules.
- `color_toggles.js`: library and public-search color filters. The LiveView hook
  delegates events, tolerates remounting, and removes listeners when destroyed.
- `promotion_picker.js`, `chapter_picker.js`, `study_move_tree.js`: reusable chess
  controls that retain their specialized behavior.
- `study/practice_sessions.js`: session, goal, and active-time model shared by
  study training and mistake practice.

## Completed extractions

- `modules/search_text.js`: `normalizeSearchText(value)` shared by simple and full
  library modes and the opening picker. Consumers retain trimming and field
  selection.
- `modules/pgn/download_pgn.js`: `downloadPgn(pgn, filename)` shared by collections,
  Lichess, and Sparring. It preserves the PGN MIME type and releases the URL after
  the click; consumers retain filenames, contents, and additional behavior.
- `modules/request_json.js`: JSON transport shared by editor loading/saving,
  chapter maintenance, study creation from collections, library organization,
  and collection account synchronization. It centralizes credentials, JSON/CSRF
  headers, and `JsonRequestError` with `status` and `data`. It propagates
  `AbortSignal`, preserves cancellation, and does not retry. Revisions, stale
  response checks, drafts, and messages remain in consumers. Non-JSON responses
  use the consumer's error message; writes without a CSRF token fail before
  sending. Metadata uploads using `FormData` and files retain their transport.
- `modules/training/practice_activity.js`: activity, focus, visibility, blocking, and
  interval events shared by study and mistake practice. It returns an idempotent
  cleanup function; `setupStudySessions().destroy()` also releases the progress
  listener and its controls. Study keeps one-second rendering, 15-second saves,
  and synchronization when hidden. Mistake practice keeps its 15-second interval
  and persistence policy. Consumers retain eligibility, tracker idleness, and
  exit handling. Mistake practice installs the adapter once per page lifetime.
- `modules/editable_target.js`: `isEditableTarget` shared by editor navigation and
  copy handling, game replay shortcuts, and study navigation. The
  `includeContentEditableFalse` option preserves broader replay protection.
  Editor shortcuts remain available on static content unless an editable
  ancestor remains protected, as before. Summary elements, dialogs, text
  selection, modifier keys, and editor states remain consumer rules. Replay and
  study navigation ignore IME composition. Study preserves Shift+arrow behavior
  and navigation over static `contenteditable="false"` content.

## Follow-up extensions

The second review found two more consumers of the same transport:
`components/study_library.js` and `study/collection_account.js`. Both reuse
`requestJson`; no additional wrapper was introduced. The library preserves
selection and localized messages after failures. `CollectionAccount` retains
its snapshot queue, revisions, and pending local copy. It recognizes conflicts
through `JsonRequestError.status === 409` and blocks further writes until an
explicit reload, including a 409 response without JSON. Tests cover edits during
saving, HTTP failures, invalid responses, recovery, and conflicts when reopening
an account with pending local edits.

Navigation in `components/study_page_controls.js` also reuses `isEditableTarget`,
protecting empty and `plaintext-only` forms of `contenteditable`. Its tests cover
composition, modifiers, prevented events, static content, document-level event
targets, and dialog blocking.

## Status

The specific review of `study.js` responsibilities, Alpine UI, and components is
in the [study audit](study-js-responsibility-audit.md). Its six implementation
deliveries are complete, including Alpine boundaries, domain grading/run
coordination, and page initialization/teardown. Verification is recorded there.

The initial extractions and transport/navigation extensions are complete. Tests
cover consumers and shared contracts; no extractions remain pending within this
scope.

## General regression review

Before extending the audit to `study.js`, the three blocked journeys documented
in the [migration plan](bootstrap-migration-plan.md) were resolved. Outdated home,
navigation, and Smart-message expectations were aligned with current contracts,
and the complete journeys pass. A real board-sizing issue was also fixed: the
calculation now reserves the existing bottom spacing so controls fit within the
viewport. The layout is preserved, with coverage for height and width changes and
other training modes that share the board module.

## Implementation order

1. Complete: search normalization and PGN downloading.
2. Complete: JSON transport, validated first in maintenance, then extended to the
   editor and study creation from collections.
3. Complete: activity adapter, with active-time, persistence-policy, cleanup, and
   remount tests.
4. Complete: editable-target predicate and regressions for shortcuts, copy,
   selection, composition, and replay-specific exclusions.

Methods such as `save`, `play`, or `refresh` should not be unified based on naming
alone: editors, collections, and training have different contracts and state.
Bootstrap APIs do not need wrappers that merely rename methods without removing
a repeated policy.

Extractions retain domain behavior in consumers. Token savings have not been
measured. The verifiable benefit is reducing the places that must be read and
changed when shared behavior changes.
