"""Edit one chapter using python-chess; preserve all other source text."""
import io
import copy
import re
import uuid
import chess.pgn

MAX_NODES = 10000
MAX_DEPTH = 128
CHAPTER_ID = 'ListudyChapterId'
ORIGINAL_INDEX = 'ListudyOriginalIndex'


def collection_study(payload):
    items = payload.get('items')
    if not isinstance(items, list) or not 1 <= len(items) <= 500:
        raise ValueError('Choose between 1 and 500 chapters.')
    output = []
    for item in items:
        chapters = chapters_with_spans(item['pgn'])
        if len(chapters) != 1:
            raise ValueError('Each collection entry must contain exactly one chapter.')
        game = chapters[0][0]
        if type(game.board()) is not chess.Board or game.board().chess960:
            raise ValueError('Only standard chess chapters are supported.')
        stack = [(game, 0)]
        count = 0
        while stack:
            node, depth = stack.pop()
            count += 1
            if count > MAX_NODES or depth > MAX_DEPTH:
                raise ValueError('A chapter has too many moves or variations.')
            stack.extend((child, depth + 1) for child in node.variations)
        game.headers[CHAPTER_ID] = uuid.uuid4().hex
        game.headers.pop(ORIGINAL_INDEX, None)
        def header(value):
            return value.replace('"', "'").replace('\\', '/').replace('\n', ' ').replace('\r', ' ')
        if item.get('title'):
            game.headers['Event'] = header(item['title'][:200])
        game.headers['ListudySourceStudy'] = header(item.get('study') or 'Unknown Study')
        path = item.get('studyPath') or ''
        if path.startswith('/') and not path.startswith('//'):
            game.headers['ListudySourcePath'] = header(path)
        output.append(str(game))
    return {'pgn': '\n\n'.join(output) + '\n'}


def maintenance_data(payload):
    chapters = []
    seen = set()
    for index, (game, _, _) in enumerate(chapters_with_spans(payload['pgn'])):
        identity = game.headers.get(CHAPTER_ID, '')
        if not re.fullmatch(r'[a-f0-9]{32}', identity) or identity in seen:
            identity = uuid.uuid4().hex
        seen.add(identity)
        chapters.append({'id': identity, 'source_index': index,
                         'title': game.headers.get('Event') or f'Chapter {index + 1}',
                         'moves': sum(1 for _ in game.mainline_moves())})
    return {'chapters': chapters}


def manage_chapters(payload):
    originals = chapters_with_spans(payload['pgn'])
    entries = payload.get('chapters')
    if not isinstance(entries, list) or not 1 <= len(entries) <= 1000:
        raise ValueError('Keep at least one chapter; a study supports up to 1000 chapters.')
    seen = set()
    original_seen = set()
    original_ids = {g.headers.get(CHAPTER_ID) for g, _, _ in originals}
    output = []
    for entry in entries:
        if not isinstance(entry, dict):
            raise ValueError('Invalid chapter.')
        identity, title = entry.get('id'), entry.get('title')
        if not isinstance(identity, str) or not re.fullmatch(r'[a-f0-9]{32}', identity) or identity in seen:
            raise ValueError('Invalid or repeated chapter identity.')
        if not isinstance(title, str) or not title.strip() or len(title) > 200:
            raise ValueError('Each chapter needs a title of up to 200 characters.')
        seen.add(identity)
        index = entry.get('source_index')
        if index is None:
            if identity in original_ids:
                raise ValueError('A new chapter needs its own identity.')
            game = chess.pgn.Game()
        else:
            if type(index) is not int or not 0 <= index < len(originals):
                raise ValueError('Choose an existing chapter.')
            original = originals[index][0]
            original_id = original.headers.get(CHAPTER_ID, '')
            duplicate = entry.get('duplicate') is True
            if duplicate:
                if identity in original_ids:
                    raise ValueError('A duplicate needs its own identity.')
            else:
                if index in original_seen or (re.fullmatch(r'[a-f0-9]{32}', original_id) and identity != original_id):
                    raise ValueError('An existing chapter must keep its identity.')
                original_seen.add(index)
            game = copy.deepcopy(original)
            if duplicate:
                game.headers.pop(ORIGINAL_INDEX, None)
            elif not re.fullmatch(r'[a-f0-9]{32}', original_id) and game.variations:
                game.headers[ORIGINAL_INDEX] = str(sum(bool(g.variations) for g, _, _ in originals[:index]))
        game.headers[CHAPTER_ID] = identity
        game.headers['Event'] = title.strip()
        output.append(game.accept(chess.pgn.StringExporter(headers=True, variations=True, comments=True)))
    return {'pgn': '\n\n'.join(output) + '\n'}


