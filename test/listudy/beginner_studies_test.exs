defmodule Listudy.BeginnerStudiesTest do
  use ListudyWeb.ConnCase

  import Ecto.Query
  alias Listudy.Repo

  alias Listudy.Seeds.BeginnerStudies
  alias Listudy.Openings.Opening
  alias Listudy.Studies.Study

  setup do
    owner =
      Repo.insert!(%Listudy.Users.User{username: "ItalianSeed", email: "italian@example.com"})

    openings = File.read!("priv/repo/data/common_openings.json") |> Jason.decode!()

    for attributes <- openings["openings"] do
      Repo.get_by(Opening, slug: attributes["slug"]) ||
        Repo.insert!(Opening.changeset(%Opening{}, attributes))
    end

    directory = Path.join(System.tmp_dir!(), "listudy-italian-#{Ecto.UUID.generate()}")
    on_exit(fn -> File.rm_rf!(directory) end)
    {:ok, owner: owner, directory: directory}
  end

  test "preserves opening associations and installs uncategorized tactics with original PGNs", %{
    owner: owner,
    directory: directory
  } do
    assert {:ok, installed} = BeginnerStudies.seed(owner.id, directory)
    assert length(installed) == 10
    assert Enum.count(installed, fn {_, study} -> study.color == "black" end) == 2

    for {:created, study} <- installed do
      source = BeginnerStudies.source_for(study.slug)
      assert study.user_id == owner.id
      opening_slug = source["opening_slug"] || "uncategorized"
      assert study.opening_id == Repo.get_by!(Opening, slug: opening_slug).id
      assert study.color == source["color"]
      assert study.training_kind == (source["training_kind"] || "repertoire")
      assert study.description =~ "Source annotators:"
      refute study.private

      file_id = study.slug |> String.split("-") |> hd()
      pgn = File.read!(Path.join(directory, file_id <> ".pgn"))
      assert Listudy.StudyPgn.revision(pgn) == source["sha256"]

      if source["source_pgn_file"] do
        original = File.read!(Path.join("priv/repo/data/studies", source["source_pgn_file"]))
        assert Listudy.StudyPgn.revision(original) == source["source_sha256"]

        normalized =
          Enum.reduce(source["fen_normalizations"], original, fn change, text ->
            String.replace(text, change["original_fen"], change["import_fen"])
          end)

        assert pgn == normalized
      end

      assert {:ok, %{"editor" => %{"chapters" => chapters}}} =
               Listudy.Games.ChessEngine.editor(pgn)

      assert length(chapters) == length(source["chapters"])
      ids = Enum.map(chapters, & &1["headers"]["ChapterURL"])
      assert length(Enum.uniq(ids)) == length(chapters)

      if study.training_kind == "repertoire" do
        chapter_ids = Enum.map(chapters, & &1["headers"]["ListudyChapterId"])
        assert Enum.all?(chapter_ids, &is_binary/1)
        assert length(Enum.uniq(chapter_ids)) == length(chapters)
      end

      for {chapter, original} <- Enum.zip(chapters, source["chapters"]) do
        assert chapter["headers"]["Annotator"] == original["annotator"]
        assert chapter["headers"]["ChapterURL"] == original["chapter_url"]

        if study.training_kind == "repertoire" do
          assert chapter["fen"] == "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        else
          assert chapter["headers"]["SetUp"] == "1"
          assert chapter["fen"] == chapter["headers"]["FEN"]
        end

        assert chapter["root"] != []
      end
    end
  end

  test "repeat runs preserve the study identity, owner edits and PGN", %{
    owner: owner,
    directory: directory
  } do
    {:ok, [{:created, study} | _]} = BeginnerStudies.seed(owner.id, directory)
    {:ok, edited} = Listudy.Studies.update_study(study, %{title: "My Italian", private: true})
    path = Path.join(directory, "seeditalian02.pgn")
    File.write!(path, "Owner's edited PGN")

    assert {:ok, [{:existing, existing} | others]} = BeginnerStudies.seed(owner.id, directory)
    assert Enum.all?(others, &match?({:existing, _}, &1))
    assert existing.id == edited.id
    assert existing.title == "My Italian"
    assert existing.private
    assert File.read!(path) == "Owner's edited PGN"
    assert Repo.aggregate(from(s in Study, where: s.slug == ^study.slug), :count) == 1
  end

  test "all five uncategorized tactics collections open in the trainer", %{
    owner: owner,
    directory: directory
  } do
    assert {:ok, installed} = BeginnerStudies.seed(owner.id, directory)
    tactics = Enum.filter(installed, fn {_, study} -> study.training_kind == "tactics" end)
    assert length(tactics) == 5

    for {:created, study} <- tactics do
      source = BeginnerStudies.source_for(study.slug)
      file_id = study.slug |> String.split("-") |> hd()
      pgn = File.read!(Path.join(directory, file_id <> ".pgn"))
      unique_id = Ecto.UUID.generate() |> String.replace("-", "")
      path = Path.join("priv/static/study_pgn", unique_id <> ".pgn")
      File.write!(path, pgn, [:exclusive])
      on_exit(fn -> File.rm(path) end)
      {:ok, study} = Listudy.Studies.update_study(study, %{slug: unique_id <> "-woodpecker"})

      html =
        build_conn()
        |> get(Routes.tactics_collection_path(build_conn(), :tactics_collection, "en", study))
        |> html_response(200)

      assert html =~ "data-training-kind=\"tactics\""
      assert html =~ "Uncategorized"
      assert html =~ source["title"]
    end
  end

  test "an existing file is preserved and no study is inserted", %{
    owner: owner,
    directory: directory
  } do
    File.mkdir_p!(directory)
    path = Path.join(directory, "seeditalian02.pgn")
    File.write!(path, "Unrelated PGN")
    before = Repo.aggregate(Study, :count)

    assert {:error, {:pgn_file, :eexist}} = BeginnerStudies.italian(owner.id, directory)
    assert File.read!(path) == "Unrelated PGN"
    assert Repo.aggregate(Study, :count) == before
  end
end
