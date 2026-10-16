defmodule Listudy.StudyLibrary do
  import Ecto.Query
  alias Listudy.{Repo, Studies}
  alias Listudy.Progress.UserSetting

  @key "study_library_v1"
  @empty %{"version" => 1, "groups" => %{}, "studies" => %{}}

  def fetch(user_id) when is_integer(user_id) and user_id > 0 do
    value =
      Repo.one(
        from s in UserSetting, where: s.user_id == ^user_id and s.key == @key, select: s.value
      )

    case value && Jason.decode(value) do
      {:ok, %{"version" => 1, "groups" => groups, "studies" => studies} = data}
      when is_map(groups) and is_map(studies) ->
        data

      _ ->
        @empty
    end
  end

  def fetch(_), do: @empty

  def daily_studies(user_id) when is_integer(user_id) and user_id > 0 do
    settings = fetch(user_id)

    (Studies.get_study_by_user!(user_id) ++ Studies.get_studies_by_favorite!(user_id))
    |> Enum.uniq_by(& &1.id)
    |> Enum.filter(fn study ->
      entry = Map.get(settings["studies"], Integer.to_string(study.id), %{})
      Map.get(entry, "location", "daily") == "daily"
    end)
  end

  def daily_studies(_), do: []

  def most_used(user_id, studies) when is_integer(user_id) and user_id > 0 do
    keys = Map.new(studies, &{hd(String.split(&1.slug, "-")) <> "_chapter_stats", &1.id})

    Repo.all(
      from s in UserSetting,
        where: s.user_id == ^user_id and s.key in ^Map.keys(keys),
        select: {s.key, s.value}
    )
    |> Enum.map(fn {key, value} -> {keys[key], training_time(value)} end)
    |> Enum.filter(fn {_, time} -> time > 0 end)
    |> Enum.max_by(fn {id, time} -> {time, -id} end, fn -> {nil, 0} end)
    |> elem(0)
  end

  def most_used(_, _), do: nil

  defp training_time(value) do
    with {:ok, %{"studySessions" => sessions}} <- Jason.decode(value),
         true <- is_map(sessions) do
      Enum.reduce(sessions, 0, fn
        {_, %{"activeMs" => time}}, total when is_number(time) and time > 0 -> total + time
        _, total -> total
      end)
    else
      _ -> 0
    end
  end

  def update(user_id, operation) do
    Repo.transaction(fn ->
      Repo.query!("SELECT pg_advisory_xact_lock(hashtext($1))", ["study-library:#{user_id}"])

      case apply_operation(fetch(user_id), operation, user_id) do
        {:ok, data} ->
          changeset =
            UserSetting.changeset(%UserSetting{}, %{
              user_id: user_id,
              key: @key,
              value: Jason.encode!(data)
            })

          Repo.insert!(changeset,
            on_conflict: [
              set: [
                value: Jason.encode!(data),
                updated_at: NaiveDateTime.truncate(NaiveDateTime.utc_now(), :second)
              ]
            ],
            conflict_target: [:user_id, :key]
          )

          data

        {:error, reason} ->
          Repo.rollback(reason)
      end
    end)
  end

  defp apply_operation(data, %{"action" => "move", "study_ids" => ids} = operation, user_id)
       when is_list(ids) and length(ids) in 1..500 do
    ids = Enum.map(ids, &study_id/1) |> Enum.uniq()

    allowed =
      (Studies.get_study_by_user!(user_id) ++ Studies.get_studies_by_favorite!(user_id))
      |> MapSet.new(& &1.id)

    location = operation["location"]
    group = operation["group"]

    cond do
      Enum.any?(ids, &(is_nil(&1) or not MapSet.member?(allowed, &1))) ->
        {:error, :forbidden}

      Map.has_key?(operation, "location") and location not in ~w(daily library) ->
        {:error, :invalid}

      Map.has_key?(operation, "group") and not is_nil(group) and
          not Map.has_key?(data["groups"], group) ->
        {:error, :invalid}

      not Map.has_key?(operation, "location") and not Map.has_key?(operation, "group") ->
        {:error, :invalid}

      true ->
        studies =
          Enum.reduce(ids, data["studies"], fn id, studies ->
            key = Integer.to_string(id)
            entry = Map.get(studies, key, %{"location" => "daily", "group" => nil})

            entry =
              if Map.has_key?(operation, "location"),
                do: Map.put(entry, "location", location),
                else: entry

            entry =
              if Map.has_key?(operation, "group"), do: Map.put(entry, "group", group), else: entry

            Map.put(studies, key, entry)
          end)

        {:ok, Map.put(data, "studies", studies)}
    end
  end

  defp apply_operation(data, %{"action" => "create_group", "name" => name}, _) do
    if map_size(data["groups"]) < 50 and valid_name?(data["groups"], name) do
      {:ok, put_in(data, ["groups", Ecto.UUID.generate()], String.trim(name))}
    else
      {:error, :group_name}
    end
  end

  defp apply_operation(data, %{"action" => "rename_group", "group" => id, "name" => name}, _) do
    if Map.has_key?(data["groups"], id) and valid_name?(Map.delete(data["groups"], id), name) do
      {:ok, put_in(data, ["groups", id], String.trim(name))}
    else
      {:error, :group_name}
    end
  end

  defp apply_operation(data, %{"action" => "delete_group", "group" => id}, _) do
    if Map.has_key?(data["groups"], id) do
      studies =
        Map.new(data["studies"], fn {key, entry} ->
          {key, if(entry["group"] == id, do: Map.put(entry, "group", nil), else: entry)}
        end)

      {:ok, %{data | "groups" => Map.delete(data["groups"], id), "studies" => studies}}
    else
      {:error, :invalid}
    end
  end

  defp apply_operation(_, _, _), do: {:error, :invalid}

  defp study_id(id) when is_integer(id) and id > 0, do: id

  defp study_id(id) when is_binary(id) do
    case Integer.parse(id) do
      {number, ""} when number > 0 -> number
      _ -> nil
    end
  end

  defp study_id(_), do: nil

  defp valid_name?(groups, name) when is_binary(name) do
    trimmed = String.trim(name)

    String.length(trimmed) in 1..60 and
      Enum.all?(groups, fn {_, existing} ->
        String.downcase(existing) != String.downcase(trimmed)
      end)
  end

  defp valid_name?(_, _), do: false
end
