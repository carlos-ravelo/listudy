"""Check bundled PGNs, optionally comparing every retained note with its source."""
import argparse
import hashlib
import io
import json
import subprocess
import tempfile
from pathlib import Path

import chess
import chess.pgn

ROOT = Path(__file__).resolve().parents[1] / "priv/repo/data/studies"


def games(text):
    stream = io.StringIO(text)
    result = []
    while game := chess.pgn.read_game(stream):
        assert not game.errors, game.errors
        result.append(game)
    return result


def verify_tree(node, original=None, depth=0, limit=None):
    if original is not None:
        assert node.comment == original.comment, "Changed source comment"
        assert node.starting_comment == original.starting_comment
        assert node.nags == original.nags
        expected = [] if limit is not None and depth >= limit else original.variations
        assert [c.move for c in node.variations] == [c.move for c in expected]
    count = 0
    for index, child in enumerate(node.variations):
        assert child.move in node.board().legal_moves, "Illegal move"
        assert child.board().is_valid(), "Invalid position"
        reference = original.variations[index] if original is not None else None
        count += 1 + verify_tree(child, reference, depth + 1, limit)
    return count


def verify(source_directory=None, fetch=False):
    catalog = json.loads((ROOT / "catalog.json").read_text())
    chapter_count = move_count = 0
    for study in catalog["studies"]:
        content = (ROOT / study["pgn_file"]).read_bytes()
        assert hashlib.sha256(content).hexdigest() == study["sha256"]
        chapters = games(content.decode())
        assert len(chapters) == len(study["chapters"])
        for game, metadata in zip(chapters, study["chapters"]):
            assert game.board().fen() == chess.STARTING_FEN
            assert game.headers["ListudyChapterId"] == metadata["chapter_id"]
            assert game.headers["Annotator"] == metadata["annotator"]
            assert game.headers["ChapterURL"] == metadata["chapter_url"]
            assert len(list(game.mainline_moves())) == metadata["mainline_plies"]
            original = None
            if source_directory is not None:
                study_id, chapter_id = metadata["chapter_url"].split("/")[-2:]
                path = source_directory / f"{study_id}-{chapter_id}.pgn"
                if fetch:
                    url = f"https://lichess.org/api/study/{study_id}/{chapter_id}.pgn"
                    subprocess.run(
                        ["curl", "--fail", "--silent", "--show-error", "--location",
                         "--max-time", "30", "--output", str(path),
                         url + "?comments=true&variations=true&clocks=false"],
                        check=True,
                    )
                original, = games(path.read_text())
                checksum = hashlib.sha256(str(original).encode()).hexdigest()
                assert checksum == metadata["source_chapter_sha256"], "Source snapshot changed"
            move_count += verify_tree(game, original, limit=metadata["max_plies"])
            chapter_count += 1
    print(f"{len(catalog['studies'])} studies, {chapter_count} chapters, {move_count} legal moves including variations.")
    if source_directory is not None:
        print("Every retained comment, variation and annotation matches the source snapshot.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-directory", type=Path)
    parser.add_argument("--fetch-sources", action="store_true")
    args = parser.parse_args()
    if args.fetch_sources:
        with tempfile.TemporaryDirectory(prefix="listudy-starter-sources-") as directory:
            verify(Path(directory), fetch=True)
    else:
        verify(args.source_directory)
