defmodule ListudyWeb.PlayerJourneyTest do
  use ListudyWeb.ConnCase

  defp preview(name, html) do
    if directory = System.get_env("LISTUDY_JOURNEY_PREVIEW") do
      File.mkdir_p!(directory)
      File.write!(Path.join(directory, name <> ".html"), html)
    end
  end

  test "home keeps the original links and the last-study shortcut", %{conn: conn} do
    user =
      Listudy.Repo.insert!(%Listudy.Users.User{
        username: "JourneyPlayer",
        email: "journey@example.com"
      })

    study =
      Listudy.Repo.insert!(%Listudy.Studies.Study{
        user_id: user.id,
        title: "My repertoire",
        description: "Journey repertoire",
        slug: "journey-repertoire",
        color: "white",
        private: true
      })

    html =
      conn
      |> Pow.Plug.assign_current_user(user, [])
      |> init_test_session(%{last_study_slug: study.slug, last_study_user_id: user.id})
      |> get("/en")
      |> html_response(200)

    assert html =~ "data-study-continue"
    assert html =~ ~s(data-study-id="journey")
    assert html =~ "My repertoire"
    refute html =~ "home-practice-links"
    assert html =~ "Random Study"
    assert html =~ "Your Studies"
    preview("returning-home", html)

    path = Application.app_dir(:listudy, "priv/static/study_pgn/journey.pgn")
    File.write!(path, "[Event \"My repertoire\"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 *")
    on_exit(fn -> File.rm(path) end)

    study_html =
      build_conn()
      |> Pow.Plug.assign_current_user(user, [])
      |> get("/en/studies/#{study.slug}")
      |> html_response(200)

    preview("study", study_html)
  end

  test "public home keeps study exploration and the daily puzzle", %{conn: conn} do
    html = conn |> get("/es") |> html_response(200)
    refute html =~ "home-practice-links"
    assert html =~ "/es/studies/search"
    assert html =~ "home-daily"
    preview("new-home", html)
  end

  test "endgames offer a direct exercise and a catalogue for progress-aware selection", %{
    conn: conn
  } do
    html = conn |> get("/en/endgames") |> html_response(200)
    assert html =~ "data-endgame-start"
    assert html =~ "basic_queen_1"
    assert html =~ "Start practicing"
    preview("endgames", html)
    chapter = build_conn() |> get("/en/endgames/basic") |> html_response(200)
    assert chapter =~ "data-endgame-start"
    assert chapter =~ "basic_rook_1"
    preview("endgame-chapter", chapter)
  end

  test "new players can import or explore and see import controls first", %{conn: conn} do
    user =
      Listudy.Repo.insert!(%Listudy.Users.User{
        username: "FirstSession",
        email: "first-session@example.com"
      })

    conn = Pow.Plug.assign_current_user(conn, user, [])
    html = conn |> get("/en/studies") |> html_response(200)
    assert html =~ "Your first training session"
    assert html =~ "Find a study to practice"
    preview("empty-library", html)

    form =
      conn
      |> recycle()
      |> Pow.Plug.assign_current_user(user, [])
      |> get("/en/studies/new")
      |> html_response(200)

    {import_position, _} = :binary.match(form, "study-management-import-card")
    {metadata, _} = :binary.match(form, "study-metadata-title")
    assert import_position < metadata
    preview("import", form)
  end
end
