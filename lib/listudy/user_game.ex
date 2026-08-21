defmodule Listudy.Games.UserGame do
  use Ecto.Schema
  import Ecto.Changeset

  schema "user_games" do
    field :platform, :string
    field :game_id_on_platform, :string
    field :pgn, :string
    field :white_player, :string
    field :black_player, :string
    field :result, :string
    field :played_at, :utc_datetime

    belongs_to :user, Listudy.Users.User # <-- Cámbialo si tu módulo se llama diferente (ej: Listudy.User)
    has_many :deviations, Listudy.Games.Deviation

    timestamps()
  end

  def changeset(user_game, attrs) do
    user_game
    |> cast(attrs, [:platform, :game_id_on_platform, :pgn, :white_player, :black_player, :result, :played_at, :user_id])
    |> validate_required([:platform, :game_id_on_platform, :pgn, :user_id])
    |> unique_constraint([:platform, :game_id_on_platform])
  end
end