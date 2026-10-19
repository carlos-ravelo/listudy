# Run independently with: mix run priv/repo/seed_openings.exs
# Names and moves: lichess-org/chess-openings (CC0); see data/common_openings.json.
alias Listudy.Openings.Opening
alias Listudy.Repo

catalog =
  __DIR__
  |> Path.join("data/common_openings.json")
  |> File.read!()
  |> Jason.decode!(keys: :atoms)

now = NaiveDateTime.utc_now() |> NaiveDateTime.truncate(:second)

rows =
  Enum.map(catalog.openings, fn attributes ->
    %Opening{}
    |> Opening.changeset(attributes)
    |> Ecto.Changeset.apply_action!(:insert)
    |> Map.from_struct()
    |> Map.take(Map.keys(attributes))
    |> Map.merge(%{inserted_at: now, updated_at: now})
  end)

{:ok, inserted} =
  Repo.transaction(fn ->
    {inserted, _} = Repo.insert_all(Opening, rows, on_conflict: :nothing)
    image_directory = Application.app_dir(:listudy, "priv/static/images/opening")
    File.mkdir_p!(image_directory)
    generator = Path.expand("../../scripts/action/svg_generator.py", __DIR__)

    for attributes <- catalog.openings do
      opening =
        Repo.get_by(Opening, name: attributes.name) ||
          Repo.get_by!(Opening, slug: attributes.slug)

      image = Path.join(image_directory, opening.slug <> ".svg")

      unless File.exists?(image) do
        {output, status} =
          System.cmd("python3", [generator, "--output", image, "--pgn", opening.moves])

        if status != 0, do: raise("Could not generate #{opening.name}: #{output}")
      end
    end

    inserted
  end)

IO.puts("Openings: #{inserted} added; existing names, slugs and edits preserved.")
