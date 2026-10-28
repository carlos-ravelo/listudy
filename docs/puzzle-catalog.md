# Local Lichess puzzle catalog

PGN tactics collections keep their existing storage, chapter identity and training
flow. The puzzle catalog adds Lichess rows to the native `tactics` table and reuses
the native board and solution player. Choose a theme and original Lichess rating
range directly on `/en/tactics`, above your PGN collections. `/en/tactics/puzzles`
opens a playable puzzle immediately. The practice desk beside the board lets you
change those filters and see matching counts without leaving the puzzle. Applying
filters or continuing patches the existing LiveView and keeps the URL shareable.
Changing draft filters leaves the current attempt intact; empty or inverted ranges
show inline guidance. On mobile the controls precede the board. A one-puzzle pool
remains playable, and empty catalogs keep the same filter controls.

## Importing

Requirements: the existing Python `chess==1.11.2` dependency and the `zstd` CLI
for compressed inputs. No HTTP calls are made by the importer or puzzle player.
Source data and terms: <https://database.lichess.org/#puzzles> (CC0).

Administrators can upload CSV or CSV.zst at `/admin/puzzle-imports`, linked from
Admin → Practice. The normal multipart limit is 8 MB. For the full export, queue
the local file on the server instead:

```sh
mix ecto.migrate
mix puzzles.import /path/to/lichess_db_puzzle.csv.zst --limit 50000 --run
```

Without `--run`, the command queues a job for the background worker in the running
application. The admin page shows queued/running/completed/failed, processed rows,
new inserts, rejected source rows and errors. Already-present selected puzzles
are skipped, so repeating the same import does not add another 50,000 records.
Inputs are retained privately under `var/puzzle_imports/`, outside static files
and Git. Configure `:puzzle_import_directory` to use persistent shared storage in
production; all application nodes must see that path.

A PostgreSQL advisory lock allows one import at a time across workers/CLI nodes.
Each 500-row insertion and its counters commit together. An interrupted running
job is replayed by the next worker, with source uniqueness preserving existing
rows and progress. Failed jobs can be retried by submitting their source again.
Temporary JSONL preparation files are removed after each run.

## Initial selection

The complete input is scanned as a stream, with deterministic seeded reservoir
sampling. Popularity must be nonnegative and source plays at least 100. Ten rating
bands receive equal quotas: below 800, 800–999, …, 2200–2399, and 2400 or above.
Within a band, reservoirs are grouped by a sampled tactical theme and selected
round-robin, reducing dominance by common themes. Generic phase, length and
outcome tags remain stored but do not drive thematic balancing. Sparse bands
spill into other available candidates. The limit is 50,000 per import; a smaller
input imports the available valid selection.

Every selected position and complete UCI line is validated with python-chess.
The first UCI move is applied before storing the playable FEN. The remaining
moves are converted to SAN for the existing trainer. Original FEN and UCI moves,
all themes and opening tags, rating, deviation, popularity and source play count
remain available. `(source, source_id)` has a unique database index. Repeat imports
do not overwrite catalog metadata or existing counters.

A prepared initial file lives locally at
`var/puzzle_imports/lichess-balanced-50000.csv.zst`. It can be uploaded from Admin.
To prepare another compressed subset without exposing puzzle contents in terminal:

```sh
curl --fail --location --output /tmp/lichess_db_puzzle.csv.zst https://database.lichess.org/lichess_db_puzzle.csv.zst
python3 priv/python/puzzle_catalog.py /tmp/lichess_db_puzzle.csv.zst /tmp/lichess-balanced.csv --limit 50000 --csv-output
zstd /tmp/lichess-balanced.csv -o /tmp/lichess-balanced.csv.zst
```

## Selection and progress

Native selection uses a random ordinal over matching rows ordered by primary key,
without `ORDER BY RANDOM()` or assuming consecutive IDs. At this catalog size,
count plus bounded offset avoids a full random sort; theme GIN and source/rating
indexes support filtering. Daily selection uses a deterministic date ordinal over
real rows and returns nil for an empty catalog.

Catalog source metadata is separate from player records. Native attempts reuse
`assets/js/pages/training/tactics.js`; device-local `puzzle_progress_v1:<source>:<source_id>` keys
record solves, clean solves, duration, errors and assistance independently of PGN
chapter statistics. These values are not account-synced. Original Lichess ratings
are not treated as a player rating. The existing `played` field remains a global
usage counter. Alternative validation on the native tactics player uses local
Stockfish only, with remote tablebases disabled, so sessions need no external REST.
