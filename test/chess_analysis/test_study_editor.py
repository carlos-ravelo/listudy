import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'priv/python'))
from chess_analysis.study_editor import editor_data, replace_chapter, chapters_with_spans


class StudyEditorTests(unittest.TestCase):
    def setUp(self):
        self.first = '[Event "Plan (A)"]\n\n1. e4 {[%cal Ge2e4] Original} e5 (1... c5 $1 {Sicilian}) *\n\n'
        self.second = '[Event "Other"]\n\n1. d4 d5 {Keep  these  spaces} *\n'
        self.pgn = self.first + self.second

    def test_edit_retains_variants_annotations_headers_and_other_chapter(self):
        tree = editor_data({'pgn': self.pgn})['editor']['chapters'][0]
        tree['root'][0]['comment'] += ' More detail'
        tree['root'][0]['children'].append({'move': 'e6', 'comment': 'French', 'children': []})
        result = replace_chapter({'pgn': self.pgn, 'chapter_index': 0, 'tree': tree})['pgn']
        self.assertTrue(result.endswith(self.second))
        edited = editor_data({'pgn': result})['editor']['chapters'][0]
        self.assertEqual(edited['title'], 'Plan (A)')
        self.assertEqual(edited['root'][0]['comment'], '[%cal Ge2e4] Original More detail')
        self.assertEqual([node['move'] for node in edited['root'][0]['children']], ['e5', 'c5', 'e6'])
        self.assertEqual(edited['root'][0]['children'][1]['nags'], [1])

    def test_edit_second_chapter_preserves_first_exactly(self):
        tree = editor_data({'pgn': self.pgn})['editor']['chapters'][1]
        tree['comment'] = 'Chapter introduction'
        result = replace_chapter({'pgn': self.pgn, 'chapter_index': 1, 'tree': tree})['pgn']
        self.assertTrue(result.startswith(self.first))
        self.assertEqual(chapters_with_spans(result)[1][0].comment, 'Chapter introduction')

    def test_invalid_variation_is_rejected(self):
        tree = editor_data({'pgn': self.pgn})['editor']['chapters'][0]
        tree['root'][0]['children'].append({'move': 'e4', 'children': []})
        with self.assertRaises(ValueError):
            replace_chapter({'pgn': self.pgn, 'chapter_index': 0, 'tree': tree})

    def test_custom_fen_black_to_move_and_underpromotion(self):
        pgn = '[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/p7/4K3 b - - 0 1"]\n\n*'
        tree = editor_data({'pgn': pgn})['editor']['chapters'][0]
        tree['root'].append({'move': 'a1=N', 'children': []})
        result = replace_chapter({'pgn': pgn, 'chapter_index': 0, 'tree': tree})['pgn']
        self.assertIn('a1=N', result)
        self.assertEqual(chapters_with_spans(result)[0][0].board().turn, False)

    def test_out_of_range_and_malformed_data_are_rejected(self):
        for index in [-1, 2, True, '0']:
            with self.assertRaises(ValueError):
                replace_chapter({'pgn': self.pgn, 'chapter_index': index, 'tree': {}})
        with self.assertRaises(ValueError):
            replace_chapter({'pgn': self.pgn, 'chapter_index': 0, 'tree': {'root': 'bad'}})

    def test_empty_chapter_keeps_its_index(self):
        pgn = '[Event "Empty"]\n\n*\n\n' + self.second
        chapters = editor_data({'pgn': pgn})['editor']['chapters']
        self.assertEqual(len(chapters), 2)
        self.assertEqual(chapters[0]['root'], [])
        self.assertEqual(chapters[1]['title'], 'Other')

    def test_duplicate_variations_and_unserializable_comments_are_rejected(self):
        tree = editor_data({'pgn': self.pgn})['editor']['chapters'][0]
        tree['root'].append(tree['root'][0])
        with self.assertRaises(ValueError):
            replace_chapter({'pgn': self.pgn, 'chapter_index': 0, 'tree': tree})
        tree = editor_data({'pgn': self.pgn})['editor']['chapters'][0]
        tree['comment'] = 'Closing } brace'
        with self.assertRaises(ValueError):
            replace_chapter({'pgn': self.pgn, 'chapter_index': 0, 'tree': tree})


if __name__ == '__main__':
    unittest.main()
