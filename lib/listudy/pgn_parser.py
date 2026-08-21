import sys
import json
import io

try:
    import chess.pgn
except ImportError:
    print(json.dumps({"error": "python-chess not installed"}))
    sys.exit(1)

def parse_single_game(pgn_text):
    pgn_io = io.StringIO(pgn_text)
    game = chess.pgn.read_game(pgn_io)
    if game is None:
        print(json.dumps({"error": "No game found"}))
        sys.exit(1)
        
    board = game.board()
    sequence = []
    
    for move in game.mainline_moves():
        sequence.append([board.fen(), board.san(move)])
        board.push(move)
        
    print(json.dumps({"sequence": sequence}))

def parse_repertoire(pgn_text):
    fen_map = {}
    pgn_io = io.StringIO(pgn_text)
    
    root_fen = None
    
    # Función recursiva para explorar las ramas y calcular la profundidad
    def walk_node(node, chapter_name):
        board = node.board()
        fen = board.fen()
        
        max_depth_below = 0
        san_moves = []
        
        for var in node.variations:
            san_move = board.san(var.move)
            san_moves.append(san_move)
            # Llamada recursiva para ver qué tan profunda es esta variante
            depth_below = walk_node(var, chapter_name)
            max_depth_below = max(max_depth_below, 1 + depth_below)
            
        # Inicializamos el nodo si no existe
        if fen not in fen_map:
            fen_map[fen] = {"moves": [], "chapter": chapter_name, "depth": -1}
            
        # Agregamos los movimientos posibles sin duplicados
        for m in san_moves:
            if m not in fen_map[fen]["moves"]:
                fen_map[fen]["moves"].append(m)
                
        # DESEMPATE: Si esta rama llega más lejos que la que ya teníamos registrada,
        # actualizamos la profundidad y le asignamos este capítulo
        if max_depth_below > fen_map[fen]["depth"]:
            fen_map[fen]["depth"] = max_depth_below
            fen_map[fen]["chapter"] = chapter_name
            
        return max_depth_below

    while True:
        game = chess.pgn.read_game(pgn_io)
        if game is None:
            break
            
        if root_fen is None:
            root_fen = game.board().fen()
            
        # Extraemos el nombre del capítulo (el tab en Listudy/Lichess)
        chapter_name = game.headers.get("Event", "Main Chapter")
        walk_node(game, chapter_name)
                
    # Calcular la "Firma" (Signature FEN)
    moves_made = []
    if root_fen:
        board = chess.Board(root_fen)
        while True:
            fen = board.fen()
            node_data = fen_map.get(fen)
            # Sacamos los movimientos del nuevo formato de diccionario
            moves = node_data["moves"] if node_data else []
            
            if len(moves) == 1:
                move_obj = board.parse_san(moves[0])
                moves_made.append(move_obj)
                board.push(move_obj)
            else:
                break
                
    signature_prefix = chess.Board(root_fen).variation_san(moves_made) if moves_made else ""
                
    print(json.dumps({
        "repertoire_map": fen_map,
        "signature_prefix": signature_prefix
    }))
def parse_early_exit(game_pgn_text, rep_json_path):
    with open(rep_json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        # Support both old and new JSON structures
        repertoire = data.get("repertoire_map", data)
        
    pgn_io = io.StringIO(game_pgn_text)
    game = chess.pgn.read_game(pgn_io)
    
    if game is None:
        sys.exit(0)
        
    board = game.board()
    last_valid_fen = board.fen()
    
    for move in game.mainline_moves():
        fen = board.fen()
        
        # If the position is no longer in the book, theory ends here.
        if fen not in repertoire:
            print(json.dumps({
                "deviation": False,
                "fen": last_valid_fen,
                "ply": len(board.move_stack) # Number of moves played in theory
            }))
            sys.exit(0)
            
        san_move = board.san(move)
        node_data = repertoire[fen]
        
        # Backward compatibility
        if isinstance(node_data, list):
            expected_moves = node_data
            chapter_name = "Unknown Chapter"
        else:
            expected_moves = node_data["moves"]
            chapter_name = node_data.get("chapter", "Unknown Chapter")
            
        # Deviation detected
        if san_move not in expected_moves:
            print(json.dumps({
                "deviation": True,
                "fen": fen,
                "expected": expected_moves,
                "played": san_move,
                "chapter": chapter_name,
                "ply": len(board.move_stack) # Pass the exact ply count to Elixir
            }))
            sys.exit(0)
            
        last_valid_fen = fen
        board.push(move)
        
    print(json.dumps({
        "deviation": False,
        "fen": board.fen(),
        "ply": len(board.move_stack)
    }))

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "single"
    
    if mode == "early_exit":
        game_pgn_path = sys.argv[2]
        rep_json_path = sys.argv[3]
        with open(game_pgn_path, "r", encoding="utf-8") as f:
            pgn_text = f.read()
        parse_early_exit(pgn_text, rep_json_path)
    else:
        if len(sys.argv) > 2:
            with open(sys.argv[2], "r", encoding="utf-8") as f:
                pgn_text = f.read()
        else:
            pgn_text = sys.stdin.read()
            
        if mode == "repertoire":
            parse_repertoire(pgn_text)
        else:
            parse_single_game(pgn_text)