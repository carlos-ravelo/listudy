"""JSON command-line interface for the Listudy analysis service."""
import json
import sys
from chess_analysis.positions import game_positions
from chess_analysis.repertoire import cached_index
from chess_analysis.matching import match_chapters


def analyze_batch(payload):
    studies = {}
    study_errors = {}
    for study in payload['studies']:
        try:
            studies[str(study['id'])] = cached_index(study['pgn'])
        except (ValueError, RecursionError) as error:
            study_errors[str(study['id'])] = str(error)
    output = []
    for game in payload['games']:
        try:
            sequence = game_positions(game['pgn'])
            matches = []
            allowed = {str(value) for value in game.get('study_ids', studies)}
            for study_id, index in studies.items():
                if study_id in allowed:
                    matches.append({'study_id': study_id, 'candidates': match_chapters(sequence, index)})
            errors = {key: value for key, value in study_errors.items() if key in allowed}
            output.append({'id': game['id'], 'matches': matches, 'study_errors': errors})
        except ValueError as error:
            output.append({'id': game['id'], 'error': str(error)})
    return {'games': output}


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'single'
    if len(sys.argv) > 2:
        with open(sys.argv[2], encoding='utf-8') as source:
            text = source.read()
    else:
        text = sys.stdin.read()
    if mode == 'batch':
        return analyze_batch(json.loads(text))
    if mode == 'repertoire':
        return {'repertoire_map': cached_index(text)}
    if mode == 'early_exit':
        with open(sys.argv[3], encoding='utf-8') as source:
            repertoire = json.load(source)
        repertoire = repertoire.get('repertoire_map', repertoire)
        results = match_chapters(game_positions(text), repertoire)
        return results[0] if results else {'no_match': True}
    positions = game_positions(text)
    return {'sequence': [[pos['fen'], pos['played']] for pos in positions if pos['played'] is not None]}


if __name__ == '__main__':
    try:
        print(json.dumps(main()))
    except (ValueError, OSError, RecursionError) as error:
        print(json.dumps({'error': str(error)}))
        sys.exit(1)
