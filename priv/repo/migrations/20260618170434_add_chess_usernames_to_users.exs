defmodule Listudy.Repo.Migrations.AddChessUsernamesToUsers do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :lichess_username, :string
      add :chess_com_username, :string
    end
  end
end
