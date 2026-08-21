defmodule ListudyWeb.AnalysisController do
  use ListudyWeb, :controller

  alias Listudy.Games
  alias Listudy.Repo
  import Ecto.Query

  def index(conn, params) do
    user = Repo.get!(Listudy.Users.User, conn.assigns.current_user.id)
    filter = Map.get(params, "filter", "all")
    oldest_game_date = Repo.aggregate(from(g in Listudy.Games.UserGame, where: g.user_id == ^user.id), :min, :played_at)
    oldest_date_str = if oldest_game_date, do: DateTime.to_date(oldest_game_date) |> to_string(), else: "beginning"
    
    user_games_base = from(g in Listudy.Games.UserGame, where: g.user_id == ^user.id)

    lichess_oldest = Repo.aggregate(from(g in user_games_base, where: g.platform == "lichess"), :min, :played_at)
    chesscom_oldest = Repo.aggregate(from(g in user_games_base, where: g.platform == "chess_com"), :min, :played_at)

    lichess_since = if lichess_oldest, do: DateTime.to_date(lichess_oldest) |> to_string(), else: "No data"
    chesscom_since = if chesscom_oldest, do: DateTime.to_date(chesscom_oldest) |> to_string(), else: "No data"

    # Filter for global game counts (Optional, but keeps the header accurate)
    games_query = from(g in Listudy.Games.UserGame, where: g.user_id == ^user.id)
    games_query =
      case filter do
        "last_week" ->
          limit = DateTime.utc_now() |> DateTime.add(-7, :day)
          where(games_query, [g], g.played_at > ^limit)
        "last_month" ->
          limit = DateTime.utc_now() |> DateTime.add(-30, :day)
          where(games_query, [g], g.played_at > ^limit)
        _ -> games_query
      end

    lichess_count = Repo.aggregate(from(g in games_query, where: g.platform == "lichess"), :count, :id)
    chesscom_count = Repo.aggregate(from(g in games_query, where: g.platform == "chess_com"), :count, :id)

    # We still fetch all analyzed games to keep your current logic intact
    user_games = Games.list_analyzed_games(user.id)

    # Subquery to filter StudyGames by date without hiding empty studies
    filtered_sg =
      if filter == "all" do
        Listudy.Games.StudyGame
      else
        limit_date = if filter == "last_week", do: DateTime.utc_now() |> DateTime.add(-7, :day), else: DateTime.utc_now() |> DateTime.add(-30, :day)
        from sg in Listudy.Games.StudyGame,
          join: ug in Listudy.Games.UserGame, on: sg.user_game_id == ug.id,
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
        matches: type(fragment("COALESCE(SUM(CASE WHEN ? = 'match' THEN 1 ELSE 0 END), 0)", sg.status), :integer),
        deviations: type(fragment("COALESCE(SUM(CASE WHEN ? = 'deviation' THEN 1 ELSE 0 END), 0)", sg.status), :integer)
      })
      |> Repo.all()

    raw_depths_query =
      Listudy.Games.StudyGame
      |> join(:inner, [sg], s in Listudy.Studies.Study, on: sg.study_id == s.id)
      |> where([sg, s], s.user_id == ^user.id and sg.status == "match")

    raw_depths_query =
      if filter == "all" do
        raw_depths_query
      else
        limit_date = if filter == "last_week", do: DateTime.utc_now() |> DateTime.add(-7, :day), else: DateTime.utc_now() |> DateTime.add(-30, :day)
        raw_depths_query
        |> join(:inner, [sg, s], ug in Listudy.Games.UserGame, on: sg.user_game_id == ug.id)
        |> where([sg, s, ug], ug.played_at > ^limit_date)
      end

    raw_depths =
      raw_depths_query
      |> group_by([sg], [sg.study_id, sg.depth])
      |> select([sg], %{study_id: sg.study_id, depth: sg.depth, count: count(sg.id)})
      |> Repo.all()

    depth_stats =
      raw_depths
      |> Enum.map(fn row ->
        %{study_id: row.study_id, move: div(row.depth + 1, 2), count: row.count}
      end)
      |> Enum.group_by(& &1.study_id)

    render(conn, "index.html",
      # Asegúrate de pasar todas tus variables originales aquí
      studies_stats: base_stats, # o el nombre que uses en tu render original
      depth_stats: depth_stats,
      lichess_count: lichess_count,
      chesscom_count: chesscom_count,
      filter: filter,
      oldest_date_str: oldest_date_str,
      lichess_since: lichess_since,
      chesscom_since: chesscom_since
    )
  end

  def sync(conn, %{"analysis" => params}) do
    user = Repo.get!(Listudy.Users.User, conn.assigns.current_user.id)
    platform = params["platform"]

    username = params["username"] || case platform do
      "lichess" -> Map.get(user, :lichess_username)
      "chess_com" -> Map.get(user, :chess_com_username)
    end

    user_field = if platform == "lichess", do: :lichess_username, else: :chess_com_username
    
    # 1. Reasignamos el 'conn' para inyectarle la sesión actualizada si hay cambios
    conn = 
      if username != "" and Map.get(user, user_field) != username do
        updated_user = 
          user
          |> Ecto.Changeset.change([{user_field, username}])
          |> Repo.update!()
          
        # 2. Esta es la magia: refresca la sesión instantáneamente
        Pow.Plug.create(conn, updated_user)
      else
        conn
      end

    Task.start(fn ->
      result =
        case platform do
          "lichess" -> Games.import_lichess_games(user, username)
          "chess_com" -> Games.import_chess_com_games(user, username)
        end

      case result do
        {:ok, _} ->
          Listudy.Games.Analyzer.analyze_all_user_studies(user.id, platform)
        _ -> :ok
      end
    end)

    conn
    |> put_flash(:info, "Syncing #{platform} games in the background. Refresh the page in a minute.")
    |> redirect(to: Routes.analysis_path(conn, :index))
  end

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
    |> Pow.Plug.create(updated_user) # Actualiza la caché de Pow con los nuevos datos
    |> put_flash(:info, "Successfully disconnected the #{platform} account and deleted its games.")
    |> redirect(to: Routes.analysis_path(conn, :index))
  end

  def train(conn, %{"id" => study_id} = params) do
    filter = Map.get(params, "filter", "all")

    # 1. Buscamos el estudio para poder mostrar el título en la pantalla
    study = Listudy.Repo.get!(Listudy.Studies.Study, study_id)

    # 2. Obtenemos la lista de errores agrupados, filtrados y ordenados
    mistakes = Listudy.Games.get_unique_mistakes_to_train(study_id, filter)

    # Asumiendo que pasas los mistakes a JSON como @mistakes_json
    mistakes_json = Jason.encode!(mistakes)

    # 3. Renderizamos la nueva plantilla y le pasamos los datos
    render(conn, "train.html",
      study: study,
      mistakes_json: mistakes_json,
      filter: filter
    )
  end

  def quick_analyze(conn, %{"pgn" => pgn_text}) do
    user = conn.assigns.current_user
    locale = conn.assigns[:locale] || "en"

    case Listudy.Games.Analyzer.analyze_single_pgn(user.id, pgn_text) do
      {:ok, study, %{"deviation" => true, "expected" => expected, "played" => played, "fen" => fen, "chapter" => chapter}} ->
        turn_char = Enum.at(String.split(fen, " "), 1)
        deviator_color = if turn_char == "w", do: "white", else: "black"

        render(conn, "quick_result.html",
          study: study,
          pgn_text: pgn_text,
          error_fen: fen,
          expected_moves: Enum.join(expected, ","),
          played_move: played,
          deviator_color: deviator_color,
          chapter_name: chapter
        )

      {:ok, study, %{"deviation" => false}} ->
        conn
        |> put_flash(:info, "Game followed '#{study.title}' perfectly until the end of the book.")
        |> redirect(to: Routes.study_path(conn, :show, locale, study.slug))

      {:error, :no_match} ->
        conn
        |> put_flash(:info, "No matching study found for this game in your repertoire.")
        |> redirect(to: Routes.analysis_path(conn, :index))
    end
  end
end
