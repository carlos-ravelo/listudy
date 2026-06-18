defmodule Listudy.Repo.Migrations.CreateUserGames do
  use Ecto.Migration

  def change do
    create table(:user_games) do
      add :user_id, references(:users, on_delete: :delete_all), null: false
      add :platform, :string, null: false
      add :game_id_on_platform, :string, null: false
      add :pgn, :text, null: false
      add :white_player, :string
      add :black_player, :string
      add :result, :string
      add :played_at, :utc_datetime

      timestamps()
    end

    create unique_index(:user_games, [:platform, :game_id_on_platform])
    create index(:user_games, [:user_id])
  end
end