def chapters_with_spans(pgn):
    source = io.StringIO(pgn)
    chapters = []
    while True:
        start = source.tell()
        game = chess.pgn.read_game(source)
        if game is None:
            break
        if game.errors or not game.board().is_valid():
            raise ValueError('The study contains invalid moves or a starting position.')
        chapters.append((game, start, source.tell()))
    if not chapters:
        raise ValueError('The study contains no chapters.')
    return chapters


def editor_data(payload):
    chapters = []
    count = 0

    def children(node, depth=0):
        nonlocal count
        if depth > MAX_DEPTH:
            raise ValueError('This chapter is too deep for the editor.')
        result = []
        for child in node.variations:
            if not child.move:
                raise ValueError('The editor does not support null moves.')
            count += 1
            if count > MAX_NODES:
                raise ValueError('This study is too large for the editor.')
            result.append({'move': child.san(), 'comment': child.comment,
                           'starting_comment': child.starting_comment,
                           'nags': sorted(child.nags), 'children': children(child, depth + 1)})
        return result

    for index, (game, _, _) in enumerate(chapters_with_spans(payload['pgn'])):
        if type(game.board()) is not chess.Board or game.board().chess960:
            raise ValueError('The editor currently supports standard chess only.')
        chapters.append({'title': game.headers.get('Event') or f'Chapter {index + 1}',
                         'fen': game.board().fen(), 'comment': game.comment,
                         'root': children(game)})
    return {'editor': {'chapters': chapters}}


def replace_chapter(payload):
    pgn = payload['pgn']
    chapters = chapters_with_spans(pgn)
    index = payload.get('chapter_index')
    if type(index) is not int or not 0 <= index < len(chapters):
        raise ValueError('Choose an existing chapter.')
    game, start, end = chapters[index]
    tree = payload.get('tree')
    if not isinstance(tree, dict):
        raise ValueError('Invalid chapter data.')
    edited = chess.pgn.Game(headers=dict(game.headers))
    count = 0

    def comment(value):
        if not isinstance(value, str) or len(value) > 20000 or '}' in value:
            raise ValueError('Comments must be text without a closing brace, up to 20000 characters.')
        return value

    def append(parent, nodes, board, depth=0):
        nonlocal count
        if not isinstance(nodes, list) or depth > MAX_DEPTH:
            raise ValueError('Invalid or excessively deep variations.')
        for item in nodes:
            count += 1
            if count > MAX_NODES or not isinstance(item, dict):
                raise ValueError('Invalid or excessively large variations.')
            san = item.get('move')
            if not isinstance(san, str) or len(san) > 32:
                raise ValueError('Invalid move notation.')
            move = board.parse_san(san)
            if move not in board.legal_moves:
                raise ValueError('Every move must be legal, including variations.')
            if any(child.move == move for child in parent.variations):
                raise ValueError('Duplicate variations are not allowed.')
            child = parent.add_variation(move)
            child.comment = comment(item.get('comment', ''))
            child.starting_comment = comment(item.get('starting_comment', ''))
            nags = item.get('nags', [])
            if not isinstance(nags, list) or any(type(nag) is not int or not 0 <= nag <= 255 for nag in nags):
                raise ValueError('Invalid move annotations.')
            child.nags = set(nags)
            next_board = board.copy()
            next_board.push(move)
            append(child, item.get('children', []), next_board, depth + 1)

    edited.comment = comment(tree.get('comment', ''))
    append(edited, tree.get('root'), edited.board())
    replacement = edited.accept(chess.pgn.StringExporter(headers=True, variations=True, comments=True))
    return {'pgn': pgn[:start] + replacement + '\n\n' + pgn[end:],
            'playback_index': sum(bool(previous.variations) for previous, _, _ in chapters[:index])}
