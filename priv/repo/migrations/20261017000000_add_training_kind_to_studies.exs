defmodule Listudy.Repo.Migrations.AddTrainingKindToStudies do
  use Ecto.Migration

  def change do
    alter table(:studies) do
      add :training_kind, :string, null: false, default: "repertoire"
    end

    create constraint(:studies, :studies_training_kind_check,
             check: "training_kind IN ('repertoire', 'tactics')"
           )
  end
end
