defmodule Listudy.Games do
  @moduledoc """
  The Games context.
  """

  alias Listudy.Repo
  alias Listudy.Games.UserGame
  alias Listudy.Games.ChessClient
  import Ecto.Query

  @doc """
  Fetches and upserts games from Lichess.
  """
  def import_lichess_games(user, lichess_username) do
    case ChessClient.fetch_lichess_games(lichess_username) do
      {:ok, games} ->
        records =
          Enum.map(games, fn game ->
            %{
              platform: "lichess",
              game_id_on_platform: game["id"],
              pgn: game["pgn"],
              white_player: get_in(game, ["players", "white", "user", "name"]) || "Anonymous",
              black_player: get_in(game, ["players", "black", "user", "name"]) || "Anonymous",
              result: game["status"],
              played_at: game["createdAt"] |> DateTime.from_unix!(:millisecond) |> DateTime.truncate(:second),
              user_id: user.id
            }
          end)

        upsert_user_games(records)

      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Fetches and upserts games from Chess.com.
  """
  def import_chess_com_games(user, chess_com_username) do
    case ChessClient.fetch_chess_com_games(chess_com_username) do
      {:ok, games} ->
        records =
          Enum.map(games, fn game ->
            %{
              platform: "chess_com",
              game_id_on_platform: game["url"] |> String.split("/") |> List.last(),
              pgn: game["pgn"],
              white_player: get_in(game, ["white", "username"]),
              black_player: get_in(game, ["black", "username"]),
              result: get_in(game, ["white", "result"]), # Simplified result logic
              played_at: DateTime.from_unix!(game["end_time"], :second),
              user_id: user.id
            }
          end)

        upsert_user_games(records)

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp upsert_user_games([]) do
    {:ok, {0, nil}}
  end

  defp upsert_user_games(games_attrs) do
    now = NaiveDateTime.truncate(NaiveDateTime.utc_now(), :second)

    # insert_all needs timestamps explicitly added
    records_with_timestamps = Enum.map(games_attrs, &Map.merge(&1, %{inserted_at: now, updated_at: now}))

    # Insert multiple games and ignore the ones that conflict with the unique index
    Repo.insert_all(UserGame, records_with_timestamps, on_conflict: :nothing, conflict_target: [:platform, :game_id_on_platform])
  end

  @doc """
  Returns the latest games for a user, preloading their deviations.
  """
  def list_analyzed_games(user_id) do
    UserGame
    |> where(user_id: ^user_id)
    |> order_by(desc: :played_at)
    |> limit(20)
    |> preload(:deviations)
    |> Repo.all()
  end
end