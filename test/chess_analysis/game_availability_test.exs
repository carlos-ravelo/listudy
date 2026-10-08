defmodule Listudy.Games.GameAvailabilityTest do
  use ExUnit.Case, async: true
  alias Listudy.Games.ChessClient

  test "Lichess requests only the latest finished game without moves" do
    request = fn url, headers, options ->
      assert url =~ "max=1&moves=false&ongoing=false&finished=true"
      assert url =~ "a%2Fb"
      assert headers == [{"Accept", "application/x-ndjson"}]
      assert options[:recv_timeout] == 8_000
      {:ok, %HTTPoison.Response{status_code: 200, body: "{\"id\":\"latest\"}\n"}}
    end

    assert {:ok, ["latest"]} = ChessClient.recent_game_ids("lichess", "a/b", request)
  end

  test "Chess.com reads only the latest archive and uses the importer ID format" do
    request = fn url, _, _ ->
      body =
        if String.ends_with?(url, "/archives") do
          ~s({"archives":["https://api.chess.com/pub/player/user/games/2025/12","https://api.chess.com/pub/player/user/games/2026/01"]})
        else
          assert url == "https://api.chess.com/pub/player/user/games/2026/01"
          ~s({"games":[{"url":"https://www.chess.com/game/live/123/","end_time":1}]})
        end

      {:ok, %HTTPoison.Response{status_code: 200, body: body}}
    end

    assert {:ok, ["123"]} = ChessClient.recent_game_ids("chess_com", "User", request)
  end

  test "empty accounts and API failures are distinct results" do
    empty = fn _, _, _ -> {:ok, %HTTPoison.Response{status_code: 200, body: ""}} end
    assert {:ok, []} = ChessClient.recent_game_ids("lichess", "user", empty)
    failed = fn _, _, _ -> {:ok, %HTTPoison.Response{status_code: 429, body: ""}} end
    assert {:error, _} = ChessClient.recent_game_ids("lichess", "user", failed)
    invalid = fn _, _, _ -> {:ok, %HTTPoison.Response{status_code: 200, body: "not json"}} end
    assert {:error, _} = ChessClient.recent_game_ids("chess_com", "user", invalid)
  end
end
