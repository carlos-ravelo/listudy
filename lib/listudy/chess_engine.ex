defmodule Listudy.Games.ChessEngine do
  @moduledoc """
  Wrapper around our underlying chess library (e.g., bchess or a Rust NIF)
  to parse PGNs and generate FEN sequences.
  """

  @doc """
  Converts a PGN string into a list of tuples containing the FEN BEFORE the move,
  and the move played in SAN (Standard Algebraic Notation).
  
  Returns: `{:ok, [{fen_before_move, played_move_san}, ...]}`
  """
  def parse_pgn_to_fens(_pgn_string) do
    # NOTE: Simulated implementation. 
    # If using `bchess`, you would load the game, iterate through its moves,
    # and yield the current FEN at each step.
    #
    # Example expected output format:
    # [
    #   {"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "e4"},
    #   {"rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1", "e5"},
    #   {"rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2", "Nf3"}
    # ]
    
    mocked_sequence = [] 
    {:ok, mocked_sequence}
  end
end