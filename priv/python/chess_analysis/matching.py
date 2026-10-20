"""Find chapters by positions; record departures and subsequent re-entry."""
import chess
from .positions import position_key

INITIAL_KEY = position_key(chess.Board())


def match_chapters(sequence, repertoire):
    # One lookup per game position; only visit chapters that contain it.
    observations = {}
    for position in sequence:
        for chapter_id, entry in repertoire['positions'].get(position['key'], {}).items():
            observations.setdefault(chapter_id, []).append((position, entry['moves']))
    candidates = []
    for chapter in repertoire['chapters']:
        observed = observations.get(chapter['id'], [])
        meaningful = {pos['key'] for pos, _ in observed if pos['key'] != INITIAL_KEY}
        if not meaningful:
            continue
        followed = {(pos['key'], pos['played']) for pos, moves in observed if pos['played'] in moves}
        departures = []
        entry_ply = None
        previous_ply = None
        previous_followed = False
        result = None
        for pos, moves in observed:
            # A return to the generic starting position cannot by itself select
            # a chapter or replace an earlier, more informative result.
            if pos['key'] == INITIAL_KEY and pos['ply'] > 0:
                continue
            if previous_ply is None or pos['ply'] != previous_ply + 1 or not previous_followed:
                entry_ply = pos['ply']
            previous_ply = pos['ply']
            previous_followed = pos['played'] in moves
            if pos['played'] is None:
                reason = 'game_ended'
            elif not moves:
                reason = 'book_ended'
            elif not previous_followed:
                reason = 'deviation'
            else:
                # A followed move always has a corresponding next position in
                # the repertoire. Evaluate that position for the final outcome.
                continue
            result = {'deviation': reason == 'deviation', 'reason': reason,
                      'fen': pos['fen'], 'ply': pos['ply'],
                      'expected': moves if reason == 'deviation' else [],
                      'played': pos['played'] if reason == 'deviation' else '',
                      'chapter': chapter['name'], 'chapter_index': chapter['index'],
                      'entry_ply': entry_ply}
            if reason == 'deviation':
                departures.append({'fen': pos['fen'], 'ply': pos['ply'],
                                   'played': pos['played'], 'expected': moves})
        if result:
            result['earlier_departures'] = [event for event in departures if event['ply'] < result['entry_ply']]
            result['transposed'] = result['entry_ply'] > 0
            # Rank actual matched play, never a chapter's unused future depth.
            result['score'] = [len(followed), len(meaningful)]
            # Equal scores alone do not imply the same game moves were matched.
            result['matched_plies'] = [pos['ply'] for pos, moves in observed if pos['played'] in moves]
            candidates.append(result)
    return sorted(candidates, key=lambda result: result['score'], reverse=True)
