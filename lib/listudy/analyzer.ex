defmodule Listudy.Games.Analyzer do
  @moduledoc """
  Optimized Chessbook-style engine to compare user games against
  the study repertoire, avoiding unnecessary re-analysis.
  """

  require Logger
  alias Listudy.Repo
  import Ecto.Query
  alias Listudy.Games.Deviation
  alias Listudy.Games.StudyGame
  alias Listudy.Games.ChessEngine

  def analyze_all_user_studies(user_id, platform) do
    studies = Repo.all(from s in Listudy.Studies.Study, where: s.user_id == ^user_id)
    user_record = Repo.get!(Listudy.Users.User, user_id)

    Enum.each(studies, fn study ->
      raw_pgn = get_study_pgn_content(study)

      if is_nil(raw_pgn) do
        Logger.error("Could not load physical PGN for study #{study.slug}")
      else
        case ChessEngine.parse_repertoire_to_map(raw_pgn) do
          %{"repertoire_map" => study_map, "signature_prefix" => signature_prefix} ->
            unprocessed_games =
              Listudy.Games.UserGame
              |> where([g], g.user_id == ^user_id and g.platform == ^platform)
              |> where([g], like(g.pgn, ^"%#{signature_prefix}%"))
              |> join(:left, [g], sg in Listudy.Games.StudyGame, on: sg.user_game_id == g.id and sg.study_id == ^study.id)
              |> where([g, sg], is_nil(sg.id))
              |> Repo.all()
              |> Enum.filter(fn game ->
                user_color(game, user_record) == study.color
              end)

            if unprocessed_games == [] do
              Logger.info("✅ No new games to analyze for study: #{study.title}")
            else
              Logger.info("🚀 Analyzing #{length(unprocessed_games)} new games for: #{study.title}")
              analyze_games_in_parallel(unprocessed_games, study, study_map)
            end

          %{} ->
            Logger.error("Python parsing failed for study #{study.slug}")
        end
      end
    end)
  end

  def analyze_games_in_parallel(user_games, study, study_map) do
    results =
      user_games
      |> Task.async_stream(
        fn game -> process_game(game, study_map, study) end,
        max_concurrency: System.schedulers_online(),
        timeout: :infinity
      )
      |> Enum.reduce(%{deviations: 0, matches: 0, errors: 0, skipped: 0}, fn
        {:ok, {:deviation, _}}, acc -> %{acc | deviations: acc.deviations + 1}
        {:ok, :no_deviation}, acc -> %{acc | matches: acc.matches + 1}
        {:ok, :skipped}, acc -> %{acc | skipped: acc.skipped + 1}
        {:ok, {:error, _}}, acc -> %{acc | errors: acc.errors + 1}
      end)

    Logger.info("🎯 Análisis optimizado para #{study.title}: #{inspect(results)}")
    results
  end

  defp process_game(user_game, study_map, study) do
    study_id = study.id

    Repo.delete_all(from d in Deviation, where: d.user_game_id == ^user_game.id and d.study_id == ^study_id)

    case ChessEngine.find_first_deviation(user_game.pgn, study_map) do
      %{"deviation" => true, "fen" => fen, "expected" => expected_moves, "played" => played} ->
        active_color = if String.contains?(fen, " w "), do: "white", else: "black"
        ply = get_ply_from_fen(fen)

        cond do
          # 1. Tú jugaste otra apertura intencionalmente en tu primer movimiento (ply 1 para blancas, 2 para negras).
          active_color == study.color and ply <= 2 ->
            insert_study_game(user_game.id, study_id, "out_of_scope", ply)
            :no_deviation

          # 2. Desviación real: Tú te equivocaste dentro de la teoría.
          active_color == study.color ->
            expected_str = Enum.join(expected_moves, " / ")
            insert_deviation(user_game.id, study_id, ply, fen, expected_str, played)
            insert_study_game(user_game.id, study_id, "deviation", ply)
            {:deviation, user_game.id}

          # 3. Match: El rival se desvió (incluso si fue en su primera jugada). Tú hiciste tu parte.
          true ->
            insert_study_game(user_game.id, study_id, "match", ply)
            :no_deviation
        end

      %{"deviation" => false, "fen" => fen} ->
        # Llegaron al final de la línea del PGN sin desviarse.
        ply = get_ply_from_fen(fen)
        insert_study_game(user_game.id, study_id, "match", ply)
        :no_deviation

      %{"error" => reason} ->
        insert_study_game(user_game.id, study_id, "error", 0)
        {:error, reason}
    end
  end

  # Calculates the exact ply number based on the FEN string
  defp get_ply_from_fen(fen) do
    parts = String.split(fen, " ")
    turn = Enum.at(parts, 1)
    fullmove = Enum.at(parts, 5) |> String.to_integer()

    if turn == "w" do
      (fullmove * 2) - 1
    else
      fullmove * 2
    end
  end

  # Determines which color the account owner played in a specific game
  defp user_color(game, user) do
    cond do
      game.white_player == user.lichess_username or game.white_player == user.chess_com_username -> "white"
      game.black_player == user.lichess_username or game.black_player == user.chess_com_username -> "black"
      true -> "white" # Fallback
    end
  end

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

  defp insert_study_game(game_id, study_id, status, depth) do
    %StudyGame{}
    |> StudyGame.changeset(%{
      user_game_id: game_id,
      study_id: study_id,
      status: status,
      depth: depth
    })
    |> Repo.insert(
      on_conflict: [set: [status: status, depth: depth]],
      conflict_target: [:study_id, :user_game_id]
    )
  end

  defp get_study_pgn_content(study) do
    [unique_id | _] = String.split(study.slug, "-")
    file_path = "priv/static/study_pgn/#{unique_id}.pgn"

    case File.read(file_path) do
      {:ok, content} -> content
      {:error, _reason} -> nil
    end
  end

def analyze_single_pgn(user_id, game_pgn_text) do
    studies = Repo.all(from s in Listudy.Studies.Study, where: s.user_id == ^user_id)

    matches =
      studies
      |> Task.async_stream(fn study ->
        # Assume get_study_pgn_content/1 already exists in your file
        raw_pgn = get_study_pgn_content(study)

        if raw_pgn do
          case ChessEngine.parse_repertoire_to_map(raw_pgn) do
            %{"repertoire_map" => study_map} ->
              case ChessEngine.find_first_deviation(game_pgn_text, study_map) do
                %{"deviation" => true} = data ->
                  # Discard studies where the game deviated on the very first move (ply 0).
                  if Map.get(data, "ply", 0) == 0 do
                    nil
                  else
                    {:ok, study, data}
                  end

                %{"deviation" => false, "fen" => fen} = data ->
                  # If FEN is the starting position, it never entered the theory
                  if String.starts_with?(fen, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR") do
                    nil
                  else
                    # Partial match, theory ended without deviation
                    {:ok, study, data}
                  end

                _ ->
                  nil
              end

            %{} ->
              nil
          end
        else
          nil
        end
      end, timeout: :timer.seconds(30)) # Added timeout to prevent process crashing
      |> Enum.map(fn {:ok, result} -> result end) # Unwrap the Task result
      |> Enum.reject(&is_nil/1)

    # Tie-breaker: If multiple studies match, pick the one that went deepest into the game
    case matches do
      [] ->
        {:error, :no_match}

      list ->
        Enum.max_by(list, fn {:ok, _study, data} ->
          Map.get(data, "ply", 0)
        end)
    end
  end

end
