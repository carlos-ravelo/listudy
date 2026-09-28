defmodule Listudy.Games.ImportedGames do
  @moduledoc "Queries saved platform games without loading every PGN into the library page."
  import Ecto.Query
  alias Listudy.Repo
  alias Listudy.Games.{StudyGame, UserGame}
  alias Listudy.Studies.Study

  @page_size 20
  @platforms ~w(lichess chess_com)
  @periods ~w(all last_week last_month)
  @statuses ~w(match deviation ambiguous out_of_scope error)

  def list_recent(user_id, params) do
    platform = allowed(params["platform"], @platforms)
    period = allowed(params["period"], @periods) || "all"
    status = allowed(params["status"], @statuses)
    studies = Repo.all(from s in Study, where: s.user_id == ^user_id, order_by: [asc: s.title])

    study_id =
      case params["study_id"] do
        text when is_binary(text) ->
          case Integer.parse(text) do
            {id, ""} when id > 0 -> if(Enum.any?(studies, &(&1.id == id)), do: id)
            _ -> nil
          end

        _ ->
          nil
      end

    query = from g in UserGame, where: g.user_id == ^user_id and not is_nil(g.played_at)
    query = if platform, do: where(query, [g], g.platform == ^platform), else: query

    query =
      case period do
        "last_week" ->
          where(query, [g], g.played_at > ^DateTime.add(DateTime.utc_now(), -7, :day))

        "last_month" ->
          where(query, [g], g.played_at > ^DateTime.add(DateTime.utc_now(), -30, :day))

        _ ->
          query
      end

    query =
      if status || study_id do
        matching_games =
          from sg in StudyGame,
            join: s in Study,
            on: s.id == sg.study_id,
            where: s.user_id == ^user_id,
            select: sg.user_game_id

        matching_games =
          if status,
            do: where(matching_games, [sg, _s], sg.status == ^status),
            else: matching_games

        matching_games =
          if study_id,
            do: where(matching_games, [sg, _s], sg.study_id == ^study_id),
            else: matching_games

        where(query, [g], g.id in subquery(matching_games))
      else
        query
      end

    total = Repo.aggregate(query, :count, :id)
    cursor = decode_cursor(params["cursor"])
    newer_page = cursor && params["direction"] == "newer"

    page_query =
      case {cursor, newer_page} do
        {{at, id}, true} ->
          query
          |> where([g], g.played_at > ^at or (g.played_at == ^at and g.id > ^id))
          |> order_by([g], asc: g.played_at, asc: g.id)

        {{at, id}, _} ->
          query
          |> where([g], g.played_at < ^at or (g.played_at == ^at and g.id < ^id))
          |> order_by([g], desc: g.played_at, desc: g.id)

        _ ->
          order_by(query, [g], desc: g.played_at, desc: g.id)
      end

    rows =
      page_query
      |> select([g], %{
        id: g.id,
        platform: g.platform,
        played_at: g.played_at,
        white_player: g.white_player,
        black_player: g.black_player
      })
      |> limit(^(@page_size + 1))
      |> Repo.all()

    games = rows |> Enum.take(@page_size) |> then(&if(newer_page, do: Enum.reverse(&1), else: &1))

    first = List.first(games)
    last = List.last(games)

    newer_count =
      if first && cursor do
        Repo.aggregate(
          where(
            query,
            [g],
            g.played_at > ^first.played_at or
              (g.played_at == ^first.played_at and g.id > ^first.id)
          ),
          :count,
          :id
        )
      else
        0
      end

    first_number = if first, do: newer_count + 1, else: 0
    last_number = if first, do: newer_count + length(games), else: 0

    %{
      games: games,
      total: total,
      first_number: first_number,
      last_number: last_number,
      previous_cursor: if(first && first_number > 1, do: encode_cursor(first)),
      next_cursor: if(last && last_number < total, do: encode_cursor(last)),
      summaries: summaries(user_id, Enum.map(games, & &1.id)),
      studies: studies,
      platform: platform,
      period: period,
      status: status,
      study_id: study_id
    }
  end

  def get_owned!(user_id, id), do: Repo.get_by!(UserGame, id: id, user_id: user_id)

  def summaries(_user_id, []), do: %{}

  def summaries(user_id, game_ids) do
    Repo.all(
      from sg in StudyGame,
        join: s in Study,
        on: s.id == sg.study_id,
        where: sg.user_game_id in ^game_ids and s.user_id == ^user_id,
        order_by: [asc: s.title],
        select: %{
          game_id: sg.user_game_id,
          study_id: sg.study_id,
          study_title: s.title,
          status: sg.status,
          depth: sg.depth
        }
    )
    |> Enum.group_by(& &1.game_id)
  end

  defp allowed(value, options), do: if(value in options, do: value)

  defp encode_cursor(game) do
    Base.url_encode64("#{DateTime.to_iso8601(game.played_at)}|#{game.id}", padding: false)
  end

  defp decode_cursor(nil), do: nil

  defp decode_cursor(cursor) when is_binary(cursor) and byte_size(cursor) <= 128 do
    with {:ok, decoded} <- Base.url_decode64(cursor, padding: false),
         [at_text, id_text] <- String.split(decoded, "|"),
         {:ok, at, 0} <- DateTime.from_iso8601(at_text),
         {id, ""} when id > 0 <- Integer.parse(id_text) do
      {at, id}
    else
      _ -> nil
    end
  end

  defp decode_cursor(_), do: nil
end
