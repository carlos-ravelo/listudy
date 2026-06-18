defmodule Listudy.Games.Analyzer do
  @moduledoc """
  Engine to compare user games against a study repertoire.
  """

  require Logger
  alias Listudy.Repo
  alias Listudy.Games.Deviation
  alias Listudy.Games.ChessEngine

  @doc """
  Analyzes a list of UserGame records against a study JSON map.
  Processes the games in parallel to maximize CPU usage.
  """
  def analyze_games_in_parallel(user_games, study) do
    # Ensure study JSON is an Elixir Map. 
    # e.g., %{"rnbqkbnr/... w KQkq - 0 1" => "e4"}
    study_map = parse_json_if_needed(study.repertoire_json)

    user_games
    |> Task.async_stream(
      fn game -> process_game(game, study_map, study.id) end,
      max_concurrency: System.schedulers_online(),
      timeout: :infinity
    )
    # Consume the stream to execute it
    |> Enum.reduce(%{deviations: 0, matches: 0, errors: 0}, fn
      {:ok, {:deviation, _}}, acc -> %{acc | deviations: acc.deviations + 1}
      {:ok, :no_deviation}, acc -> %{acc | matches: acc.matches + 1}
      {:ok, {:error, _}}, acc -> %{acc | errors: acc.errors + 1}
    end)
  end

  defp process_game(user_game, study_map, study_id) do
    with {:ok, sequence} <- ChessEngine.parse_pgn_to_fens(user_game.pgn) do
      case find_deviation(sequence, study_map, 1) do
        {:deviation, ply, fen, expected, played} ->
          insert_deviation(user_game.id, study_id, ply, fen, expected, played)
          {:deviation, user_game.id}

        :no_deviation ->
          :no_deviation
      end
    else
      {:error, reason} ->
        Logger.error("PGN parsing failed for game #{user_game.id}: #{inspect(reason)}")
        {:error, reason}
    end
  end

  # Recursively iterates through the game ply-by-ply
  defp find_deviation([{fen, played_move} | rest], study_map, ply) do
    case Map.fetch(study_map, fen) do
      {:ok, expected_move} ->
        if played_move == expected_move do
          # Matches study, continue checking the next moves
          find_deviation(rest, study_map, ply + 1)
        else
          # Deviation found! Stop processing this game.
          {:deviation, ply, fen, expected_move, played_move}
        end

      :error ->
        # The FEN is not in the study. This means the game left the study 
        # repertoire. Assuming this means they successfully played their prep.
        :no_deviation
    end
  end

  defp find_deviation([], _study_map, _ply), do: :no_deviation

  defp insert_deviation(game_id, study_id, ply, fen, expected, played) do
    %Deviation{}
    |> Deviation.changeset(%{
      user_game_id: game_id,
      study_id: study_id,
      ply_number: ply,
      position_fen: fen,
      expected_move: expected,
      played_move: played
    })
    |> Repo.insert()
  end

  defp parse_json_if_needed(json) when is_binary(json), do: Jason.decode!(json)
  defp parse_json_if_needed(map) when is_map(map), do: map
end