import io
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'priv/python'))
import chess.pgn
from chess_analysis.study_editor import collection_study


class CollectionStudyTest(unittest.TestCase):
    def test_copies_preserve_variations_and_annotations_with_fresh_ids(self):
        item = {'title': 'Chapter "A"', 'study': 'Source', 'studyPath': '/en/studies/source',
                'pgn': '[Event "A"]\n[ListudyChapterId "' + 'a' * 32 + '"]\n[ListudyOriginalIndex "2"]\n\n1. e4 $1 {Comment} e5 (1... c5) *'}
        source = io.StringIO(collection_study({'items': [item, item]})['pgn'])
        first, second = chess.pgn.read_game(source), chess.pgn.read_game(source)
        self.assertNotEqual(first.headers['ListudyChapterId'], second.headers['ListudyChapterId'])
        self.assertNotEqual(first.headers['ListudyChapterId'], 'a' * 32)
        self.assertNotIn('ListudyOriginalIndex', first.headers)
        self.assertFalse(first.errors)
        self.assertEqual(first.variations[0].comment, 'Comment')
        self.assertEqual(len(first.variations[0].variations), 2)

    def test_multi_chapter_entry_is_rejected(self):
        with self.assertRaises(ValueError):
            collection_study({'items': [{'pgn': '[Event "A"]\n\n1. e4 *\n\n[Event "B"]\n\n1. d4 *'}]})


if __name__ == '__main__':
    unittest.main()
