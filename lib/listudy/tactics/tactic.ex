defmodule Listudy.Tactics.Tactic do
  use Ecto.Schema
  import Ecto.Changeset

  schema "tactics" do
    field :source, :string, default: "listudy"
    field :source_id, :string
    field :source_fen, :string
    field :source_moves, :string
    field :themes, {:array, :string}, default: []
    field :opening_tags, {:array, :string}, default: []
    field :rating_deviation, :integer
    field :popularity, :integer
    field :source_plays, :integer
    field :color, :string
    field :description, :string
    field :fen, :string
    field :link, :string
    field :moves, :string
    field :last_move, :string
    field :played, :integer, default: 0
    field :rating, :integer, default: 1500
    field :white, :id
    field :black, :id
    field :event, :id
    field :opening, :id
    field :motif, :id

    timestamps()
  end

  @doc false
  def changeset(tactic, attrs) do
    tactic
    |> cast(attrs, [
      :fen,
      :moves,
      :last_move,
      :color,
      :link,
      :description,
      :rating,
      :played,
      :motif,
      :opening,
      :event,
      :white,
      :black
    ])
    |> validate_required([
      :fen,
      :moves,
      :last_move,
      :color,
      :rating,
      :played,
      :motif,
      :opening,
      :event,
      :white,
      :black
    ])
    |> Ecto.Changeset.validate_inclusion(:color, ["black", "white"])
  end
end
