defmodule Listudy.Repo.Migrations.AddDepthToStudyGames do
  use Ecto.Migration

  def change do
    alter table(:study_games) do
      add :depth, :integer, default: 0
    end
  end
end
