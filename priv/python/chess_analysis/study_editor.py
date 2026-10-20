"""Edit one chapter using python-chess; preserve all other source text."""
import io
import re
import uuid
import chess.pgn

MAX_NODES = 10000
MAX_DEPTH = 128
CHAPTER_ID = 'ListudyChapterId'
ORIGINAL_INDEX = 'ListudyOriginalIndex'

# Ignore comments and variations when counting main-line moves, without boards.
MAINLINE_TOKENS = re.compile(
    r'\{[^}]*\}|;[^\r\n]*|^%[^\r\n]*|(?P<open>\()|(?P<close>\))|'
    r'(?P<move>O-O(?:-O)?|0-0(?:-0)?|--|Z0|0000|@@@@|'
    r'[PNBRQK]?@[a-h][1-8]|[NBKRQ]?[a-h]?[1-8]?[\-x]?[a-h][1-8](?:=?[nbrqkNBRQK])?)',
    re.MULTILINE)


def chapter_index(pgn):
    """Locate chapters using the PGN parser's header-only, comment-aware reader."""
    source = io.StringIO(pgn)

    class Headers(chess.pgn.HeadersBuilder):
        def visit_header(self, name, value):
            super().visit_header(name, value)
            self.header_end = source.tell()

    chapters = []
    while True:
        start = source.tell()
        visitor = Headers()
        visitor.header_end = start
        headers = chess.pgn.read_game(source, Visitor=lambda: visitor)
        if headers is None:
            break
        end = source.tell()
        moves = depth = 0
        for token in MAINLINE_TOKENS.finditer(pgn, visitor.header_end, end):
            if token.lastgroup == 'open':
                depth += 1
            elif token.lastgroup == 'close':
                depth = max(0, depth - 1)
            elif token.lastgroup == 'move' and depth == 0:
                moves += 1
        chapters.append({'headers': headers, 'start': start, 'end': end,
                         'header_end': visitor.header_end, 'moves': moves})
    if not chapters:
        raise ValueError('The study contains no chapters.')
    return chapters


def selected_chapter(chapters, index):
    if type(index) is not int or not 0 <= index < len(chapters):
        raise ValueError('Choose an existing chapter.')
    return chapters[index]


class EditorGameBuilder(chess.pgn.GameBuilder):
    """Enforce editor limits before allocating an oversized chapter tree."""
    def begin_game(self):
        super().begin_game()
        self.count = 0
        self.initial_ply = None

    def visit_board(self, board):
        if self.initial_ply is None:
            self.initial_ply = board.ply()

    def visit_move(self, board, move):
        self.count += 1
        if self.count > MAX_NODES:
            raise ValueError('This chapter is too large for the editor.')
        if board.ply() - self.initial_ply >= MAX_DEPTH:
            raise ValueError('This chapter is too deep for the editor.')
        if not move:
            raise ValueError('The editor does not support null moves.')
        super().visit_move(board, move)

    def handle_error(self, error):
        raise ValueError(str(error)) from error


def validate_editor_headers(headers):
    board = headers.board()
    if type(board) is not chess.Board or board.chess960:
        raise ValueError('The editor currently supports standard chess only.')
    if not board.is_valid():
        raise ValueError('The chapter contains an invalid starting position.')


def patch_headers(pgn, chapter, changes):
    """Change selected header tags while retaining the exact source movetext."""
    remaining = dict(changes)
    lines = []
    for line in pgn[chapter['start']:chapter['header_end']].splitlines(keepends=True):
        tag = chess.pgn.TAG_REGEX.match(line)
        if tag and tag.group(1) in changes:
            name = tag.group(1)
            value = changes[name]
            remaining.pop(name, None)
            if value is not None:
                lines.append(line if tag.group(2) == value else f'[{name} "{value}"]\n')
        else:
            lines.append(line)
    for name, value in remaining.items():
        if value is not None:
            if lines and not lines[-1].endswith(('\n', '\r')):
                lines.append('\n')
            lines.append(f'[{name} "{value}"]\n')
    return ''.join(lines) + pgn[chapter['header_end']:chapter['end']]


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
    sites = set()
    seen = set()
    for index, chapter in enumerate(chapter_index(payload['pgn'])):
        if chapter['headers'].get('Site'):
            sites.add(chapter['headers']['Site'])
        identity = chapter['headers'].get(CHAPTER_ID, '')
        if not re.fullmatch(r'[a-f0-9]{32}', identity) or identity in seen:
            identity = uuid.uuid4().hex
        seen.add(identity)
        chapters.append({'id': identity, 'source_index': index,
                         'title': chapter['headers'].get('Event') or f'Chapter {index + 1}',
                         'moves': chapter['moves']})
    return {'chapters': chapters, 'sites': sorted(sites)}


