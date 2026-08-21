defmodule Listudy.Progress.UserSetting do
  use Ecto.Schema
  import Ecto.Changeset

  schema "user_settings" do
    field :key, :string
    field :value, :string
    # The alias here assumes your User schema is at Listudy.Accounts.User
    # This is standard for projects generated with phx.gen.auth.
    belongs_to :user, Listudy.Accounts.User

    timestamps()
  end

  def changeset(user_setting, attrs) do
    user_setting
    |> cast(attrs, [:key, :value, :user_id])
    |> validate_required([:key, :user_id])
  end
end