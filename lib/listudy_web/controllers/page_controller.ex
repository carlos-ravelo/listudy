defmodule ListudyWeb.PageController do
  use ListudyWeb, :controller
  alias Listudy.Books

  @languages Application.compile_env(:listudy, [:languages, :translations])
  @pages [
    "privacy",
    "terms-of-service",
    "imprint",
    "copyright",
    "credits",
    "achievements",
    "icons",
    "thanks",
    "changelog"
  ]
  @features ["blind-tactics", "dogestudy", "pieceless-tactics"]

  def index(conn, %{"locale" => locale}) do
    case locale in @languages do
      true ->
        tactic = ListudyWeb.TacticController.daily_tactic()
        user = Pow.Plug.current_user(conn)
        user_id = if user, do: user.id, else: nil
        last_slug = get_session(conn, :last_study_slug)
        last_user_id = get_session(conn, :last_study_user_id)

        last_study =
          if last_slug && last_user_id == user_id do
            Listudy.Studies.get_study_by_slug!(last_slug)
          end

        last_study =
          if last_study && (!last_study.private || last_study.user_id == user_id),
            do: last_study,
            else: nil

        daily_studies = Listudy.StudyLibrary.daily_studies(user_id)

        most_used = Listudy.StudyLibrary.most_used(user_id, daily_studies)

        daily_studies =
          Enum.sort_by(daily_studies, fn study ->
            cond do
              last_study && study.id == last_study.id -> 0
              study.id == most_used -> 1
              true -> 2
            end
          end)

        render(conn, "index.html",
          tactic: tactic,
          last_study: last_study,
          most_used: most_used,
          daily_studies: daily_studies
        )

      _ ->
        conn
        |> put_flash(:info, gettext("This page does not exist"))
        |> redirect(to: Routes.page_path(conn, :index, conn.assigns.locale))
    end
  end

  def domain(conn, _params) do
    redirect(conn, to: "/" <> conn.assigns.locale)
  end

  def show(conn, %{"page" => page}) do
    renderer(conn, @pages, page)
  end

  def admin_index(conn, %{"username" => username, "account_action" => action})
      when action in ["email", "password"] do
    username = String.trim(username)

    if Listudy.Users.get_user_by_name!(username) do
      action = if action == "email", do: :email, else: :password
      redirect(conn, to: Routes.user_administration_path(conn, action, username))
    else
      conn |> put_flash(:error, gettext("User not found")) |> render("admin_index.html")
    end
  end

  def admin_index(conn, _) do
    render(conn, "admin_index.html")
  end

  def features(conn, %{"page" => page}) do
    renderer(conn, @features, page)
  end

  def play_stockfish(conn, _params) do
    book = Books.random_book()
    render(conn, "play_stockfish.html", book: book)
  end

  defp renderer(conn, pages, page) do
    case Enum.member?(pages, page) do
      true ->
        render(conn, page <> ".html")

      false ->
        conn
        |> put_flash(:info, gettext("This page does not exist"))
        |> redirect(to: Routes.page_path(conn, :index, conn.assigns.locale))
    end
  end
end
