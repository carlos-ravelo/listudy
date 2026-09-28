defmodule Listudy.Games.Analyzer do
  @moduledoc """
  Load owned studies, rank chapter matches, and persist imported-game outcomes.
  Chess parsing, position identity, and repertoire caching live in priv/python.
  """
  import Ecto.Query
  require Logger
  alias Listudy.Repo
  alias Listudy.Games.{ChessEngine, Deviation, StudyGame, TrainingDeviations, UserGame}

  def analyze_single_pgn(user_id, pgn, selection \\ %{}) do
    with {:ok, studies} <- load_studies(user_id, selection["study_id"]),
         :ok <- if(studies == [], do: {:error, :no_match}, else: :ok),
         {:ok, %{"games" => [game]}} <-
           ChessEngine.analyze_batch(payload(studies), [%{id: 0, pgn: pgn}]),
         {:ok, candidates} <- candidates(game, studies) do
      candidates =
        Enum.filter(candidates, fn {study, result} ->
          (is_nil(selection["study_id"]) or to_string(study.id) == selection["study_id"]) and
            (is_nil(selection["chapter_index"]) or
               to_string(result["chapter_index"]) == selection["chapter_index"])
        end)

      case best_candidates(candidates) do
        [] -> {:error, :no_match}
        [{study, result}] -> {:ok, study, result}
        choices -> {:ambiguous, choices}
      end
    end
  end

  defp candidates(%{"error" => reason}, _studies), do: {:error, reason}

  defp candidates(game, studies) do
    by_id = Map.new(studies, fn item -> {to_string(item.study.id), item.study} end)

    if map_size(game["study_errors"] || %{}) > 0 do
      # Do not silently choose a study when part of the repertoire failed to load.
      {:error, "One or more studies contain invalid PGN. Correct those studies and try again."}
    else
      matches =
        Enum.flat_map(game["matches"], fn match ->
          Enum.map(match["candidates"], &{Map.fetch!(by_id, match["study_id"]), &1})
        end)

      {:ok, matches}
    end
  end

  defp best_candidates([]), do: []

  defp best_candidates(candidates) do
    score = candidates |> Enum.map(fn {_, result} -> result["score"] end) |> Enum.max()
    Enum.filter(candidates, fn {_, result} -> result["score"] == score end)
  end

  def analyze_all_user_studies(user_id, platform) do
    case load_studies(user_id) do
      {:ok, studies} ->
        analyze_imported_games(studies, user_id, platform)

      {:error, reason} ->
        Logger.error(reason)
        {:error, reason}
    end
  end

  defp analyze_imported_games(studies, user_id, platform) do
    user = Repo.get!(Listudy.Users.User, user_id)
    # Existing results are reusable only for this PGN content and matcher version.
    saved =
      Repo.all(
        from sg in StudyGame,
          join: g in UserGame,
          on: g.id == sg.user_game_id,
          where: g.user_id == ^user_id and g.platform == ^platform,
          select: {sg.user_game_id, sg.study_id, sg.analysis_version, sg.status}
      )

    versions =
      Map.new(saved, fn {game_id, study_id, version, status} ->
        {{game_id, study_id}, if(status == "error", do: nil, else: version)}
      end)

    # Read only identifiers and player names until a game actually needs work.
    games =
      Repo.all(
        from g in UserGame,
          where: g.user_id == ^user_id and g.platform == ^platform,
          select: %{id: g.id, white_player: g.white_player, black_player: g.black_player}
      )

    games
    |> Enum.map(fn game ->
      pending =
        Enum.filter(studies, fn item ->
          user_color(game, user) == item.study.color and
            Map.get(versions, {game.id, item.study.id}) != item.version
        end)

      {game, pending}
    end)
    |> Enum.reject(fn {_, pending} -> pending == [] end)
    |> Enum.chunk_every(50)
    |> Enum.reduce_while({:ok, 0}, fn batch, {:ok, processed} ->
      needed =
        batch |> Enum.flat_map(fn {_, pending} -> pending end) |> Enum.uniq_by(& &1.study.id)

      ids = Enum.map(batch, fn {game, _} -> game.id end)
      pgns = Repo.all(from g in UserGame, where: g.id in ^ids, select: {g.id, g.pgn}) |> Map.new()

      requests =
        Enum.map(batch, fn {game, pending} ->
          %{
            id: game.id,
            pgn: Map.fetch!(pgns, game.id),
            study_ids: Enum.map(pending, & &1.study.id)
          }
        end)

      case ChessEngine.analyze_batch(payload(needed), requests) do
        {:ok, %{"games" => results}} when length(results) == length(batch) ->
          Enum.zip(batch, results)
          |> Enum.each(fn {{game, pending}, result} ->
            Enum.each(pending, &persist_result(game, &1, result))
          end)

          {:cont, {:ok, processed + length(batch)}}

        {:ok, _} ->
          {:halt, {:error, "The chess parser returned an incomplete batch."}}

        {:error, reason} ->
          Logger.error("Game analysis failed: #{inspect(reason)}")
          {:halt, {:error, reason}}
      end
    end)
  end

  defp persist_result(game, item, batch_result) do
    match =
      Enum.find(batch_result["matches"] || [], &(&1["study_id"] == to_string(item.study.id)))

    error =
      batch_result["error"] || get_in(batch_result, ["study_errors", to_string(item.study.id)])

    candidates = if match, do: Enum.map(match["candidates"], &{item.study, &1}), else: []
    best = best_candidates(candidates)

    outcomes =
      Enum.map(best, fn {_, result} ->
        TrainingDeviations.outcome(result, item.study.color)
      end)
      |> Enum.uniq()

    result =
      case best do
        [{_, first} | _] -> first
        _ -> nil
      end

    training_events = TrainingDeviations.events(result, item.study.color)

    status =
      cond do
        error -> "error"
        result == nil -> "out_of_scope"
        length(outcomes) > 1 -> "ambiguous"
        training_events != [] -> "deviation"
        true -> "match"
      end

    Repo.transaction(fn ->
      Repo.delete_all(
        from d in Deviation, where: d.user_game_id == ^game.id and d.study_id == ^item.study.id
      )

      if status == "deviation" do
        Enum.each(training_events, fn event ->
          %Deviation{}
          |> Deviation.changeset(%{
            user_game_id: game.id,
            study_id: item.study.id,
            ply_number: event.ply + 1,
            position_fen: event.fen,
            expected_move: Enum.join(event.expected, " / "),
            played_move: event.played
          })
          |> Repo.insert!()
        end)
      end

      # Depth is the number of half-moves reached in the uploaded game.
      attrs = %{
        user_game_id: game.id,
        study_id: item.study.id,
        status: status,
        depth: if(result, do: result["ply"], else: 0),
        analysis_version: item.version
      }

      %StudyGame{}
      |> StudyGame.changeset(attrs)
      |> Repo.insert!(
        on_conflict: [set: [status: status, depth: attrs.depth, analysis_version: item.version]],
        conflict_target: [:study_id, :user_game_id]
      )
    end)
  end

  defp user_color(game, user) do
    names =
      [user.lichess_username, user.chess_com_username]
      |> Enum.reject(&is_nil/1)
      |> Enum.map(&String.downcase/1)

    cond do
      String.downcase(game.white_player || "") in names -> "white"
      String.downcase(game.black_player || "") in names -> "black"
      true -> nil
    end
  end

  defp payload(studies), do: Enum.map(studies, &%{id: &1.study.id, pgn: &1.pgn})

  defp load_studies(user_id, selected_study_id \\ nil) do
    query = from s in Listudy.Studies.Study, where: s.user_id == ^user_id

    query =
      if selected_study_id do
        id =
          case Integer.parse(selected_study_id) do
            {value, ""} when value > 0 -> value
            _ -> -1
          end

        where(query, [s], s.id == ^id)
      else
        query
      end

    Repo.all(query)
    |> Enum.reduce_while({:ok, []}, fn study, {:ok, studies} ->
      [id | _] = String.split(study.slug, "-")
      path = Application.app_dir(:listudy, "priv/static/study_pgn/#{id}.pgn")

      case File.read(path) do
        {:ok, pgn} ->
          {:cont,
           {:ok, studies ++ [%{study: study, pgn: pgn, version: ChessEngine.fingerprint(pgn)}]}}

        {:error, reason} ->
          Logger.error("Could not read study #{study.id}: #{inspect(reason)}")
          {:halt, {:error, "The PGN file for study #{study.title} could not be read."}}
      end
    end)
  end
end
