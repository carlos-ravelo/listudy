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

  test "equivalent matches share a comparison and retain exact chapter links" do
    study = %{id: 1, title: "Test <study>", slug: "example-study", color: "white"}

    result = %{
      "chapter" => "Same name",
      "chapter_index" => 1,
      "score" => [2, 2],
      "fen" => "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
      "ply" => 2,
      "entry_ply" => 0,
      "expected" => [],
      "played" => "",
      "deviation" => false,
      "reason" => "book_ended",
      "transposed" => false,
      "earlier_departures" => [],
      "matched_plies" => [0, 1]
    }

    html =
      Phoenix.View.render_to_string(ListudyWeb.AnalysisView, "quick_result.html",
        conn: conn(),
        choices: [{study, result}, {study, Map.put(result, "chapter_index", 2)}],
        pgn_text: "1. e4 e5 2. Nf3 *"
      )

    assert html =~ "chapter_index=1"
    assert html =~ "chapter_index=2"
    assert html =~ "chapter=Same+name"
    assert html =~ "Test &lt;study&gt;"
    assert html =~ "data-select-group=\"0\""
    refute html =~ "data-select-group=\"1\""
  end

  test "transposition results link to the exact chapter and replay ply" do
    study = %{id: 1, title: "Test", slug: "example-study", color: "white"}

    result = %{
      "chapter" => "Target",
      "chapter_index" => 2,
      "score" => [3, 4],
      "fen" => "rnbqkb1r/ppp1pppp/5n2/3p4/3P4/5N2/PPP1PPPP/RNBQKB1R w KQkq - 2 3",
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
        choices: [{study, result}],
        pgn_text: "1. d4 d5 2. Nf3 Nf6 3. e3 *"
      )

    assert html =~ "chapter_index=2"
    assert html =~ "chapter=Target"
    assert html =~ "&quot;ply&quot;:4"
    assert html =~ "different move order"
  end
end
