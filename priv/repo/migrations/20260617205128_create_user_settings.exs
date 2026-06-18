defmodule Listudy.Repo.Migrations.CreateUserSettings do
  use Ecto.Migration

  def change do
    create table(:user_settings) do
      add :key, :string, null: false
      # Usamos :text en lugar de :string porque los _tree de PGN pueden ser gigantes
      add :value, :text
      add :user_id, references(:users, on_delete: :delete_all), null: false

      timestamps()
    end

    # Este índice único es vital porque en el controlador usamos 
    # `on_conflict: :replace_all` basado en :user_id y :key
    create unique_index(:user_settings, [:user_id, :key])
  end
end

