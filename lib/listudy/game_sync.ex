defmodule Listudy.Games.GameSync do
  use Ecto.Schema
  import Ecto.Query
  alias Listudy.Repo

  @stale_seconds 2 * 60 * 60
  @checking "Checking for new games..."

  schema "game_syncs" do
    field :platform, :string
    field :status, :string
    field :details, :string
    belongs_to :user, Listudy.Users.User
    timestamps()
  end

  def for_user(user_id) do
    Repo.all(from s in __MODULE__, where: s.user_id == ^user_id)
    |> Map.new(fn sync -> {sync.platform, visible_status(sync)} end)
  end

  # The conflict clause makes concurrent clicks start only one sync per account.
  # A stale running row can be retried after an interrupted server process.
  def start(user_id, platform) do
    now = NaiveDateTime.truncate(NaiveDateTime.utc_now(), :second)
    stale_before = NaiveDateTime.add(now, -@stale_seconds, :second)

    sql = """
    INSERT INTO game_syncs (user_id, platform, status, details, inserted_at, updated_at)
    VALUES ($1, $2, 'running', $3, $4, $4)
    ON CONFLICT (user_id, platform) DO UPDATE
    SET status = 'running', details = EXCLUDED.details, updated_at = EXCLUDED.updated_at
    WHERE game_syncs.status <> 'running' OR game_syncs.updated_at < $5
    RETURNING id
    """

    case Repo.query!(sql, [user_id, platform, @checking, now, stale_before]) do
      %{num_rows: 1} -> :started
      %{num_rows: 0} -> :already_running
    end
  end

  def progress(user_id, platform, details) do
    Repo.update_all(
      from(s in __MODULE__,
        where: s.user_id == ^user_id and s.platform == ^platform and s.status == "running"
      ),
      set: [
        details: details,
        updated_at: NaiveDateTime.truncate(NaiveDateTime.utc_now(), :second)
      ]
    )
  end

  def touch(user_id, platform) do
    Repo.update_all(
      from(s in __MODULE__,
        where: s.user_id == ^user_id and s.platform == ^platform and s.status == "running"
      ),
      set: [updated_at: NaiveDateTime.truncate(NaiveDateTime.utc_now(), :second)]
    )
  end

  def finish(user_id, platform, status, details) do
    Repo.update_all(
      from(s in __MODULE__,
        where: s.user_id == ^user_id and s.platform == ^platform and s.status == "running"
      ),
      set: [
        status: status,
        details: details,
        updated_at: NaiveDateTime.truncate(NaiveDateTime.utc_now(), :second)
      ]
    )
  end

  defp visible_status(%{status: "running", updated_at: updated_at} = sync) do
    stale_before = NaiveDateTime.add(NaiveDateTime.utc_now(), -@stale_seconds, :second)

    if NaiveDateTime.compare(updated_at, stale_before) == :lt do
      %{sync | status: "failed", details: "Sync was interrupted. Try again."}
    else
      sync
    end
  end

  defp visible_status(sync), do: sync
end
