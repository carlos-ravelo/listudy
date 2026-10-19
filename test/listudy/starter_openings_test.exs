defmodule Listudy.StarterOpeningsTest do
  use Listudy.DataCase
  import ExUnit.CaptureIO

  alias Listudy.Openings
  alias Listudy.Openings.Opening

  test "starter openings populate the name selector without replacing administrator edits" do
    catalog = File.read!("priv/repo/data/common_openings.json") |> Jason.decode!(keys: :atoms)
    first = hd(catalog.openings)

    existing =
      Repo.get_by(Opening, name: first.name) ||
        Repo.insert!(Opening.changeset(%Opening{}, first))

    {:ok, edited} =
      Openings.update_opening(existing, %{description: "Administrator's description"})

    capture_io(fn -> Code.eval_file("priv/repo/seed_openings.exs") end)
    selector = Openings.list_openings_study_form()
    names = Enum.map(selector, & &1.name)
    assert length(catalog.openings) == 10
    assert Enum.all?(catalog.openings, &(&1.name in names))
    assert names == Enum.sort(names)
    assert Repo.get!(Opening, edited.id).description == "Administrator's description"

    assert capture_io(fn -> Code.eval_file("priv/repo/seed_openings.exs") end) =~ "0 added"
    assert Openings.list_openings_study_form() == selector
  end
end
