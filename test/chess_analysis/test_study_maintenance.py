import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'priv/python'))
from chess_analysis.study_editor import maintenance_data, manage_chapters, chapters_with_spans, replace_chapter, editor_data


class StudyMaintenanceTests(unittest.TestCase):
    def setUp(self):
        self.pgn = '[Event "First"]\n\n1. e4 {Note} e5 (1... c5 $1 {Sicilian}) *\n\n[Event "Second"]\n\n1. d4 d5 *\n'
        self.rows = maintenance_data({'pgn': self.pgn})['chapters']

    def save(self, rows, pgn=None):
        return manage_chapters({'pgn': pgn or self.pgn, 'chapters': rows})['pgn']

    def test_reorder_rename_and_original_progress_indexes(self):
        rows = list(reversed(self.rows))
        rows[0]['title'] = 'Renamed second'
        saved = self.save(rows)
        games = [g for g, _, _ in chapters_with_spans(saved)]
        self.assertEqual([g.headers['ListudyChapterId'] for g in games], [r['id'] for r in rows])
        self.assertEqual([g.headers['ListudyOriginalIndex'] for g in games], ['1', '0'])
        self.assertEqual(games[0].headers['Event'], 'Renamed second')
        self.assertEqual(games[1].variations[0].comment, 'Note')
        self.assertEqual(games[1].variations[0].variations[1].comment, 'Sicilian')
        self.assertEqual(games[1].variations[0].variations[1].nags, {1})
        next_rows = maintenance_data({'pgn': saved})['chapters']
        self.assertEqual(next_rows[0]['id'], rows[0]['id'])
        again = self.save(list(reversed(next_rows)), saved)
        self.assertEqual(chapters_with_spans(again)[0][0].headers['ListudyOriginalIndex'], '0')

    def test_duplicate_add_and_delete_do_not_reuse_progress(self):
        duplicate = dict(self.rows[0], id='d' * 32, duplicate=True, title='Copy')
        blank = {'id': 'e' * 32, 'source_index': None, 'title': 'New'}
        games = [g for g, _, _ in chapters_with_spans(self.save([self.rows[0], duplicate, blank]))]
        self.assertNotIn('ListudyOriginalIndex', games[1].headers)
        self.assertNotIn('ListudyOriginalIndex', games[2].headers)
        self.assertEqual(len(games[1].variations[0].variations), 2)
        self.assertFalse(games[2].variations)

    def test_empty_source_chapters_use_playback_not_source_index(self):
        pgn = '[Event "Empty"]\n\n*\n\n' + self.pgn
        rows = maintenance_data({'pgn': pgn})['chapters']
        games = [g for g, _, _ in chapters_with_spans(self.save(list(reversed(rows)), pgn))]
        self.assertEqual(games[0].headers['ListudyOriginalIndex'], '1')
        self.assertEqual(games[1].headers['ListudyOriginalIndex'], '0')
        self.assertNotIn('ListudyOriginalIndex', games[2].headers)

    def test_invalid_operations_are_rejected(self):
        for rows in [[], [self.rows[0], self.rows[0]], [dict(self.rows[0], title='')],
                     [dict(self.rows[0], source_index=999)], [dict(self.rows[0], source_index=True)]]:
            with self.assertRaises(ValueError):
                self.save(rows)
        saved = self.save(self.rows)
        rows = maintenance_data({'pgn': saved})['chapters']
        with self.assertRaises(ValueError):
            self.save([dict(rows[0], id=rows[1]['id'], duplicate=True)], saved)

    def test_chapter_editor_keeps_identity_and_migration_header(self):
        saved = self.save(self.rows)
        tree = editor_data({'pgn': saved})['editor']['chapters'][0]
        tree['comment'] = 'Edited'
        edited = replace_chapter({'pgn': saved, 'chapter_index': 0, 'tree': tree})['pgn']
        game = chapters_with_spans(edited)[0][0]
        self.assertEqual(game.headers['ListudyChapterId'], self.rows[0]['id'])
        self.assertEqual(game.headers['ListudyOriginalIndex'], '0')
