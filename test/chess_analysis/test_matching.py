import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'priv/python'))
import chess
from chess_analysis.positions import game_positions, position_key
from chess_analysis.repertoire import build_index, cached_index
from chess_analysis.matching import match_chapters
from pgn_parser import analyze_batch


def chapter(name, moves):
    return f'[Event "{name}"]\n\n{moves}\n\n'


class MatchingTests(unittest.TestCase):
    def test_move_order_transposition_and_book_end(self):
        rep = build_index(chapter('Target', '1. Nf3 d5 2. d4 Nf6 3. c4 *'))
        results = match_chapters(game_positions('1. d4 d5 2. Nf3 Nf6 3. c4 e6 *'), rep)
        self.assertEqual(results[0]['chapter'], 'Target')
        self.assertEqual(results[0]['reason'], 'book_ended')
        self.assertEqual(results[0]['ply'], 5)
        self.assertTrue(results[0]['transposed'])
        self.assertEqual(results[0]['earlier_departures'][0]['played'], 'd4')

    def test_deviation_after_transposition(self):
        rep = build_index(chapter('Target', '1. Nf3 d5 2. d4 Nf6 3. c4 *'))
        result = match_chapters(game_positions('1. d4 d5 2. Nf3 Nf6 3. e3 *'), rep)[0]
        self.assertTrue(result['deviation'])
        self.assertEqual(result['expected'], ['c4'])
        self.assertEqual(result['ply'], 4)
        self.assertEqual(result['played'], 'e3')

    def test_clocks_ignored_but_castling_and_turn_preserved(self):
        board = chess.Board()
        clone = board.copy()
        clone.halfmove_clock = 17
        clone.fullmove_number = 9
        self.assertEqual(position_key(board), position_key(clone))
        clone.turn = chess.BLACK
        self.assertNotEqual(position_key(board), position_key(clone))
        clone.turn = chess.WHITE
        clone.castling_rights = 0
        self.assertNotEqual(position_key(board), position_key(clone))

    def test_only_legal_en_passant_changes_identity(self):
        board = chess.Board()
        board.push_san('e4')
        clone = board.copy()
        clone.ep_square = None
        self.assertEqual(position_key(board), position_key(clone))
        for move in ['a6', 'e5', 'd5']:
            board.push_san(move)
        clone = board.copy()
        clone.ep_square = None
        self.assertNotEqual(position_key(board), position_key(clone))

    def test_actual_play_wins_over_unused_chapter_length(self):
        rep = build_index(chapter('Short', '1. e4 e5 2. Nf3 Nc6 *') +
                          chapter('Long', '1. e4 e5 2. Bc4 Bc5 3. d3 Nf6 4. Nf3 Nc6 *'))
        results = match_chapters(game_positions('1. e4 e5 2. Nf3 Nc6 3. d4 *'), rep)
        self.assertEqual(results[0]['chapter'], 'Short')
        self.assertGreater(results[0]['score'], results[1]['score'])
        self.assertEqual(results[0]['reason'], 'book_ended')

    def test_equal_chapters_remain_candidates_with_distinct_indexes(self):
        rep = build_index(chapter('Same name', '1. e4 e5 2. Nf3 *') + chapter('Same name', '1. e4 e5 2. Bc4 *'))
        results = match_chapters(game_positions('1. e4 e5 2. d4 *'), rep)
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0]['score'], results[1]['score'])
        self.assertEqual({result['chapter_index'] for result in results}, {0, 1})
        self.assertEqual(results[0]['expected'], ['Nf3'])
        self.assertEqual(results[1]['expected'], ['Bc4'])

    def test_variations_and_custom_start(self):
        rep = build_index(chapter('Variations', '1. e4 e5 (1... c5 2. Nf3) 2. Nf3 *'))
        result = match_chapters(game_positions('1. e4 c5 2. Nf3 *'), rep)[0]
        self.assertEqual(result['reason'], 'game_ended')
        fen = '8/8/8/8/8/4k3/8/4K2R w K - 0 1'
        # A valid custom position with no castling rights.
        fen = fen.replace(' w K ', ' w - ')
        header = f'[SetUp "1"]\n[FEN "{fen}"]\n\n'
        rep = build_index(header + '1. Rh3+ *')
        result = match_chapters(game_positions(header + '1. Rh3+ *'), rep)[0]
        self.assertEqual(result['ply'], 1)
        self.assertFalse(result['deviation'])

    def test_unrelated_game_does_not_match_initial_position(self):
        rep = build_index(chapter('King pawn', '1. e4 e5 *'))
        self.assertEqual(match_chapters(game_positions('1. d4 d5 *'), rep), [])

    def test_invalid_game_reports_error(self):
        with self.assertRaises(ValueError):
            game_positions('1. e4 e5 2. Ke3 *')
        with self.assertRaises(ValueError):
            game_positions('not a chess game')

    def test_cache_reused_and_changed_content_invalidates(self):
        with tempfile.TemporaryDirectory() as directory:
            pgn = chapter('First', '1. e4 e5 *')
            first = cached_index(pgn, directory)
            with patch('chess_analysis.repertoire.build_index', side_effect=AssertionError('Reparsed cached PGN')):
                self.assertEqual(first, cached_index(pgn, directory))
            second = cached_index(chapter('Second', '1. d4 d5 *'), directory)
            self.assertNotEqual(first, second)

    def test_batch_parses_each_game_once_for_all_studies(self):
        payload = {'studies': [{'id': 1, 'pgn': chapter('A', '1. e4 e5 *')},
                               {'id': 2, 'pgn': chapter('B', '1. d4 d5 *')}],
                   'games': [{'id': 9, 'pgn': '1. e4 e5 *'}]}
        with patch('pgn_parser.game_positions', wraps=game_positions) as parse:
            results = analyze_batch(payload)
            self.assertEqual(parse.call_count, 1)
        self.assertEqual(len(results['games'][0]['matches']), 2)
        self.assertEqual(results['games'][0]['matches'][0]['candidates'][0]['chapter'], 'A')


if __name__ == '__main__':
    unittest.main()
