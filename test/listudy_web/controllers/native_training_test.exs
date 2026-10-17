defmodule ListudyWeb.NativeTrainingTest do
  use ListudyWeb.ConnCase

  defp preview(name, html) do
    if directory = System.get_env("LISTUDY_NATIVE_PREVIEW") do
      File.mkdir_p!(directory)
      File.write!(Path.join(directory, name <> ".html"), html)
    end
  end

  test "daily puzzle returns to collections rather than the native random catalogue", %{
    conn: conn
  } do
    html = conn |> get("/en/tactics/daily-puzzle") |> html_response(200)
    assert [_] = Floki.find(html, ".training-breadcrumb a[href='/en/tactics']")
    assert [_] = Floki.find(html, "#next[href='/en/tactics']")
    assert [] = Floki.find(html, "a[href='/en/tactics/random']")
    preview("daily", html)
  end

  test "pieceless reuses a native puzzle when its dedicated catalogue is empty", %{conn: conn} do
    Listudy.Repo.delete_all(Listudy.PiecelessTactics.PiecelessTactic)
    response = conn |> get("/en/pieceless-tactics")
    path = redirected_to(response)
    assert path =~ "/en/pieceless-tactics/puzzle/"
    html = build_conn() |> get(path) |> html_response(200)
    assert html =~ ~s(data-solution-format="san")
    assert [_] = Floki.find(html, "#info")
    assert [_] = Floki.find(html, "#training_restart")
    preview("pieceless-fallback", html)
  end

  test "a single dedicated pieceless exercise can be visited again", %{conn: conn} do
    Listudy.Repo.delete_all(Listudy.PiecelessTactics.PiecelessTactic)

    tactic =
      Listudy.Repo.insert!(%Listudy.PiecelessTactics.PiecelessTactic{
        fen: "7k/5K2/6Q1/8/8/8/8/8 w - - 0 1",
        solution: "g6g7",
        pieces: 3
      })

    response = conn |> get("/en/pieceless-tactics-random/#{tactic.id}")
    assert redirected_to(response) == "/en/pieceless-tactics/#{tactic.id}"
    html = build_conn() |> get(redirected_to(response)) |> html_response(200)
    preview("pieceless-mate", html)
  end

  test "pieceless promotion exercises keep their exact underpromotion", %{conn: conn} do
    tactic =
      Listudy.Repo.insert!(%Listudy.PiecelessTactics.PiecelessTactic{
        fen: "7k/P7/6K1/8/8/8/8/8 w - - 0 1",
        solution: "a7a8n",
        pieces: 3
      })

    html = conn |> get("/en/pieceless-tactics/#{tactic.id}") |> html_response(200)
    preview("pieceless-promotion", html)
  end

  test "blind exercises retain their custom starting position and expose retry", %{conn: conn} do
    tactic =
      Listudy.Repo.insert!(%Listudy.BlindTactics.BlindTactic{
        pgn: "[SetUp \"1\"]\n[FEN \"7k/5K2/6Q1/8/8/8/8/8 w - - 0 1\"]\n\n1. Qg7#",
        ply: 0,
        color: "white"
      })

    html = conn |> get("/en/blind-tactics/#{tactic.id}") |> html_response(200)
    assert [_] = Floki.find(html, "#training_restart")
    assert [_] = Floki.find(html, "#blind_board_frame[phx-update=ignore]")
    preview("blind", html)
  end

  test "blind without exercises is an actionable page", %{conn: conn} do
    Listudy.Repo.delete_all(Listudy.BlindTactics.BlindTactic)
    html = conn |> get("/en/blind-tactics") |> html_response(200)
    assert html =~ "No exercises are available yet"
    assert html =~ ~s(href="/en/tactics")
  end

  test "chessclicker with no easy puzzles renders a LiveView empty state", %{conn: conn} do
    import Ecto.Query
    Listudy.Repo.update_all(from(t in Listudy.Tactics.Tactic), set: [rating: 2000])
    html = conn |> get("/en/games/chessclicker") |> html_response(200)
    assert html =~ "No exercises are available yet"
    assert html =~ ~s(href="/en/tactics")
  end
end
