defmodule Listudy.TrainingDeviationsTest do
  use ExUnit.Case, async: true
  alias Listudy.Games.TrainingDeviations

  @white_fen "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
  @black_fen "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"

  test "earlier departures are not automatically training mistakes" do
    result = %{
      "deviation" => false,
      "fen" => @black_fen,
      "played" => "",
      "expected" => [],
      "earlier_departures" => [
        %{"fen" => @white_fen, "ply" => 0, "played" => "d4", "expected" => ["Nf3"]}
      ]
    }

    assert TrainingDeviations.events(result, "white") == []

    assert TrainingDeviations.outcome(result, "white") ==
             TrainingDeviations.outcome(%{result | "earlier_departures" => []}, "white")
  end

  test "accepts a final player departure with several repertoire moves" do
    result = %{
      "deviation" => true,
      "fen" => @white_fen,
      "ply" => 0,
      "played" => "d4",
      "expected" => ["Nf3", "e4"],
      "earlier_departures" => []
    }

    assert [%{ply: 0, played: "d4", expected: ["Nf3", "e4"]}] =
             TrainingDeviations.events(result, "white")

    assert TrainingDeviations.events(result, "black") == []
  end

  test "a transposed game does not turn the alternate move order into a mistake" do
    studies = [%{id: 1, pgn: "[Event \"Target\"]\n\n1. Nf3 d5 2. d4 Nf6 3. c4 *"}]
    games = [%{id: 1, pgn: "1. d4 d5 2. Nf3 Nf6 3. c4 e6 *"}]

    assert {:ok, %{"games" => [game]}} = Listudy.Games.ChessEngine.analyze_batch(studies, games)

    assert [%{"candidates" => [result]}] = game["matches"]
    assert result["reason"] == "book_ended"
    assert [%{"played" => "d4"}] = result["earlier_departures"]
    assert TrainingDeviations.events(result, "white") == []
  end

  test "equally ranked chapters agree only when final training answers agree" do
    result = %{
      "deviation" => true,
      "fen" => @white_fen,
      "ply" => 0,
      "played" => "d4",
      "expected" => ["e4", "Nf3"],
      "earlier_departures" => []
    }

    assert TrainingDeviations.outcome(result, "white") ==
             TrainingDeviations.outcome(%{result | "expected" => ["Nf3", "e4"]}, "white")

    refute TrainingDeviations.outcome(result, "white") ==
             TrainingDeviations.outcome(%{result | "expected" => ["Nf3"]}, "white")
  end
end
