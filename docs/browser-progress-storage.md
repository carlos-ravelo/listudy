# Browser progress storage

Progress uses IndexedDB (`listudy-progress`, version 1), with PostgreSQL as the
existing authenticated synchronization destination. Small preferences retain
localStorage. The database is local to the browser profile and origin.

## What is retained

| Data | Location and reason |
| --- | --- |
| Chapter statistics, coverage, failed positions, FSRS cards and bounded review events | IndexedDB, one progress document per study/kind/account; needed for training and offline use |
| Practice sessions, visualization runs and sparring PGNs/reviews | Retained in the progress document: user history, time totals, adaptive progression and replay depend on them |
| Pending server revision and merge base | Same IndexedDB record, atomically with its value; prevents stale-device overwrites |
| Acknowledged server snapshot | Reuses the record value; no second complete copy when clean |
| Existing backups and unowned progress | Preserved, without silently assigning guest data to the signed-in account |
| Old PGN trees | Moved to a verified recovery archive; consulted only for legacy position migration |
| Current playable trees | Reconstructed from PGN in memory; no serialization on every move or upload to the progress endpoint |
| Position catalog | Existing bounded sessionStorage cache; disposable and separate from durable progress |
| Display, sound and training preferences | Small localStorage entries; existing preference synchronization remains |

Histories are not silently truncated to make a quota error disappear. FSRS event
limits and recent-practice limits remain unchanged. Future history rollups must
preserve totals, session identity and conflict semantics before deleting events.

## Migration and failure handling

Initialization migrates legacy progress for all accounts to their original keys,
then loads just the requested study/account. Analysis can request the full account.
Each copied progress document is read back before matching localStorage originals
are removed. Distinct recovery versions and orphan metadata go to the archive;
identical backups do not create another full copy. Changed source entries are not
removed. A failed migration leaves its original data available for retry.

`StorageAdapter.ready()`/`hydrate()` must finish before reading progress. Study,
analysis and game-mistake training all follow this boundary, including offline
and guest entry points. Runtime consumers retain a synchronous memory facade;
`whenSaved()` waits for queued durable writes and reports whether they succeeded.

Changes from the same event loop share a transaction. Transactions read the latest
record before merging a local delta, so concurrent tabs cannot overwrite each
other. BroadcastChannel carries only changed keys, and loaded tabs refresh from
IndexedDB. Immutable session IDs and the existing FSRS conflict merger remain the
source of truth; server conflicts still use revision-checked three-way merging.
An index retrieves only the signed-in account's pending documents for background
retries, without hydrating every study.

A local write failure retains the newest value in memory, attempts the legacy
fallback without deleting originals, and still schedules cloud synchronization.
The UI distinguishes local-storage failure from offline synchronization: it must
not claim that an uncommitted local value is safely saved. A reload can only
recover data committed locally or acknowledged by the server. Neither browser
storage technology is a substitute for the server copy.

The progress endpoint verifies the account identifier sent by new clients;
hydration includes the authenticated account identifier. An old open tab cannot
apply another account's hydration or upload into a newly signed-in account.
Validation/authentication failures do not enter an endless network retry loop.
The existing 5,000,000-byte per-document server limit remains; a larger document
can be retained locally but requires a future server-side document split before
it can synchronize. Old server `_tree` rows are retained for compatibility and
excluded from hydration; new tree uploads are rejected.

## Checks

```sh
cd assets
node test/unit/progress_storage.cjs
node test/unit/progress_merge.cjs
node test/unit/progress_preservation.cjs
node test/unit/indexed_progress_browser.cjs
```

The browser suite bundles the real adapter and uses Chrome's actual IndexedDB.
It exercises full localStorage migration, exact backup verification, account and
guest isolation, offline reloads, documents over the localStorage limit, identical
increments from concurrent tabs, device conflicts, and simultaneous storage
failures without preventing cloud saves. No real browser profile is modified.
