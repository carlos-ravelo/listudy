defmodule Listudy.Repo.Migrations.ScopeImportedGamesAndIndexRecentGames do
  use Ecto.Migration

  def change do
    # Two Listudy users can legitimately import the same public chess game.
    drop unique_index(:user_games, [:platform, :game_id_on_platform])
    create unique_index(:user_games, [:user_id, :platform, :game_id_on_platform])

    create index(:user_games, [:user_id, :played_at, :id])
    create index(:user_games, [:user_id, :platform, :played_at, :id])
    create index(:study_games, [:user_game_id, :study_id])

    create table(:game_syncs) do
      add :user_id, references(:users, on_delete: :delete_all), null: false
      add :platform, :string, null: false
      add :status, :string, null: false
      add :details, :text
      timestamps()
    end

    create unique_index(:game_syncs, [:user_id, :platform])
  end
end
