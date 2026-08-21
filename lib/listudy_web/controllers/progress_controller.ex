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
  def sync(conn, %{"key" => key, "value" => value}) do
    # This depends on your auth implementation. Pow/phx.gen.auth puts it here.
    user = Pow.Plug.current_user(conn) || conn.assigns[:current_user]

    with {:ok, _} <- upsert_setting(user, key, value) do
      json(conn, %{status: "ok"})
    end
  end

  @doc """
  Fetches all synchronized settings for the current user as a key-value map.
  This can be used on page load to hydrate `localStorage`.
  """
  def index(conn, _params) do
    user = Pow.Plug.current_user(conn) || conn.assigns[:current_user]

    settings =
      Repo.all(from s in UserSetting, where: s.user_id == ^user.id)
      |> Enum.into(%{}, fn s -> {s.key, s.value} end)

    json(conn, settings)
  end

  defp upsert_setting(user, key, value) do
    %UserSetting{}
    |> UserSetting.changeset(%{user_id: user.id, key: key, value: value})
    |> Repo.insert(
      on_conflict: [set: [value: value, updated_at: NaiveDateTime.truncate(NaiveDateTime.utc_now(), :second)]],
      conflict_target: [:user_id, :key]
    )
  end
end