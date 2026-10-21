defmodule ListudyWeb.PuzzleCatalogControllerTest do
  use ListudyWeb.ConnCase
  import Phoenix.LiveViewTest
  alias Listudy.Repo
  alias Listudy.Tactics.Tactic

  test "empty catalog and empty daily puzzle are usable", %{conn: conn} do
    Repo.delete_all(Tactic)
    html = conn |> get("/en/tactics/puzzles") |> html_response(200)
    assert html =~ "No puzzles match"

    assert conn |> get("/en/tactics/daily-puzzle") |> html_response(200) =~
             "No puzzles are available"

    assert conn |> get("/en/tactics/random") |> html_response(200) =~ "No puzzles are available"
  end

  test "catalog filters stay in the next puzzle URL", %{conn: conn} do
    one =
      Repo.insert!(%Tactic{
        source: "lichess",
        source_id: "one",
        rating: 1700,
        themes: ["fork"],
        fen: "8/8/8/8/8/8/K7/7k w - - 0 1",
        moves: "Ka3",
        last_move: "h2h1",
        color: "white"
      })

    two =
      Repo.insert!(%Tactic{
        source: "lichess",
        source_id: "two",
        rating: 1800,
        themes: ["fork"],
        fen: "8/8/8/8/8/8/K7/7k w - - 0 1",
        moves: "Ka3",
        last_move: "h2h1",
        color: "white"
      })

    Repo.insert!(%Tactic{source: "lichess", source_id: "other", rating: 2400, themes: ["mate"]})
    url = "/en/tactics/puzzles/#{one.id}?theme=fork&min_rating=1600&max_rating=1900"
    {:ok, view, html} = live(conn, url)
    assert html |> html_find(".puzzle-current-rating strong") |> Floki.text() == "1700"
    assert html =~ "lichess:one"
    assert [] = html_find(html, ".puzzle-filters .form-select, .puzzle-filters .form-control")
    render_click(view, "next")

    path =
      Routes.catalog_tactics_path(conn, ListudyWeb.TacticsLive, "en", two, %{
        "theme" => "fork",
        "min_rating" => 1600,
        "max_rating" => 1900
      })

    assert_patch(view, path)
  end

  test "previewing settings keeps the current puzzle and applies filters in place", %{conn: conn} do
    one =
      Repo.insert!(%Tactic{
        source: "lichess",
        source_id: "inline-one",
        rating: 1700,
        themes: ["fork"],
        fen: "8/8/8/8/8/8/K7/7k w - - 0 1",
        moves: "Ka3",
        last_move: "h2h1",
        color: "white"
      })

    two =
      Repo.insert!(%Tactic{
        source: "lichess",
        source_id: "inline-two",
        rating: 2200,
        themes: ["pin"],
        fen: "8/8/8/8/8/8/K7/7k w - - 0 1",
        moves: "Ka3",
        last_move: "h2h1",
        color: "white"
      })

    {:ok, view, _} =
      live(conn, "/en/tactics/puzzles/#{one.id}?theme=fork&min_rating=1600&max_rating=1800")

    filters = %{"theme" => "pin", "min_rating" => "2000", "max_rating" => "2300"}
    html = render_change(view, "preview_filters", filters)
    assert html =~ "lichess:inline-one"

    assert ["pin"] ==
             html
             |> html_find("#practice-puzzles-theme option[selected]")
             |> Floki.attribute("value")

    assert ["2000"] ==
             html |> html_find("#practice-puzzles-min") |> Floki.attribute("value")

    assert ["2300"] ==
             html |> html_find("#practice-puzzles-max") |> Floki.attribute("value")

    assert [_] = html_find(html, "#practice-puzzles-status[hidden]")
    render_submit(view, "apply_filters", filters)

    assert_patch(
      view,
      Routes.catalog_tactics_path(conn, ListudyWeb.TacticsLive, "en", two, filters)
    )

    assert render(view) =~ "lichess:inline-two"

    invalid =
      render_submit(view, "apply_filters", %{"min_rating" => "2400", "max_rating" => "1000"})

    assert invalid =~ "Minimum rating must not exceed maximum rating."
    assert invalid =~ "aria-invalid=\"true\""
    assert invalid =~ "lichess:inline-two"
    empty = render_submit(view, "apply_filters", %{"theme" => "missing"})
    assert empty =~ "No puzzles match. Try another theme"
    assert empty =~ "lichess:inline-two"
  end

  test "saved rating is restored without overriding explicit filters", %{conn: conn} do
    saved = put_req_cookie(conn, "puzzle_rating", "1000:1400")
    html = saved |> get("/en/tactics") |> html_response(200)
    assert ["1000"] == html |> html_find("#library-puzzles-min") |> Floki.attribute("value")
    assert ["1400"] == html |> html_find("#library-puzzles-max") |> Floki.attribute("value")

    html = saved |> get("/en/tactics?min_rating=1600&max_rating=1900") |> html_response(200)
    assert ["1600"] == html |> html_find("#library-puzzles-min") |> Floki.attribute("value")
    assert ["1900"] == html |> html_find("#library-puzzles-max") |> Floki.attribute("value")

    html =
      conn
      |> put_req_cookie("puzzle_rating", "2000:1000")
      |> get("/en/tactics")
      |> html_response(200)

    assert ["0"] == html |> html_find("#library-puzzles-min") |> Floki.attribute("value")
    assert ["4000"] == html |> html_find("#library-puzzles-max") |> Floki.attribute("value")
  end

  test "the catalog opens practice immediately and the tactics hub offers filters", %{conn: conn} do
    puzzle =
      Repo.insert!(%Tactic{
        source: "lichess",
        source_id: "direct",
        rating: 1000,
        themes: ["fork"]
      })

    path = conn |> get("/en/tactics/puzzles?theme=fork") |> redirected_to()
    assert URI.parse(path).path == "/en/tactics/puzzles/#{puzzle.id}"
    assert URI.decode_query(URI.parse(path).query)["theme"] == "fork"
    html = conn |> get("/en/tactics") |> html_response(200)
    assert [_] = html_find(html, "form#library-puzzles select[name=theme]")
    assert [_] = html_find(html, "form#library-puzzles input[name=min_rating]")
    assert [_] = html_find(html, "form#library-puzzles input[name=max_rating]")
    assert html =~ "Your collections"

    if directory = System.get_env("LISTUDY_PUZZLES_PREVIEW") do
      File.mkdir_p!(directory)
      File.write!(Path.join(directory, "hub.html"), html)
    end
  end

  test "only admins may upload catalog files", %{conn: conn} do
    assert conn |> get("/admin/puzzle-imports") |> redirected_to() == "/"
    user = %Listudy.Users.User{id: 2, role: "user", username: "regular"}
    regular = Pow.Plug.assign_current_user(conn, user, [])
    assert regular |> post("/admin/puzzle-imports", %{}) |> redirected_to() == "/"
    admin = Pow.Plug.assign_current_user(conn, %{user | role: "admin"}, [])
    assert admin |> get("/admin/puzzle-imports") |> html_response(200) =~ "Puzzle imports"

    upload = %Plug.Upload{
      path: Path.expand("test/fixtures/puzzles/lichess.csv"),
      filename: "puzzles.csv"
    }

    assert admin
           |> post("/admin/puzzle-imports", %{"import" => %{"file" => upload}})
           |> redirected_to() == "/admin/puzzle-imports"

    [job] = Listudy.PuzzleCatalog.imports()
    assert job.status == "queued"
    assert File.exists?(job.path)
    on_exit(fn -> File.rm(job.path) end)
  end

  test "native browser fixtures expose prepared SAN puzzles and the shared promotion picker", %{
    conn: conn
  } do
    for {name, attrs} <- [
          {"catalog",
           %{
             source_id: "browser",
             fen: "q5nr/1ppknQpp/3p4/1P2p3/4P3/B1PP1b2/B5PP/5K2 w - - 1 18",
             moves: "Be6+ Kd8 Qf8#",
             last_move: "e8d7"
           }},
          {"promotion",
           %{
             source_id: "promotion",
             fen: "8/P6k/8/8/8/8/8/7K w - - 1 2",
             moves: "a8=N",
             last_move: "h8h7"
           }}
        ] do
      tactic =
        Repo.insert!(
          struct(
            Tactic,
            Map.merge(%{source: "lichess", color: "white", rating: 1500, themes: ["fork"]}, attrs)
          )
        )

      html = conn |> get("/en/tactics/puzzles/#{tactic.id}") |> html_response(200)
      assert html =~ "data-promotion-picker"

      if directory = System.get_env("LISTUDY_PUZZLES_PREVIEW") do
        File.mkdir_p!(directory)
        File.write!(Path.join(directory, name <> ".html"), html)
      end
    end
  end
end
