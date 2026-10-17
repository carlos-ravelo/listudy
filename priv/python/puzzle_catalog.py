"""Stream the official Lichess CSV; emit a bounded, balanced local catalogue.

No network access. Input may be CSV or CSV.zst. Output is private JSONL for
batched database insertion; source positions and UCI lines are retained.
"""
import argparse
import csv
import io
import json
import random
import subprocess
from collections import defaultdict
from contextlib import contextmanager

import chess

GENERIC = set("opening middlegame endgame short long veryLong oneMove advantage crushing equality master masterVsMaster superGM rated casual".split())
REQUIRED = {"PuzzleId", "FEN", "Moves", "Rating", "RatingDeviation", "Popularity", "NbPlays", "Themes", "GameUrl", "OpeningTags"}


@contextmanager
def open_csv(path):
    if str(path).endswith(".zst"):
        process = subprocess.Popen(["zstd", "-dc", "--", str(path)], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        try:
            with io.TextIOWrapper(process.stdout, encoding="utf-8-sig", newline="") as stream:
                yield stream
            if process.wait() != 0:
                raise ValueError("Could not decompress CSV.zst")
        finally:
            if process.poll() is None:
                process.terminate()
                process.wait()
    else:
        with open(path, encoding="utf-8-sig", newline="") as stream:
            yield stream


def normalize(row):
    puzzle_id = row["PuzzleId"]
    if not puzzle_id or len(puzzle_id) > 32 or not puzzle_id.isalnum():
        raise ValueError("Invalid puzzle identifier")
    board = chess.Board(row["FEN"])
    if not board.is_valid() or board.chess960:
        raise ValueError("Invalid standard position")
    uci = row["Moves"].split()
    if not 2 <= len(uci) <= 128 or len(uci) % 2:
        raise ValueError("Missing or oversized solution")
    board.push_uci(uci[0])
    fen = board.fen()
    color = "white" if board.turn else "black"
    san = []
    for token in uci[1:]:
        move = chess.Move.from_uci(token)
        if move not in board.legal_moves:
            raise ValueError("Illegal solution move")
        san.append(board.san(move))
        board.push(move)
    rating = int(row["Rating"])
    if not 0 <= rating <= 4000:
        raise ValueError("Invalid rating")
    return dict(source="lichess", source_id=puzzle_id, source_fen=row["FEN"],
                source_moves=" ".join(uci), fen=fen, color=color, moves=" ".join(san),
                last_move=uci[0], rating=rating, rating_deviation=int(row["RatingDeviation"]),
                popularity=int(row["Popularity"]), source_plays=int(row["NbPlays"]),
                themes=sorted(set(row["Themes"].split())), opening_tags=sorted(set(row["OpeningTags"].split())),
                link="https://lichess.org/training/" + puzzle_id, played=0)


def sample(path, limit, seed=20261017):
    """Reservoirs per rating band and theme, with rating fallback reservoirs.

    Ten equal rating quotas: <800, 800–999, …, 2200–2399, >=2400.
    Round-robin themes within each band. Sparse bands spill into the others.
    Full-file scan avoids source-order bias; memory is bounded by the target.
    """
    rng = random.Random(seed)
    quota = (limit + 9) // 10
    pools, fallback, counts = defaultdict(list), defaultdict(list), defaultdict(int)
    capacity = min(quota, max(10, quota // 10))
    scanned = rejected = 0

    def reservoir(key, row, pool, size):
        counts[key] += 1
        if len(pool) < size:
            pool.append(row)
        else:
            index = rng.randrange(counts[key])
            if index < size:
                pool[index] = row

    with open_csv(path) as stream:
        reader = csv.DictReader(stream)
        if not REQUIRED.issubset(reader.fieldnames or []):
            raise ValueError("CSV does not have the required Lichess columns")
        for row in reader:
            scanned += 1
            try:
                rating = int(row["Rating"])
                if not 0 <= rating <= 4000 or int(row["Popularity"]) < 0 or int(row["NbPlays"]) < 100:
                    rejected += 1
                    continue
                band = min(9, max(0, (rating - 600) // 200))
                themes = sorted(set(row["Themes"].split()) - GENERIC)
                theme = rng.choice(themes) if themes else "mixed"
                reservoir(("theme", band, theme), row, pools[band, theme], capacity)
                reservoir(("rating", band), row, fallback[band], quota)
            except (ValueError, TypeError, KeyError):
                rejected += 1
    for pool in list(pools.values()) + list(fallback.values()):
        rng.shuffle(pool)

    selected, seen = [], set()
    def take(row):
        nonlocal rejected
        if row.get("PuzzleId") in seen:
            return False
        seen.add(row.get("PuzzleId"))
        try:
            selected.append(normalize(row))
            return True
        except (ValueError, TypeError, KeyError, IndexError):
            rejected += 1
            return False

    for band in range(10):
        target = limit // 10 + (band < limit % 10)
        start = len(selected)
        buckets = [pools[key] for key in sorted(pools) if key[0] == band]
        while buckets and len(selected) - start < target:
            for pool in buckets:
                if len(selected) - start >= target:
                    break
                if pool:
                    take(pool.pop())
            buckets = [pool for pool in buckets if pool]
        while fallback[band] and len(selected) - start < target:
            take(fallback[band].pop())
    remaining = [row for pool in list(pools.values()) + list(fallback.values()) for row in pool]
    rng.shuffle(remaining)
    while remaining and len(selected) < limit:
        take(remaining.pop())
    return selected, dict(scanned=scanned, rejected=rejected, selected=len(selected))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("output")
    parser.add_argument("--csv-output", action="store_true")
    parser.add_argument("--limit", type=int, default=50000)
    args = parser.parse_args()
    if not 1 <= args.limit <= 50000:
        parser.error("limit must be between 1 and 50000")
    try:
        rows, stats = sample(args.input, args.limit)
        if not rows:
            raise ValueError("No valid puzzles passed the selection")
        with open(args.output, "w", encoding="utf-8") as stream:
            if args.csv_output:
                fields = ["PuzzleId", "FEN", "Moves", "Rating", "RatingDeviation", "Popularity", "NbPlays", "Themes", "GameUrl", "OpeningTags"]
                writer = csv.writer(stream)
                writer.writerow(fields)
                for row in rows:
                    writer.writerow([row["source_id"], row["source_fen"], row["source_moves"], row["rating"], row["rating_deviation"], row["popularity"], row["source_plays"], " ".join(row["themes"]), row["link"], " ".join(row["opening_tags"])])
            else:
                for row in rows:
                    stream.write(json.dumps(row, separators=(",", ":")) + "\n")
        print(json.dumps(stats))
    except (ValueError, OSError, csv.Error) as error:
        print(json.dumps({"error": str(error)}))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
