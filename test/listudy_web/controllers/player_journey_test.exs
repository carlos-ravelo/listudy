defmodule ListudyWeb.PlayerJourneyTest do
  use ListudyWeb.ConnCase

  defp preview(name, html) do
    if directory = System.get_env("LISTUDY_JOURNEY_PREVIEW") do
      File.mkdir_p!(directory)
      File.write!(Path.join(directory, name <> ".html"), html)
    end
  end

  test "home keeps the last-study shortcut without duplicate study links", %{conn: conn} do
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
    refute html =~ "home-study-links"
    refute html =~ "Random Study"
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

  test "home uses daily organization, deduplicates saved studies and protects private sources", %{
    conn: conn
  } do
    user =
      Listudy.Repo.insert!(%Listudy.Users.User{
        username: "DailyHome",
        email: "daily-home@example.com"
      })

    other =
      Listudy.Repo.insert!(%Listudy.Users.User{
        username: "DailyAuthor",
        email: "daily-author@example.com"
      })

    studies =
      for index <- 1..9 do
        Listudy.Repo.insert!(%Listudy.Studies.Study{
          user_id: user.id,
          title: "Daily repertoire #{index}",
          slug: "daily#{index}-home",
          color: if(rem(index, 2) == 0, do: "black", else: "white"),
          private: true
        })
      end

    reference = List.last(studies)

    {:ok, _} =
      Listudy.StudyLibrary.update(user.id, %{
        "action" => "move",
        "study_ids" => [reference.id],
        "location" => "library"
      })

    public =
      Listudy.Repo.insert!(%Listudy.Studies.Study{
        user_id: other.id,
        title: "Saved public repertoire",
        slug: "daily-public-home",
        color: "black",
        private: false
      })

    hidden =
      Listudy.Repo.insert!(%Listudy.Studies.Study{
        user_id: other.id,
        title: "Hidden opponent repertoire",
        slug: "daily-private-home",
        private: true
      })

    for study <- [hd(studies), public, hidden] do
      Listudy.Repo.insert!(%Listudy.StudyFavorites.StudyFavorite{
        user_id: user.id,
        study_id: study.id
      })
    end

    most_used = hd(studies)
    assert Listudy.StudyLibrary.most_used(user.id, studies) == nil

    for {owner, study, time} <- [{user, most_used, 60000}, {other, public, 999_999}] do
      Listudy.Repo.insert!(%Listudy.Progress.UserSetting{
        user_id: owner.id,
        key: hd(String.split(study.slug, "-")) <> "_chapter_stats",
        value:
          Jason.encode!(%{
            studySessions: %{practice: %{activeMs: time, newCount: 1, reviewCount: 0}}
          })
      })
    end

    assert Listudy.StudyLibrary.most_used(user.id, studies ++ [public]) == most_used.id

    html =
      conn
      |> Pow.Plug.assign_current_user(user, [])
      |> init_test_session(%{last_study_slug: public.slug, last_study_user_id: user.id})
      |> get("/en")
      |> html_response(200)

    daily_list = html |> String.split("home-daily-studies-list") |> Enum.at(1)

    [_, first] =
      Regex.run(
        ~r/class="home-daily-study"[^>]*>[\s\S]*?class="home-daily-study-title"[^>]*>([^<]+)</,
        daily_list
      )

    assert first == public.title
    assert html =~ "home-daily-study-recent"
    assert html =~ "home-daily-study-most-used"
    refute html =~ "home-daily-sparring"
    assert length(Regex.scan(~r/class="home-daily-study"/, html)) == 9
    assert html =~ "Saved public repertoire"
    refute html =~ reference.title
    refute html =~ hidden.title
    assert Listudy.StudyLibrary.daily_studies(nil) == []
    preview("daily-home", html)
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
