defmodule Listudy.Games.ChessClient do
  @moduledoc """
  HTTP Client to fetch games from external chess platforms.
  """

  @lichess_url "https://lichess.org/api/games/user/"
  @chess_com_url "https://api.chess.com/pub/player/"

  @doc """
  Fetches the last 50 games for a Lichess user.
  """
  def fetch_lichess_games(username) do
    url = "#{@lichess_url}#{username}?max=50&moves=true&pgnInJson=true"
    
    # We request NDJSON to get a stream/list of individual JSON game objects
    headers = [{"Accept", "application/x-ndjson"}]

    case HTTPoison.get(url, headers) do
      {:ok, %HTTPoison.Response{status_code: 200, body: body}} ->
        games =
          body
          |> String.split("\n", trim: true)
          |> Enum.map(&Jason.decode!/1)

        {:ok, games}

      {:ok, %HTTPoison.Response{status_code: status}} ->
        {:error, "Lichess API returned status #{status}"}

      {:error, %HTTPoison.Error{reason: reason}} ->
        {:error, inspect(reason)}
    end
  end

  @doc """
  Fetches the games for a Chess.com user from their latest monthly archive.
  """
  def fetch_chess_com_games(username) do
    archives_url = "#{@chess_com_url}#{username}/games/archives"

    with {:ok, %HTTPoison.Response{status_code: 200, body: body}} <- HTTPoison.get(archives_url),
         %{"archives" => archives} when archives != [] <- Jason.decode!(body),
         last_month_url <- List.last(archives),
         {:ok, %HTTPoison.Response{status_code: 200, body: games_body}} <- HTTPoison.get(last_month_url),
         %{"games" => games} <- Jason.decode!(games_body) do
      {:ok, games}
    else
      {:ok, %HTTPoison.Response{status_code: 404}} -> {:error, "Chess.com user not found"}
      {:ok, %HTTPoison.Response{status_code: status}} -> {:error, "Chess.com API returned status #{status}"}
      {:error, %HTTPoison.Error{reason: reason}} -> {:error, inspect(reason)}
      _ -> {:error, "Failed to fetch Chess.com games"}
    end
  end
end