defmodule Listudy.ChessEngineBoundaryTest do
  use ExUnit.Case
  alias Listudy.Games.ChessEngine

  test "the application can analyze a transposed PGN through Python" do
    studies = [%{id: 17, pgn: "[Event \"Target\"]\n\n1. Nf3 d5 2. d4 Nf6 3. c4 *"}]
    games = [%{id: 9, pgn: "1. d4 d5 2. Nf3 Nf6 3. e3 *"}]
    assert {:ok, %{"games" => [game]}} = ChessEngine.analyze_batch(studies, games)
    assert [%{"study_id" => "17", "candidates" => [result]}] = game["matches"]
    assert result["chapter_index"] == 0
    assert result["expected"] == ["c4"]
    assert result["transposed"]
    assert result["ply"] == 4
  end

  test "invalid PGNs return a per-game error without failing other games" do
    studies = [%{id: 1, pgn: "1. e4 e5 *"}]
    games = [%{id: 1, pgn: "invalid"}, %{id: 2, pgn: "1. e4 e5 *"}]
    assert {:ok, %{"games" => [invalid, valid]}} = ChessEngine.analyze_batch(studies, games)
    assert invalid["error"]
    assert valid["matches"] != []
  end

  test "study content changes invalidate saved analysis fingerprints" do
    assert ChessEngine.fingerprint("1. e4 *") != ChessEngine.fingerprint("1. d4 *")
  end
end

defmodule Listudy.AnalysisTemplateTest do
  use ExUnit.Case

  defmodule Endpoint do
    def static_path(path), do: path
  end

  defp conn do
    Plug.Test.conn(:get, "/analysis")
    |> Plug.Conn.put_private(:phoenix_endpoint, Endpoint)
    |> Plug.Conn.assign(:locale, "en")
  end

  test "ambiguous matches offer exact study and chapter selections" do
    study = %{id: 1, title: "Test <study>", slug: "example-study", color: "white"}
    result = %{"chapter" => "Same name", "chapter_index" => 1, "score" => [3, 4]}

    html =
      Phoenix.View.render_to_string(ListudyWeb.AnalysisView, "matches.html",
        conn: conn(),
        choices: [{study, result}],
        pgn_text: "1. e4 e5 *"
      )

    assert html =~ "name=\"study_id\" value=\"1\""
    assert html =~ "name=\"chapter_index\" value=\"1\""
    assert html =~ "Test &lt;study&gt;"
  end

  test "transposition results link to the exact chapter and replay ply" do
    study = %{id: 1, title: "Test", slug: "example-study", color: "white"}

    result = %{
      "chapter" => "Target",
      "chapter_index" => 2,
      "score" => [3, 4],
      "fen" => "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      "ply" => 4,
      "entry_ply" => 3,
      "expected" => ["c4"],
      "played" => "e3",
      "deviation" => true,
      "transposed" => true,
      "earlier_departures" => []
    }

    html =
      Phoenix.View.render_to_string(ListudyWeb.AnalysisView, "quick_result.html",
        conn: conn(),
        study: study,
        result: result,
        pgn_text: "1. d4 d5 *",
        deviator_color: "white"
      )

    assert html =~ "chapter_index=2"
    assert html =~ "data-ply=\"4\""
    assert html =~ "different move order"
  end
end
