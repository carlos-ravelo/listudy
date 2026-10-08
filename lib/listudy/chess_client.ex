defmodule Listudy.Games.ChessClient do
  @moduledoc """
  HTTP Client to fetch games from external chess platforms with incremental sync.
  """

  @lichess_url "https://lichess.org/api/games/user/"
  @chess_com_url "https://api.chess.com/pub/player/"
  @max_games_limit 3500
  @default_history_years 1
  @seconds_in_a_year 365 * 24 * 60 * 60

  # Availability probes never import or analyze games.
  def recent_game_ids(platform, username, request \\ &HTTPoison.get/3)

  def recent_game_ids("lichess", username, request) do
    username = URI.encode(username, &URI.char_unreserved?/1)
    url = "#{@lichess_url}#{username}?max=1&moves=false&ongoing=false&finished=true"

    with {:ok, body} <- availability_request(url, [{"Accept", "application/x-ndjson"}], request) do
      body
      |> String.split("\n", trim: true)
      |> Enum.reduce_while({:ok, []}, fn line, {:ok, ids} ->
        case Jason.decode(line) do
          {:ok, %{"id" => id}} when is_binary(id) -> {:cont, {:ok, [id | ids]}}
          _ -> {:halt, {:error, :invalid_response}}
        end
      end)
    end
  end

  def recent_game_ids("chess_com", username, request) do
    username = URI.encode(String.downcase(username), &URI.char_unreserved?/1)
    base = "#{@chess_com_url}#{username}/games"

    with {:ok, body} <- availability_request(base <> "/archives", [], request),
         {:ok, %{"archives" => archives}} when is_list(archives) <- Jason.decode(body) do
      case Enum.max(archives, fn -> nil end) do
        nil ->
          {:ok, []}

        archive when is_binary(archive) ->
          # Build the URL ourselves; remote response data cannot choose a host.
          case Regex.run(~r"/games/(\d{4})/(0[1-9]|1[0-2])$", archive) do
            [_, year, month] ->
              with {:ok, month_body} <-
                     availability_request("#{base}/#{year}/#{month}", [], request),
                   {:ok, %{"games" => games}} when is_list(games) <- Jason.decode(month_body) do
                Enum.reduce_while(games, {:ok, []}, fn game, {:ok, ids} ->
                  case game do
                    %{"url" => url, "end_time" => time}
                    when is_binary(url) and is_integer(time) ->
                      id = url |> String.trim_trailing("/") |> String.split("/") |> List.last()
                      {:cont, {:ok, [id | ids]}}

                    _ ->
                      {:halt, {:error, :invalid_response}}
                  end
                end)
              else
                _ -> {:error, :invalid_response}
              end

            _ ->
              {:error, :invalid_response}
          end

        _ ->
          {:error, :invalid_response}
      end
    else
      _ -> {:error, :invalid_response}
    end
  end

  defp availability_request(url, headers, request) do
    case request.(url, headers, timeout: 5_000, recv_timeout: 8_000) do
      {:ok, %HTTPoison.Response{status_code: 200, body: body}} -> {:ok, body}
      _ -> {:error, :unavailable}
    end
  end

  @doc """
  Fetches games for a Lichess user. If since_ms is provided, only fetches games after that epoch.
  If nil, defaults to the last #{@default_history_years} years to maintain consistency with Chess.com.
  Limits the download to #{@max_games_limit} games maximum.
  """
  def fetch_lichess_games(username, since_ms \\ nil) do
    since_param =
      if since_ms do
        since_ms
      else
        seconds_to_subtract = @default_history_years * @seconds_in_a_year

        DateTime.utc_now()
        |> DateTime.add(-seconds_to_subtract, :second)
        |> DateTime.to_unix(:millisecond)
      end

    url =
      "#{@lichess_url}#{username}?moves=true&pgnInJson=true&since=#{since_param}&max=#{@max_games_limit}"

    headers = [{"Accept", "application/x-ndjson"}]

    require Logger
    Logger.info("Requesting Lichess URL: #{url}")

    case HTTPoison.get(url, headers) do
      {:ok, %HTTPoison.Response{status_code: 200, body: body}} ->
        games =
          body
          |> String.split("\n", trim: true)
          |> Enum.map(&Jason.decode!/1)

        Logger.info("Successfully downloaded #{length(games)} games from Lichess.")
        {:ok, games}

      {:ok, %HTTPoison.Response{status_code: status}} ->
        Logger.error("Lichess API blocked or failed. Status: #{status}")
        {:error, "Lichess API returned status #{status}"}

      {:error, %HTTPoison.Error{reason: reason}} ->
        Logger.error("HTTPoison failed to connect to Lichess: #{inspect(reason)}")
        {:error, inspect(reason)}
    end
  end

  @doc """
  Fetches games for a Chess.com user. If last_date is provided, only fetches archives from that month onwards.
  Halts downloading when #{@max_games_limit} games are reached.
  """
  def fetch_chess_com_games(username, last_date \\ nil) do
    archives_url = "#{@chess_com_url}#{URI.encode(username)}/games/archives"

    with {:ok, %HTTPoison.Response{status_code: 200, body: body}} <- HTTPoison.get(archives_url),
         {:ok, %{"archives" => archives}} when is_list(archives) <- Jason.decode(body) do
      archives
      |> filter_chess_com_archives(last_date)
      |> Enum.reverse()
      |> Enum.reduce_while({:ok, []}, fn url, {:ok, games} ->
        if length(games) >= @max_games_limit do
          {:halt, {:ok, games}}
        else
          # Chess.com recommends serial requests for its monthly archives.
          Process.sleep(1000)

          case HTTPoison.get(url) do
            {:ok, %HTTPoison.Response{status_code: 200, body: month_body}} ->
              case Jason.decode(month_body) do
                {:ok, %{"games" => month_games}} when is_list(month_games) ->
                  {:cont, {:ok, games ++ Enum.reverse(month_games)}}

                _ ->
                  {:halt, {:error, "Invalid Chess.com archive response for #{url}"}}
              end

            {:ok, %HTTPoison.Response{status_code: status}} ->
              {:halt, {:error, "Chess.com archive returned status #{status}: #{url}"}}

            {:error, %HTTPoison.Error{reason: reason}} ->
              {:halt, {:error, "Chess.com archive request failed: #{inspect(reason)}"}}
          end
        end
      end)
      |> case do
        {:ok, games} -> {:ok, Enum.take(games, @max_games_limit)}
        error -> error
      end
    else
      {:ok, %HTTPoison.Response{status_code: 404}} ->
        {:error, "Chess.com user not found"}

      {:ok, %HTTPoison.Response{status_code: status}} ->
        {:error, "Chess.com API returned status #{status}"}

      {:error, %HTTPoison.Error{reason: reason}} ->
        {:error, inspect(reason)}

      _ ->
        {:error, "Invalid Chess.com archive list"}
    end
  end

  defp filter_chess_com_archives(archives, nil) do
    today = Date.utc_today()
    # Calculamos la fecha exacta de hace 3 años
    three_years_ago = %{year: today.year - 3, month: today.month}

    # Reutilizamos tu propia lógica de filtrado pasándole esta nueva fecha
    filter_chess_com_archives(archives, three_years_ago)
  end

  defp filter_chess_com_archives(archives, last_date) do
    Enum.filter(archives, fn url ->
      [year_str, month_str] = Enum.take(String.split(url, "/"), -2)
      year = String.to_integer(year_str)
      month = String.to_integer(month_str)

      year > last_date.year or (year == last_date.year and month >= last_date.month)
    end)
  end
end
