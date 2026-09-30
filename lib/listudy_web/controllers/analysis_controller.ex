defmodule ListudyWeb.AnalysisController do
  use ListudyWeb, :controller

  alias Listudy.Games
  alias Listudy.Games.{GameSync, ImportedGames}
  alias Listudy.Repo
  import Ecto.Query

  def index(conn, params) do
    user = Repo.get!(Listudy.Users.User, conn.assigns.current_user.id)
    filter = if params["filter"] in ~w(last_week last_month), do: params["filter"], else: "all"

    oldest_game_date =
      Repo.aggregate(
        from(g in Listudy.Games.UserGame, where: g.user_id == ^user.id),
        :min,
        :played_at
      )

    oldest_date_str =
      if oldest_game_date,
        do: DateTime.to_date(oldest_game_date) |> to_string(),
        else: "beginning"

    user_games_base = from(g in Listudy.Games.UserGame, where: g.user_id == ^user.id)

    lichess_oldest =
      Repo.aggregate(from(g in user_games_base, where: g.platform == "lichess"), :min, :played_at)

    chesscom_oldest =
      Repo.aggregate(
        from(g in user_games_base, where: g.platform == "chess_com"),
        :min,
        :played_at
      )

    lichess_since =
      if lichess_oldest, do: DateTime.to_date(lichess_oldest) |> to_string(), else: "No data"

    chesscom_since =
      if chesscom_oldest, do: DateTime.to_date(chesscom_oldest) |> to_string(), else: "No data"

    # Account totals stay stable when the repertoire date filter changes.
    lichess_count =
      Repo.aggregate(from(g in user_games_base, where: g.platform == "lichess"), :count, :id)

    chesscom_count =
      Repo.aggregate(from(g in user_games_base, where: g.platform == "chess_com"), :count, :id)

    # Subquery to filter StudyGames by date without hiding empty studies
    filtered_sg =
      if filter == "all" do
        Listudy.Games.StudyGame
      else
        limit_date =
          if filter == "last_week",
            do: DateTime.utc_now() |> DateTime.add(-7, :day),
            else: DateTime.utc_now() |> DateTime.add(-30, :day)

        from sg in Listudy.Games.StudyGame,
          join: ug in Listudy.Games.UserGame,
          on: sg.user_game_id == ug.id,
          where: ug.played_at > ^limit_date
      end

    base_stats =
      Listudy.Studies.Study
      |> where([s], s.user_id == ^user.id)
      |> join(:left, [s], sg in subquery(filtered_sg), on: sg.study_id == s.id)
      |> group_by([s], s.id)
      |> select([s, sg], %{
        study: s,
        total_games: count(sg.id),
        matches:
          type(
            fragment("COALESCE(SUM(CASE WHEN ? = 'match' THEN 1 ELSE 0 END), 0)", sg.status),
            :integer
          ),
        ambiguous:
          type(
            fragment("COALESCE(SUM(CASE WHEN ? = 'ambiguous' THEN 1 ELSE 0 END), 0)", sg.status),
            :integer
          ),
        deviations:
          type(
            fragment("COALESCE(SUM(CASE WHEN ? = 'deviation' THEN 1 ELSE 0 END), 0)", sg.status),
            :integer
          ),
        errors:
          type(
            fragment("COALESCE(SUM(CASE WHEN ? = 'error' THEN 1 ELSE 0 END), 0)", sg.status),
            :integer
          )
      })
      |> Repo.all()

    render(conn, "index.html",
      studies_stats: base_stats,
      lichess_count: lichess_count,
      chesscom_count: chesscom_count,
      filter: filter,
      oldest_date_str: oldest_date_str,
      lichess_since: lichess_since,
      chesscom_since: chesscom_since,
      syncs: GameSync.for_user(user.id)
    )
  end

  def sync_status(conn, _params) do
    syncs = GameSync.for_user(conn.assigns.current_user.id)

    statuses =
      Map.new(~w(lichess chess_com), fn platform ->
        sync = syncs[platform]
        {platform, if(sync, do: %{status: sync.status, details: sync.details}, else: nil)}
      end)

    json(conn, statuses)
  end

  def sync(conn, %{"analysis" => params}) do
    user = Repo.get!(Listudy.Users.User, conn.assigns.current_user.id)
    platform = params["platform"]

    if platform not in ~w(lichess chess_com) do
      conn
      |> put_flash(:error, "Choose Lichess or Chess.com to sync games.")
      |> redirect(to: Routes.analysis_path(conn, :index))
    else
      username =
        params["username"] ||
          case platform do
            "lichess" -> user.lichess_username
            "chess_com" -> user.chess_com_username
          end

      if is_nil(username) or String.trim(username) == "" do
        conn
        |> put_flash(:error, "Enter a username before syncing.")
        |> redirect(to: Routes.analysis_path(conn, :index))
      else
        user_field = if platform == "lichess", do: :lichess_username, else: :chess_com_username

        conn =
          if Map.get(user, user_field) != username do
            updated_user =
              user
              |> Ecto.Changeset.change([{user_field, username}])
              |> Repo.update!()

            Pow.Plug.create(conn, updated_user)
          else
            conn
          end

        case GameSync.start(user.id, platform) do
          :already_running ->
            conn
            |> put_flash(:info, "Sync is already running. Its progress is shown below.")
            |> redirect(to: Routes.analysis_path(conn, :index))

          :started ->
            Task.start(fn ->
              heartbeat = spawn_link(fn -> sync_heartbeat(user.id, platform) end)

              try do
                outcome =
                  try do
                    case import_platform(user, platform, username) do
                      {:ok, {imported, _}} ->
                        progress =
                          if imported == 0,
                            do: "No new games found. Checking saved analyses...",
                            else: "Found #{imported} new games. Comparing with repertoire..."

                        GameSync.progress(user.id, platform, progress)

                        case Games.Analyzer.analyze_all_user_studies(user.id, platform) do
                          {:ok, analyzed} -> {:ok, sync_result(imported, analyzed)}
                          {:error, reason} -> {:error, inspect(reason)}
                        end

                      {:error, reason} ->
                        {:error, inspect(reason)}
                    end
                  rescue
                    error -> {:error, Exception.message(error)}
                  catch
                    kind, reason -> {:error, "#{kind}: #{inspect(reason)}"}
                  end

                case outcome do
                  {:ok, details} -> GameSync.finish(user.id, platform, "completed", details)
                  {:error, reason} -> GameSync.finish(user.id, platform, "failed", reason)
                end
              after
                send(heartbeat, :stop)
              end
            end)

            redirect(conn, to: Routes.analysis_path(conn, :index))
        end
      end
    end
  end

  defp sync_result(0, 0), do: "No new games found in the checked period."
  defp sync_result(0, analyzed), do: "No new games. Reanalyzed #{analyzed} saved games."

  defp sync_result(imported, analyzed),
    do: "#{imported} new games imported. #{analyzed} games analyzed."

  defp sync_heartbeat(user_id, platform) do
    receive do
      :stop -> :ok
    after
      60_000 ->
        GameSync.touch(user_id, platform)
        sync_heartbeat(user_id, platform)
    end
  end

  defp import_platform(user, "lichess", username), do: Games.import_lichess_games(user, username)

  defp import_platform(user, "chess_com", username),
    do: Games.import_chess_com_games(user, username)

  def disconnect(conn, %{"platform" => platform}) do
    user = Repo.get!(Listudy.Users.User, conn.assigns.current_user.id)
    user_field = if platform == "lichess", do: :lichess_username, else: :chess_com_username

    import Ecto.Query

    # 1. Borramos todo el historial de juegos
    Repo.delete_all(
      from g in Listudy.Games.UserGame,
        where: g.user_id == ^user.id and g.platform == ^platform
    )

    # 2. Actualizamos la base de datos
    Repo.update_all(
      from(u in Listudy.Users.User, where: u.id == ^user.id),
      set: [{user_field, nil}]
    )

    # 3. OBLIGATORIO: Buscamos el usuario actualizado y refrescamos la sesión
    updated_user = Repo.get!(Listudy.Users.User, user.id)

    conn
    # Actualiza la caché de Pow con los nuevos datos
    |> Pow.Plug.create(updated_user)
    |> put_flash(
      :info,
      "Successfully disconnected the #{platform} account and deleted its games."
    )
    |> redirect(to: Routes.analysis_path(conn, :index))
  end

  def train(conn, %{"id" => study_id} = params) do
    filter = Map.get(params, "filter", "all")

    # 1. Buscamos el estudio para poder mostrar el título en la pantalla
    study =
      Repo.get_by!(Listudy.Studies.Study, id: study_id, user_id: conn.assigns.current_user.id)

    # 2. Obtenemos la lista de errores agrupados, filtrados y ordenados
    mistakes = Games.get_unique_mistakes_to_train(study_id, conn.assigns.current_user.id, filter)

    # Asumiendo que pasas los mistakes a JSON como @mistakes_json
    mistakes_json = Jason.encode!(mistakes)

    # 3. Renderizamos la nueva plantilla y le pasamos los datos
    render(conn, "train.html",
      study: study,
      mistakes_json: mistakes_json,
      filter: filter
    )
  end

  def games(conn, params) do
    library = ImportedGames.list_recent(conn.assigns.current_user.id, params)
    render(conn, "games.html", library: library)
  end

  def game(conn, %{"id" => id} = params) do
    redirect(conn,
      to:
        Routes.analysis_path(
          conn,
          :compare_game,
          id,
          Map.take(params, ["platform", "period", "study_id", "status", "cursor", "direction"])
        )
    )
  end

  def compare_game(conn, %{"id" => id} = params) do
    user_id = conn.assigns.current_user.id
    game = ImportedGames.get_owned!(user_id, id)
    summaries = ImportedGames.summaries(user_id, [game.id]) |> Map.get(game.id, [])

    list_params =
      Map.take(params, ["platform", "period", "study_id", "status", "cursor", "direction"])

    back_path = Routes.analysis_path(conn, :games, list_params)
    selection = %{"study_id" => params["compare_study_id"]}

    case Games.Analyzer.analyze_single_pgn(user_id, game.pgn, selection) do
      {:ok, study, result} ->
        render(conn, "quick_result.html",
          choices: [{study, result}],
          pgn_text: game.pgn,
          back_path: back_path,
          imported_game: game,
          summaries: summaries,
          compare_all_path: Routes.analysis_path(conn, :compare_game, game.id, list_params)
        )

      {:ambiguous, choices} ->
        render(conn, "quick_result.html",
          choices: choices,
          pgn_text: game.pgn,
          back_path: back_path,
          imported_game: game,
          summaries: summaries,
          compare_all_path: Routes.analysis_path(conn, :compare_game, game.id, list_params)
        )

      {:error, reason} ->
        render(conn, "game_comparison_unavailable.html",
          game: game,
          summaries: summaries,
          reason: reason,
          back_path: back_path,
          compare_all_path: Routes.analysis_path(conn, :compare_game, game.id, list_params),
          selected_study: params["compare_study_id"]
        )
    end
  end

  def quick_analyze(conn, %{"pgn" => pgn_text} = params) do
    user = conn.assigns.current_user

    case Listudy.Games.Analyzer.analyze_single_pgn(user.id, pgn_text, params) do
      {:ok, study, result} ->
        render(conn, "quick_result.html", choices: [{study, result}], pgn_text: pgn_text)

      {:ambiguous, choices} ->
        render(conn, "quick_result.html", choices: choices, pgn_text: pgn_text)

      {:error, :no_match} ->
        conn
        |> put_flash(:info, "No matching chapter found for this game in your repertoire.")
        |> redirect(to: Routes.analysis_path(conn, :index))

      {:error, reason} ->
        conn
        |> put_flash(:error, "Analysis could not be completed: #{reason}")
        |> redirect(to: Routes.analysis_path(conn, :index))
    end
  end
end
