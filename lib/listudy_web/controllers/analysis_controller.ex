defmodule ListudyWeb.AnalysisController do
  use ListudyWeb, :controller

  alias Listudy.Games
  alias Listudy.Repo

  def index(conn, _params) do
    user_games = Games.list_analyzed_games(conn.assigns.current_user.id)

    render(conn, "index.html", user_games: user_games)
  end

  def sync(conn, %{"analysis" => %{"platform" => platform, "username" => username}}) do
    user = conn.assigns.current_user

    # Sincroniza las partidas en un proceso en segundo plano (fire-and-forget)
    Task.start(fn -> 
      case platform do
        "lichess" -> Games.import_lichess_games(user, username)
        "chess_com" -> Games.import_chess_com_games(user, username)
      end
    end)

    conn
    |> put_flash(:info, "Sincronización iniciada para el usuario #{username} en #{platform}. Refresca la página en unos momentos.")
    |> redirect(to: Routes.analysis_path(conn, :index))
  end
end