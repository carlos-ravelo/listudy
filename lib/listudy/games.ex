defmodule Listudy.Games do
  @moduledoc """
  The Games context.
  """

  alias Listudy.Repo
  alias Listudy.Games.UserGame
  alias Listudy.Games.ChessClient
  alias Listudy.Games.Deviation
  import Ecto.Query

  @doc """
  Queries the database to find the most recent game fetched for a specific user and platform.
  """
  def get_latest_game_timestamp(user_id, platform) do
    UserGame
    |> where([g], g.user_id == ^user_id and g.platform == ^platform)
    |> select([g], max(g.played_at))
    |> Repo.one()
  end

  @doc """
  Fetches and upserts games from Lichess.
  """
  def import_lichess_games(user, lichess_username) do
    last_date = get_latest_game_timestamp(user.id, "lichess")

    since_ms =
      if last_date do
        DateTime.to_unix(last_date, :millisecond) + 1000
      else
        nil
      end

    case ChessClient.fetch_lichess_games(lichess_username, since_ms) do
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
    last_date = get_latest_game_timestamp(user.id, "chess_com")

    case ChessClient.fetch_chess_com_games(chess_com_username, last_date) do
      {:ok, games} ->
        records =
          Enum.map(games, fn game ->
            %{
              platform: "chess_com",
              game_id_on_platform: game["url"] |> String.split("/") |> List.last(),
              pgn: game["pgn"],
              white_player: get_in(game, ["white", "username"]),
              black_player: get_in(game, ["black", "username"]),
              result: get_in(game, ["white", "result"]),
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
    {:ok, {0, []}}
  end

  defp upsert_user_games(games_attrs) do
    now = NaiveDateTime.truncate(NaiveDateTime.utc_now(), :second)

    # insert_all needs timestamps explicitly added
    records_with_timestamps = Enum.map(games_attrs, &Map.merge(&1, %{inserted_at: now, updated_at: now}))

    # Dividimos el arreglo en lotes de 1000 para no reventar el límite de 65,535 parámetros de Postgres
    {total_count, all_records} =
      records_with_timestamps
      |> Enum.chunk_every(1000)
      |> Enum.reduce({0, []}, fn chunk, {acc_count, acc_records} ->
        {count, records} =
          Repo.insert_all(
            UserGame, 
            chunk, 
            on_conflict: :nothing, 
            conflict_target: [:platform, :game_id_on_platform], 
            returning: true
          )

        {acc_count + count, acc_records ++ records}
      end)

    {:ok, {total_count, all_records}}
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

  @doc """
  Devuelve una lista de errores únicos para un estudio, agrupados por posición (FEN)
  y ordenados por frecuencia de repetición.
  """
  def get_unique_mistakes_to_train(study_id, filter \\ "all") do
    query =
      Deviation
      |> join(:inner, [d], g in Listudy.Games.UserGame, on: d.user_game_id == g.id)
      |> where([d, g], d.study_id == ^study_id)

    query =
      case filter do
        "last_week" ->
          one_week_ago = DateTime.utc_now() |> DateTime.add(-7, :day)
          where(query, [d, g], g.played_at > ^one_week_ago)

        "last_month" ->
          one_month_ago = DateTime.utc_now() |> DateTime.add(-30, :day)
          where(query, [d, g], g.played_at > ^one_month_ago)

        _ ->
          query
      end

    query
    |> group_by([d, g], [d.position_fen, d.expected_move, d.played_move])
    |> select([d, g], %{
      fen: d.position_fen,
      expected: d.expected_move,
      played: d.played_move,
      times_repeated: count(d.id)
    })
    |> order_by([d, g], desc: count(d.id))
    |> Repo.all()
  end
end
