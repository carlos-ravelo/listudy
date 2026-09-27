import io
import chess
import chess.pgn


def position_key(board):
    """Opening identity excludes clocks but preserves legal playing rights."""
    return ' '.join(board.fen(en_passant='legal').split()[:4])


def read_games(pgn):
    source = io.StringIO(pgn)
    games = []
    while True:
        game = chess.pgn.read_game(source)
        if game is None:
            break
        if game.errors:
            raise ValueError('Invalid PGN: ' + str(game.errors[0]))
        if not game.board().is_valid():
            raise ValueError('Invalid starting position')
        games.append(game)
    if not games:
        raise ValueError('No game found')
    return games


def game_positions(pgn):
    games = read_games(pgn)
    if len(games) != 1:
        raise ValueError('Submit one game at a time')
    board = games[0].board()
    sequence = []
    for ply, move in enumerate(games[0].mainline_moves()):
        sequence.append({'key': position_key(board), 'fen': board.fen(),
                         'played': board.san(move), 'ply': ply})
        board.push(move)
    if not sequence:
        raise ValueError('The PGN contains no moves')
    sequence.append({'key': position_key(board), 'fen': board.fen(),
                     'played': None, 'ply': len(sequence)})
    return sequence
