import csv
import os
import tempfile
import unittest
from pathlib import Path

import chess
from puzzle_catalog import normalize, sample

FIXTURE = Path(__file__).resolve().parents[2] / "test/fixtures/puzzles/lichess.csv"


class PuzzleCatalogTest(unittest.TestCase):
    def setUp(self):
        with open(FIXTURE) as stream:
            self.rows = list(csv.DictReader(stream))

    def test_setup_is_applied_and_solution_uses_san(self):
        result = normalize(self.rows[0])
        board = chess.Board(result["source_fen"])
        board.push_uci("e8d7")
        self.assertEqual(result["fen"], board.fen())
        self.assertEqual(result["moves"], "Be6+ Kd8 Qf8#")
        self.assertEqual(result["color"], "white")
        self.assertEqual(result["rating"], 1760)

    def test_illegal_solution_is_rejected(self):
        with self.assertRaises(ValueError):
            normalize(dict(self.rows[0], Moves="e8d7 a2a8"))

    def test_quoted_csv_multiple_themes_and_new_optional_columns(self):
        row = dict(self.rows[0], DailyDate="", OpeningTags='Quoted, opening')
        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False) as stream:
            writer = csv.DictWriter(stream, fieldnames=list(row))
            writer.writeheader()
            writer.writerow(row)
            name = stream.name
        try:
            selected, stats = sample(name, 50)
            self.assertEqual(stats["selected"], 1)
            self.assertIn("mateIn2", selected[0]["themes"])
        finally:
            os.unlink(name)

    def test_rating_balance_deduplication_and_reproducibility(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False) as stream:
            writer = csv.DictWriter(stream, fieldnames=list(self.rows[0]))
            writer.writeheader()
            for band in range(10):
                for index in range(20):
                    writer.writerow(dict(self.rows[0], PuzzleId=f"p{band}x{index}", Rating=700 + band * 200))
            writer.writerow(dict(self.rows[0], PuzzleId="p0x0", Rating=700))
            name = stream.name
        try:
            selected, _ = sample(name, 100)
            self.assertEqual(len(selected), 100)
            self.assertEqual(len({row["source_id"] for row in selected}), 100)
            self.assertEqual([sum(row["rating"] == 700 + band * 200 for row in selected) for band in range(10)], [10] * 10)
            self.assertEqual(selected, sample(name, 100)[0])
        finally:
            os.unlink(name)


if __name__ == "__main__":
    unittest.main()
