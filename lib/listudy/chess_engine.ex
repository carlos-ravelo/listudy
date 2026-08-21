defmodule Listudy.Games.ChessEngine do
  @moduledoc """
  Wrapper around our underlying chess library (e.g., bchess or a Rust NIF)
  to parse PGNs and generate FEN sequences.
  """

  @script_path "/home/cravelo/selfInstalledSoftware/listudy/lib/listudy/pgn_parser.py"

  @doc """
  Converts a PGN string into a list of tuples containing the FEN BEFORE the move,
  and the move played in SAN (Standard Algebraic Notation).

  Returns: `{:ok, [{fen_before_move, played_move_san}, ...]}`
  """
  def parse_pgn_to_fens(pgn) do
      tmp_path =
        Path.join(
          System.tmp_dir!(),
          "game_#{System.unique_integer([:positive])}.pgn"
        )

      File.write!(tmp_path, pgn)

      try do
        case System.cmd("python3", [@script_path, "single", tmp_path]) do
          {json_output, 0} ->
            case Jason.decode(json_output) do
              {:ok, %{"sequence" => seq}} ->
                # Esta es la línea nueva que transforma [fen, move] a {fen, move}
                seq_tuples = Enum.map(seq, fn [fen, move] -> {fen, move} end)
                {:ok, seq_tuples}

              {:ok, %{"error" => err}} -> {:error, err}
              {:error, reason} -> {:error, reason}
            end

          {err, _} ->
            {:error, err}
        end
      after
        File.rm(tmp_path)
      end
    end

  @doc """
  Calls the python script by creating a temporary file for the PGN,
  reads the result, and cleans up the temp file.
  """
  def parse_repertoire_to_map(raw_pgn) do
      tmp_path = Path.join(System.tmp_dir!(), "rep_#{System.unique_integer([:positive])}.pgn")
      File.write!(tmp_path, raw_pgn)

      result =
        case System.cmd("python3", [@script_path, "repertoire", tmp_path]) do
          {json_output, 0} -> Jason.decode!(json_output)
          {err, _} ->
            IO.puts("Error en Python: #{err}")
            %{}
        end
      File.rm(tmp_path)
      result
    end

@doc """
  Compara una partida directamente contra el repertorio y aborta al primer error.
  Recibe el string del PGN de la partida y el Map del repertorio generado previamente.
  """
  def find_first_deviation(game_pgn, repertoire_map) do
    game_tmp = Path.join(System.tmp_dir!(), "game_#{System.unique_integer([:positive])}.pgn")
    rep_tmp = Path.join(System.tmp_dir!(), "rep_#{System.unique_integer([:positive])}.json")

    File.write!(game_tmp, game_pgn)
    File.write!(rep_tmp, Jason.encode!(repertoire_map))

    try do
      case System.cmd("python3", [@script_path, "early_exit", game_tmp, rep_tmp]) do
        {json_output, 0} ->
          Jason.decode!(json_output)
        {err, _} ->
          IO.puts("Error en Python: #{err}")
          %{"error" => err}
      end
    after
      File.rm(game_tmp)
      File.rm(rep_tmp)
    end
  end
end
