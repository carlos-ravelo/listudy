import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'priv/python'))
from chess_analysis.study_editor import chapter_index, editor_data, maintenance_data, manage_chapters, replace_chapter


class ChapterLoadingTests(unittest.TestCase):
    def setUp(self):
        self.small = '[Event "Small"]\n\n1. e4 {Keep  spaces} e5 *\n'
        self.large = '[Event "Large"]\n\n' + 'Nf3 Nf6 Ng1 Ng8 ' * 2600 + '*\n\n'

    def load(self, pgn, index):
        return editor_data({'pgn': pgn, 'chapter_index': index})['editor']

    def test_large_unselected_chapter_does_not_block_editing(self):
        pgn = self.large + self.small
        editor = self.load(pgn, 1)
        self.assertEqual(editor['chapter_index'], 1)
        self.assertEqual(editor['chapter']['title'], 'Small')
        self.assertEqual([row['title'] for row in editor['chapters']], ['Large', 'Small'])
        self.assertTrue(all('root' not in row and 'headers' not in row for row in editor['chapters']))
        editor['chapter']['comment'] = 'Edited'
        saved = replace_chapter({'pgn': pgn, 'chapter_index': 1, 'tree': editor['chapter']})
        self.assertTrue(saved['pgn'].startswith(self.large))
        self.assertEqual(saved['playback_index'], 1)
        with self.assertRaisesRegex(ValueError, 'too (large|deep)'):
            self.load(pgn, 0)

    def test_total_study_size_is_not_an_editor_limit(self):
        chapter = '[Event "Repeated"]\n\n' + 'Nf3 Nf6 Ng1 Ng8 ' * 30 + '*\n\n'
        editor = self.load(chapter * 90, 89)
        self.assertEqual(len(editor['chapters']), 90)
        self.assertEqual(editor['chapter']['title'], 'Repeated')

    def test_maintenance_never_builds_move_trees_and_retains_original_movetext(self):
        pgn = self.large + self.small
        with patch('chess.pgn.GameNode.add_variation', side_effect=AssertionError('Unexpected move tree')):
            rows = maintenance_data({'pgn': pgn})['chapters']
            rows[1]['title'] = 'Renamed'
            saved = manage_chapters({'pgn': pgn, 'chapters': list(reversed(rows))})['pgn']
        self.assertIn(self.large.split('\n\n', 1)[1], saved)
        self.assertIn('1. e4 {Keep  spaces} e5 *\n', saved)
        self.assertEqual([row['title'] for row in maintenance_data({'pgn': saved})['chapters']], ['Renamed', 'Large'])

    def test_header_like_comments_and_nested_variations_do_not_split_chapters(self):
        pgn = ('[Event "First"]\n\n{Introduction\n\n[Event "Fake"]\n}\n'
               '1. e4 {More\n\n[Event "Also fake"]\n} e5 (1... c5 (1... e6) 2. Nf3)\n'
               '; [Event "Not a chapter"]\n2. Nf3 *\n\n' + self.small)
        index = chapter_index(pgn)
        self.assertEqual(len(index), 2)
        self.assertEqual([row['moves'] for row in index], [3, 2])
        self.assertEqual(self.load(pgn, 1)['chapter']['title'], 'Small')

    def test_empty_chapters_keep_source_indexes_and_playback_indexes(self):
        pgn = '[Event "Empty"]\n\n*\n\n' + self.small
        self.assertEqual(self.load(pgn, 0)['chapter']['root'], [])
        chapter = self.load(pgn, 1)['chapter']
        result = replace_chapter({'pgn': pgn, 'chapter_index': 1, 'tree': chapter})
        self.assertEqual(result['playback_index'], 0)

    def test_invalid_unselected_moves_do_not_block_valid_chapter(self):
        invalid = '[Event "Broken"]\n\n1. e4 e4 *\n\n'
        self.assertEqual(self.load(invalid + self.small, 1)['chapter']['title'], 'Small')
        with self.assertRaises(ValueError):
            self.load(invalid + self.small, 0)

    def test_only_selected_chapter_is_parsed_and_limits_apply_before_building_it(self):
        import chess.pgn
        original = chess.pgn.GameBuilder.visit_move
        parsed = []

        def visit(builder, board, move):
            parsed.append(move)
            original(builder, board, move)

        with patch('chess.pgn.GameBuilder.visit_move', visit):
            self.load(self.large + self.small, 1)
        self.assertEqual(len(parsed), 2)
        with patch('chess_analysis.study_editor.MAX_NODES', 1):
            with self.assertRaisesRegex(ValueError, 'too large'):
                self.load(self.small, 0)
        with patch('chess_analysis.study_editor.MAX_DEPTH', 1):
            with self.assertRaisesRegex(ValueError, 'too deep'):
                self.load(self.small, 0)

    def test_invalid_selected_indexes_are_rejected(self):
        for index in [-1, 1, True, '0', None]:
            with self.subTest(index=index), self.assertRaises(ValueError):
                self.load(self.small, index)


if __name__ == '__main__':
    unittest.main()
