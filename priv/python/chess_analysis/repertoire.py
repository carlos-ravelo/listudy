"""Build reusable position indexes, retaining every chapter at shared positions."""
import hashlib
import json
import os
from pathlib import Path
import tempfile

from .positions import position_key, read_games

# Bump this when index or matching semantics change. Also versions saved analyses.
VERSION = 'positions-v3'


def build_index(pgn):
    chapters = []
    positions = {}
    for index, game in enumerate(read_games(pgn)):
        chapter_id = str(index)
        name = game.headers.get('Event')
        if not name or name == '?':
            name = f'Chapter {index + 1}'
        chapters.append({'id': chapter_id, 'index': index, 'name': name})
        board = game.board()

        def walk(node):
            key = position_key(board)
            entry = positions.setdefault(key, {}).setdefault(chapter_id, {'moves': []})
            for child in node.variations:
                san = board.san(child.move)
                if san not in entry['moves']:
                    entry['moves'].append(san)
                board.push(child.move)
                walk(child)
                board.pop()

        walk(game)
    return {'version': VERSION, 'chapters': chapters, 'positions': positions}


def cached_index(pgn, directory=None):
    """Content-addressed, disposable JSON cache. Writes replace files atomically."""
    digest = hashlib.sha256((VERSION + '\0' + pgn).encode()).hexdigest()
    directory = Path(directory or (Path(tempfile.gettempdir()) / f'listudy-index-{os.getuid()}'))
    try:
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        path = directory / (digest + '.json')
        if path.exists():
            data = json.loads(path.read_text())
            if data.get('version') == VERSION:
                return data
    except (OSError, ValueError):
        pass
    data = build_index(pgn)
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', dir=directory, delete=False, encoding='utf-8') as cache:
            temp_path = Path(cache.name)
            json.dump(data, cache, separators=(',', ':'))
        temp_path.replace(directory / (digest + '.json'))
        # Bound persistent cache growth. Cache eviction never changes saved studies.
        files = sorted(directory.glob('*.json'), key=lambda item: item.stat().st_mtime, reverse=True)
        for old in files[128:]:
            old.unlink(missing_ok=True)
    except OSError:
        pass
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)
    return data
