defmodule Listudy.Repo.Migrations.VersionStudyGameAnalysis do
  use Ecto.Migration

  def change do
    alter table(:study_games) do
      add :analysis_version, :string
    end
  end
end
