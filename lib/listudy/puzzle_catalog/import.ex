defmodule Listudy.PuzzleCatalog.Import do
  use Ecto.Schema

  schema "puzzle_imports" do
    field :filename, :string
    field :path, :string
    field :status, :string, default: "queued"
    field :limit, :integer, default: 50000
    field :processed, :integer, default: 0
    field :inserted, :integer, default: 0
    field :skipped, :integer, default: 0
    field :error, :string
    timestamps()
  end
end
