defmodule Listudy.Repo.Migrations.AddPuzzleCatalog do
  use Ecto.Migration

  def change do
    alter table(:tactics) do
      modify :moves, :text, from: :string
      add :source, :string, null: false, default: "listudy"
      add :source_id, :string
      add :source_fen, :text
      add :source_moves, :text
      add :themes, {:array, :string}, null: false, default: []
      add :opening_tags, {:array, :string}, null: false, default: []
      add :rating_deviation, :integer
      add :popularity, :integer
      add :source_plays, :integer
    end

    create unique_index(:tactics, [:source, :source_id])
    create index(:tactics, [:themes], using: :gin)
    create index(:tactics, [:source, :rating, :id])
    create index(:tactics, [:rating, :id])

    create table(:puzzle_imports) do
      add :filename, :string, null: false
      add :path, :text, null: false
      add :status, :string, null: false, default: "queued"
      add :limit, :integer, null: false, default: 50000
      add :processed, :integer, null: false, default: 0
      add :inserted, :integer, null: false, default: 0
      add :skipped, :integer, null: false, default: 0
      add :error, :text
      timestamps()
    end
  end
end
