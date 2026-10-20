defmodule ListudyWeb.ProgressController do
  use ListudyWeb, :controller

  import Ecto.Query, only: [from: 2]
  alias Listudy.Progress.UserSetting
  alias Listudy.Repo

  action_fallback ListudyWeb.FallbackController

  @doc """
  Upserts a key/value pair into the user_settings table for the authenticated user.
  It uses Postgres' ON CONFLICT DO UPDATE clause for robust upserts.
  """
  def sync(conn, %{"key" => "study_collections_v1"}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "Use the collections endpoint to save collections."})
  end

  def sync(conn, %{"key" => "study_library_v1"}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "Use the study library endpoint to organize studies."})
  end

  def sync(conn, %{"key" => key, "value" => value} = params)
      when is_binary(key) and is_binary(value) do
    user = Pow.Plug.current_user(conn) || conn.assigns[:current_user]

    if params["user_id"] && params["user_id"] not in [user.id, to_string(user.id)] do
      conn |> put_status(:forbidden) |> json(%{error: "The signed-in account changed."})
    else
      sync_value(conn, user, key, value, params)
    end
  end

  def sync(conn, _),
    do: conn |> put_status(:unprocessable_entity) |> json(%{error: "Invalid progress data."})

  defp sync_value(conn, user, key, value, params) do
    cond do
      String.ends_with?(key, "_tree") ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "PGN trees are reconstructed locally."})

      managed?(key) ->
        case save_progress(user.id, key, value, params["revision"]) do
          {:ok, result} ->
            json(conn, result)

          {:error, {:conflict, current}} ->
            conn |> put_status(:conflict) |> json(current)

          {:error, :invalid} ->
            conn |> put_status(:unprocessable_entity) |> json(%{error: "Invalid progress data."})
        end

      true ->
        with {:ok, _} <- upsert_setting(user, key, value), do: json(conn, %{status: "ok"})
    end
  end

  defp managed?(key), do: String.ends_with?(key, ["_chapter_stats", "_chapter_reviews"])
  defp revision(nil), do: ""
  defp revision(value), do: :crypto.hash(:sha256, value) |> Base.encode16(case: :lower)

  defp save_progress(user_id, key, value, expected) do
    with true <- byte_size(value) <= 5_000_000,
         {:ok, %{"version" => 1, "chapters" => chapters}} when is_map(chapters) <-
           Jason.decode(value) do
      Repo.transaction(fn ->
        Repo.query!("SELECT pg_advisory_xact_lock(hashtext($1))", ["progress:#{user_id}:#{key}"])
        current = Repo.one(from s in UserSetting, where: s.user_id == ^user_id and s.key == ^key)
        saved = if current, do: current.value, else: nil

        if expected != revision(saved),
          do: Repo.rollback({:conflict, %{value: saved, revision: revision(saved)}})

        user = %{id: user_id}

        case upsert_setting(user, key, value) do
          {:ok, _} -> %{status: "ok", revision: revision(value)}
          {:error, _} -> Repo.rollback(:invalid)
        end
      end)
    else
      _ -> {:error, :invalid}
    end
  end

  @doc """
  Fetches synchronized settings, optionally scoped to one study's progress.
  This can be used on page load to hydrate `localStorage`.
  """
  def index(conn, params) do
    user = Pow.Plug.current_user(conn) || conn.assigns[:current_user]

    query =
      from s in UserSetting,
        where:
          s.user_id == ^user.id and s.key not in ["study_collections_v1", "study_library_v1"] and
            not like(s.key, "%\\_tree"),
        select: {s.key, s.value}

    query =
      case params["study_id"] do
        study_id when is_binary(study_id) and byte_size(study_id) > 0 ->
          keys = [study_id <> "_chapter_stats", study_id <> "_chapter_reviews"]

          from s in query,
            where:
              s.key in ^keys or
                (not like(s.key, "%\\_chapter\\_stats") and
                   not like(s.key, "%\\_chapter\\_reviews"))

        _ ->
          query
      end

    settings =
      query
      |> Repo.all()
      |> Map.new()

    revisions =
      settings
      |> Enum.filter(fn {key, _} -> managed?(key) end)
      |> Map.new(fn {key, value} -> {key, revision(value)} end)

    json(
      conn,
      settings
      |> Map.put("_progress_revisions", revisions)
      |> Map.put("_progress_user_id", user.id)
    )
  end

  defp upsert_setting(user, key, value) do
    %UserSetting{}
    |> UserSetting.changeset(%{user_id: user.id, key: key, value: value})
    |> Repo.insert(
      on_conflict: [
        set: [value: value, updated_at: NaiveDateTime.truncate(NaiveDateTime.utc_now(), :second)]
      ],
      conflict_target: [:user_id, :key]
    )
  end
end
