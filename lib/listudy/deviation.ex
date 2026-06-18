defmodule Listudy.Games.Deviation do
  use Ecto.Schema
  import Ecto.Changeset

  schema "deviations" do
    field :ply_number, :integer
    field :expected_move, :string
    field :played_move, :string
    field :position_fen, :string

    belongs_to :user_game, Listudy.Games.UserGame
    belongs_to :study, Listudy.Studies.Study

    timestamps(updated_at: false)
  end

  def changeset(deviation, attrs) do
    deviation
    |> cast(attrs, [:ply_number, :expected_move, :played_move, :position_fen, :user_game_id, :study_id])
    |> validate_required([:ply_number, :expected_move, :played_move, :position_fen, :user_game_id, :study_id])
  end
end