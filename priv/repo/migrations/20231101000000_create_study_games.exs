defmodule Listudy.Repo.Migrations.CreateStudyGames do
  use Ecto.Migration

  def change do
    create table(:study_games) do
      add :status, :string, null: false
      add :study_id, references(:studies, on_delete: :delete_all), null: false
      add :user_game_id, references(:user_games, on_delete: :delete_all), null: false

      timestamps()
    end

    create unique_index(:study_games, [:study_id, :user_game_id])
  end
end