def manage_chapters(payload):
    originals = chapter_index(payload['pgn'])
    entries = payload.get('chapters')
    if not isinstance(entries, list) or not 1 <= len(entries) <= 1000:
        raise ValueError('Keep at least one chapter; a study supports up to 1000 chapters.')
    seen = set()
    original_seen = set()
    original_ids = {chapter['headers'].get(CHAPTER_ID) for chapter in originals}
    output = []
    for entry in entries:
        if not isinstance(entry, dict):
            raise ValueError('Invalid chapter.')
        identity, title = entry.get('id'), entry.get('title')
        if not isinstance(identity, str) or not re.fullmatch(r'[a-f0-9]{32}', identity) or identity in seen:
            raise ValueError('Invalid or repeated chapter identity.')
        if not isinstance(title, str) or not title.strip() or len(title) > 200:
            raise ValueError('Each chapter needs a title of up to 200 characters.')
        if any(character in title for character in ['"', '\\', '\n', '\r']):
            raise ValueError('Chapter titles cannot contain quotes, backslashes or line breaks.')
        seen.add(identity)
        index = entry.get('source_index')
        if index is None:
            if identity in original_ids:
                raise ValueError('A new chapter needs its own identity.')
            game = chess.pgn.Game()
            game.headers[CHAPTER_ID] = identity
            game.headers['Event'] = title.strip()
            output.append(str(game) + '\n\n')
            continue
        else:
            if type(index) is not int or not 0 <= index < len(originals):
                raise ValueError('Choose an existing chapter.')
            original = originals[index]
            original_id = original['headers'].get(CHAPTER_ID, '')
            duplicate = entry.get('duplicate') is True
            if duplicate:
                if identity in original_ids:
                    raise ValueError('A duplicate needs its own identity.')
            else:
                if index in original_seen or (re.fullmatch(r'[a-f0-9]{32}', original_id) and identity != original_id):
                    raise ValueError('An existing chapter must keep its identity.')
                original_seen.add(index)
            changes = {CHAPTER_ID: identity, 'Event': title.strip()}
            if duplicate:
                changes[ORIGINAL_INDEX] = None
            elif not re.fullmatch(r'[a-f0-9]{32}', original_id) and original['moves']:
                changes[ORIGINAL_INDEX] = str(sum(bool(chapter['moves']) for chapter in originals[:index]))
            output.append(patch_headers(payload['pgn'], original, changes))
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

    selected = payload.get('chapter_index')
    if 'chapter_index' in payload:
        index_data = chapter_index(payload['pgn'])
        chapter = selected_chapter(index_data, selected)
        validate_editor_headers(chapter['headers'])
        game = chess.pgn.read_game(io.StringIO(payload['pgn'][chapter['start']:chapter['end']]), Visitor=EditorGameBuilder)
        games = [(selected, game)]
    else:
        games = [(index, game) for index, (game, _, _) in enumerate(chapters_with_spans(payload['pgn']))]

    for index, game in games:
        count = 0
        if type(game.board()) is not chess.Board or game.board().chess960:
            raise ValueError('The editor currently supports standard chess only.')
        chapters.append({'title': game.headers.get('Event') or f'Chapter {index + 1}',
                         'headers': dict(game.headers),
                         'fen': game.board().fen(), 'comment': game.comment,
                         'root': children(game)})
    if 'chapter_index' in payload:
        return {'editor': {'chapters': [
            {'title': chapter['headers'].get('Event') or f'Chapter {index + 1}', 'source_index': index}
            for index, chapter in enumerate(index_data)], 'chapter_index': selected, 'chapter': chapters[0]}}
    return {'editor': {'chapters': chapters}}


def replace_chapter(payload):
    pgn = payload['pgn']
    chapters = chapter_index(pgn)
    index = payload.get('chapter_index')
    chapter = selected_chapter(chapters, index)
    validate_editor_headers(chapter['headers'])
    start, end = chapter['start'], chapter['end']
    tree = payload.get('tree')
    if not isinstance(tree, dict):
        raise ValueError('Invalid chapter data.')
    edited = chess.pgn.Game(headers=dict(chapter['headers']))
    if 'title' in tree:
        title = tree['title']
        if not isinstance(title, str) or not title.strip() or len(title) > 200:
            raise ValueError('Each chapter needs a title of up to 200 characters.')
        if any(character in title for character in ['"', '\\', '\n', '\r']):
            raise ValueError('Chapter titles cannot contain quotes, backslashes or line breaks.')
        edited.headers['Event'] = title.strip()
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
            'playback_index': sum(bool(previous['moves']) for previous in chapters[:index])}
