defmodule Listudy.Repo.Migrations.CreateDeviations do
  use Ecto.Migration

  def change do
    create table(:deviations) do
      add :user_game_id, references(:user_games, on_delete: :delete_all), null: false
      add :study_id, references(:studies, on_delete: :delete_all), null: false
      add :ply_number, :integer, null: false
      add :expected_move, :string, null: false
      add :played_move, :string, null: false
      add :position_fen, :string, null: false

      timestamps(updated_at: false)
    end

    create index(:deviations, [:user_game_id])
    create index(:deviations, [:study_id])
  end
end