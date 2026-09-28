defmodule Listudy.Games.GameSync do
  use Ecto.Schema
  import Ecto.Query
  alias Listudy.Repo

  schema "game_syncs" do
    field :platform, :string
    field :status, :string
    field :details, :string
    belongs_to :user, Listudy.Users.User
    timestamps()
  end

  def for_user(user_id) do
    Repo.all(from s in __MODULE__, where: s.user_id == ^user_id)
    |> Map.new(&{&1.platform, &1})
  end

  def start(user_id, platform) do
    now = NaiveDateTime.truncate(NaiveDateTime.utc_now(), :second)

    Repo.insert_all(
      __MODULE__,
      [
        %{
          user_id: user_id,
          platform: platform,
          status: "running",
          details: nil,
          inserted_at: now,
          updated_at: now
        }
      ],
      on_conflict: [set: [status: "running", details: nil, updated_at: now]],
      conflict_target: [:user_id, :platform]
    )
  end

  def finish(user_id, platform, status, details) do
    Repo.update_all(
      from(s in __MODULE__, where: s.user_id == ^user_id and s.platform == ^platform),
      set: [
        status: status,
        details: details,
        updated_at: NaiveDateTime.truncate(NaiveDateTime.utc_now(), :second)
      ]
    )
  end
end
