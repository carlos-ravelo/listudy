defmodule Listudy.Seeds.BeginnerStudies do
  alias Listudy.{Repo, Studies}
  alias Listudy.Games.ChessEngine
  alias Listudy.Openings.Opening
  alias Listudy.Studies.Study
  alias Listudy.Users.User

  @catalog_path Path.expand("../../../priv/repo/data/studies/catalog.json", __DIR__)
  @external_resource @catalog_path
  @catalog Jason.decode!(File.read!(@catalog_path))["studies"]

  def catalog, do: @catalog
  def source_for(slug), do: Enum.find(@catalog, &(&1["slug"] == slug))

  def seed(owner_id, directory \\ "priv/static/study_pgn") do
    Enum.reduce_while(@catalog, {:ok, []}, fn entry, {:ok, installed} ->
      case install(entry, owner_id, directory) do
        {:ok, result} -> {:cont, {:ok, installed ++ [result]}}
        {:error, reason} -> {:halt, {:error, {entry["id"], reason}}}
      end
    end)
  end

  def italian(owner_id, directory \\ "priv/static/study_pgn") do
    install(Enum.find(@catalog, &(&1["id"] == "italian")), owner_id, directory)
  end

  defp install(entry, owner_id, directory) do
    Repo.get!(User, owner_id)
    slug = entry["slug"]

    # Serialize repeat runs even when they are launched by separate BEAM instances.
    Repo.transaction(fn ->
      Repo.query!("SELECT pg_advisory_xact_lock(hashtext($1))", [slug])

      case Repo.get_by(Study, slug: slug) do
        nil -> insert_study(entry, owner_id, directory)
        study -> {:existing, study}
      end
    end)
  end

  defp insert_study(entry, owner_id, directory) do
    opening = Repo.get_by!(Opening, slug: entry["opening_slug"])

    pgn =
      Application.app_dir(:listudy, "priv/repo/data/studies/" <> entry["pgn_file"])
      |> File.read!()

    unless Listudy.StudyPgn.revision(pgn) == entry["sha256"],
      do: Repo.rollback(:source_checksum_mismatch)

    case ChessEngine.editor(pgn) do
      {:ok, %{"editor" => %{"chapters" => chapters}}} ->
        unless length(chapters) == length(entry["chapters"]) and
                 Enum.all?(chapters, &(&1["root"] != [])),
               do: Repo.rollback(:invalid_pgn)

      _ ->
        Repo.rollback(:invalid_pgn)
    end

    File.mkdir_p!(directory)
    file_id = entry["slug"] |> String.split("-") |> hd()
    path = Path.join(directory, file_id <> ".pgn")

    # Never replace an existing PGN, including a file left behind by an interrupted run.
    case File.write(path, pgn, [:exclusive]) do
      :ok ->
        result =
          Studies.create_study(%{
            title: entry["title"],
            description: entry["description"],
            slug: entry["slug"],
            color: entry["color"],
            training_kind: "repertoire",
            private: false,
            user_id: owner_id,
            opening_id: opening.id
          })

        case result do
          {:ok, study} ->
            {:created, study}

          {:error, reason} ->
            File.rm!(path)
            Repo.rollback(reason)
        end

      {:error, reason} ->
        Repo.rollback({:pgn_file, reason})
    end
  end
end
