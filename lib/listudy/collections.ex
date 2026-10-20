defmodule Listudy.Collections do
  import Ecto.Query
  alias Listudy.{Repo, Studies}
  alias Listudy.Progress.UserSetting
  @key "study_collections_v1"
  @empty %{"active" => "Default", "collections" => %{"Default" => []}}

  def fetch(user_id) do
    value =
      Repo.one(
        from s in UserSetting, where: s.user_id == ^user_id and s.key == @key, select: s.value
      )

    %{data: if(value, do: Jason.decode!(value), else: @empty), revision: revision(value)}
  end

  def save(user_id, expected, data) do
    with :ok <- validate(data) do
      Repo.transaction(fn ->
        Repo.query!("SELECT pg_advisory_xact_lock(hashtext($1))", ["collections:#{user_id}"])
        current = fetch(user_id)
        if current.revision != expected, do: Repo.rollback(:conflict)
        value = Jason.encode!(data)

        changeset =
          UserSetting.changeset(%UserSetting{}, %{user_id: user_id, key: @key, value: value})

        Repo.insert!(changeset,
          on_conflict: [
            set: [
              value: value,
              updated_at: NaiveDateTime.truncate(NaiveDateTime.utc_now(), :second)
            ]
          ],
          conflict_target: [:user_id, :key]
        )

        %{data: data, revision: revision(value)}
      end)
    end
  end

  def validate(%{"active" => active, "collections" => collections} = data)
      when is_binary(active) and is_map(collections) do
    valid =
      map_size(collections) in 1..100 and Map.has_key?(collections, active) and
        byte_size(Jason.encode!(data)) <= 2_000_000 and
        Enum.all?(collections, fn {name, items} ->
          is_binary(name) and String.length(String.trim(name)) in 1..100 and is_list(items) and
            length(items) <= 500 and
            Enum.all?(items, fn item ->
              is_map(item) and is_binary(item["pgn"]) and byte_size(item["pgn"]) in 1..500_000 and
                Enum.all?(~w(title study studyPath), fn key ->
                  is_nil(item[key]) or (is_binary(item[key]) and String.length(item[key]) <= 500)
                end)
            end)
        end)

    if valid, do: :ok, else: {:error, :invalid}
  end

  def validate(_), do: {:error, :invalid}

  def create_study(user_id, expected, name, title, color)
      when is_binary(title) and color in ~w(white black) do
    current = fetch(user_id)
    items = current.data["collections"][name]

    cond do
      current.revision != expected ->
        {:error, :conflict}

      not is_list(items) or items == [] ->
        {:error, :empty}

      String.length(String.trim(title)) not in 3..100 ->
        {:error, :title}

      true ->
        with {:ok, %{"pgn" => pgn}} <- Listudy.Games.ChessEngine.collection_study(items) do
          id = Base.encode16(:crypto.strong_rand_bytes(6), case: :lower)
          path = Path.join("priv/static/study_pgn", id <> ".pgn")
          File.mkdir_p!(Path.dirname(path))

          with :ok <- File.write(path, pgn, [:exclusive]) do
            result =
              Studies.create_study(%{
                title: String.trim(title),
                slug: id <> "-" <> Listudy.Slug.slugify(title),
                user_id: user_id,
                private: true,
                color: color,
                description: "Created from a collection of #{length(items)} chapters."
              })

            if match?({:error, _}, result), do: File.rm(path)
            result
          end
        end
    end
  end

  def create_study(_, _, _, _, _), do: {:error, :invalid}

  defp revision(nil), do: ""
  defp revision(value), do: :crypto.hash(:sha256, value) |> Base.encode16(case: :lower)
end
