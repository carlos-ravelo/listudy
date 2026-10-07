"""Edit one chapter using python-chess; preserve all other source text."""
import io
import chess.pgn

MAX_NODES = 10000
MAX_DEPTH = 128


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
