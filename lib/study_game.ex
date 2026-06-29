defmodule Listudy.Games.StudyGame do
  use Ecto.Schema
  import Ecto.Changeset

  schema "study_games" do
    field :status, :string
    field :depth, :integer, default: 0 # <-- Agregamos el campo
    belongs_to :study, Listudy.Studies.Study
    belongs_to :user_game, Listudy.Games.UserGame

    timestamps()
  end

  def changeset(study_game, attrs) do
    study_game
    |> cast(attrs, [:status, :study_id, :user_game_id, :depth])
    |> validate_required([:status, :study_id, :user_game_id])
    |> validate_inclusion(:status, ["match", "deviation", "error", "out_of_scope"])
    |> unique_constraint([:study_id, :user_game_id])
  end
end
