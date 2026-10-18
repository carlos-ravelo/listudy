defmodule ListudyWeb.TacticsLibraryTest do
  use ListudyWeb.ConnCase

  alias Listudy.{Repo, Studies}
  alias Listudy.Studies.Study

  defp user do
    id = System.unique_integer([:positive])
    Repo.insert!(%Listudy.Users.User{username: "Tactics#{id}", email: "tactics#{id}@example.com"})
  end

  defp collection(user, attrs \\ %{}) do
    prefix = "tacticstest#{System.unique_integer([:positive])}"

    study =
      Repo.insert!(
        struct(
          Study,
          Map.merge(
            %{
              user_id: user.id,
              title: "Book exercises",
              description: "A collection of exercises from a book",
              slug: prefix <> "-book",
              color: "white",
              private: true,
              training_kind: "tactics"
            },
            attrs
          )
        )
      )

    path = "priv/static/study_pgn/#{prefix}.pgn"

    File.write!(path, """
    [Event "Black to play"]
    [SetUp "1"]
    [FEN "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"]

    1... e5 {Black controls the centre} 2. Nf3 Nc6 *
    """)

    on_exit(fn -> File.rm(path) end)
    study
  end

  defp preview(name, html) do
    if directory = System.get_env("LISTUDY_TACTICS_PREVIEW") do
      File.mkdir_p!(directory)
      File.write!(Path.join(directory, name <> ".html"), html)
    end
  end

  test "studies manage both training kinds while tactics stays focused on puzzles", %{
    conn: conn
  } do
    owner = user()
    other = user()
    own = collection(owner)
    repertoire = collection(owner, %{title: "Opening repertoire", training_kind: "repertoire"})
    saved = collection(other, %{title: "Saved tactics", private: false})
    inaccessible = collection(other, %{title: "Private tactics"})

    for study <- [saved, inaccessible] do
      Repo.insert!(%Listudy.StudyFavorites.StudyFavorite{user_id: owner.id, study_id: study.id})
    end

    auth = Pow.Plug.assign_current_user(conn, owner, [])
    html = auth |> get("/en/tactics") |> html_response(200)
    assert html =~ "Your collections"
    assert html =~ "data-study-library"
    assert html =~ "Book exercises"
    assert html =~ "Saved tactics"
    refute html =~ "Private tactics"
    refute html =~ "Opening repertoire"
    assert html =~ "/en/tactics/collections/#{own.slug}"
    assert html =~ "kind=tactics"
    assert html =~ "/en/tactics/puzzles/start"
    preview("library", html)
    collections = auth |> get("/en/tactics?source=collections") |> html_response(200)
    preview("library-collections", collections)
    studies = auth |> get("/en/studies") |> html_response(200)
    assert studies =~ repertoire.title
    assert studies =~ own.title
    assert studies =~ saved.title
    refute studies =~ inaccessible.title
    assert studies =~ "data-library-kind"
    refute studies =~ "data-library-help"
    assert [_] = Floki.find(studies, "[data-study-id='#{own.id}'] .study-library-menu a[data-method='delete']")
    preview("studies", studies)
    assert Enum.map(Listudy.StudyLibrary.daily_studies(owner.id), & &1.id) == [repertoire.id]

    html = auth |> get("/en/tactics/collections/#{own.slug}") |> html_response(200)
    assert html =~ ~s(data-training-kind="tactics")
    assert html =~ "Black controls the centre"
    assert html =~ "hidden disabled"
    preview("collection", html)
    edit_html = auth |> get("/en/studies/#{own.slug}/edit") |> html_response(200)
    preview("edit", edit_html)
    auth |> get("/en/tactics/collections/#{repertoire.slug}") |> html_response(404)
    conn |> get("/en/tactics/collections/#{own.slug}") |> html_response(404)
    conn |> get("/en/tactics/collections/#{saved.slug}") |> html_response(200)

    result =
      auth
      |> init_test_session(%{last_study_slug: repertoire.slug, last_study_user_id: owner.id})
      |> get("/en/tactics/collections/#{own.slug}")

    assert get_session(result, :last_study_slug) == repertoire.slug
    # Existing study links remain usable after classification.
    auth |> get("/en/studies/#{own.slug}") |> html_response(200)
  end

  test "guest library is usable and import selects tactics without changing the normal import", %{
    conn: conn
  } do
    html = conn |> get("/en/tactics") |> html_response(200)
    assert html =~ "Your collections"
    assert html =~ "/en/tactics/puzzles/start"
    preview("empty", html)
    auth = Pow.Plug.assign_current_user(conn, user(), [])
    html = auth |> get("/en/studies/new?kind=tactics") |> html_response(200)
    assert html =~ "Create tactics"
    assert html =~ "study_pgn"
    assert Floki.find(html, "#study_description[required], #study_description[minlength]") == []
    assert [_] = Floki.find(html, "input[type='radio'][name='study[training_kind]'][value='tactics'][checked]")
    preview("import", html)
    normal = auth |> get("/en/studies/new") |> html_response(200)
    assert [_] = Floki.find(normal, "input[type='radio'][name='study[training_kind]'][value='repertoire'][checked]")
  end

  test "tactics collections are excluded from repertoire discovery and game comparison" do
    owner = user()
    collection(owner, %{title: "Exclusive tactics catalogue", private: false})
    assert Studies.search_by_title("Exclusive tactics catalogue", "newest") == []
    assert {:error, :no_match} = Listudy.Games.Analyzer.analyze_single_pgn(owner.id, "1. e4 e5 *")
  end

  test "a PGN upload creates a tactics collection through the existing importer", %{conn: conn} do
    owner = user()
    source = collection(owner)
    source_path = "priv/static/study_pgn/#{hd(String.split(source.slug, "-"))}.pgn"
    original = File.read!(source_path)

    upload_path =
      Path.join(System.tmp_dir!(), "tactics-upload-#{System.unique_integer([:positive])}.pgn")

    File.write!(upload_path, original)

    upload = %Plug.Upload{
      path: upload_path,
      filename: "book.pgn",
      content_type: "application/x-chess-pgn"
    }

    result =
      conn
      |> Pow.Plug.assign_current_user(owner, [])
      |> post("/en/studies", %{
        "study" => %{
          "pgn" => upload,
          "title" => "Imported tactics",
          "description" => "",
          "color" => "white",
          "private" => "true",
          "training_kind" => "tactics"
        }
      })

    imported = Repo.get_by!(Study, user_id: owner.id, title: "Imported tactics")
    path = "priv/static/study_pgn/#{hd(String.split(imported.slug, "-"))}.pgn"

    on_exit(fn ->
      File.rm(path)
      File.rm(upload_path)
    end)

    assert imported.training_kind == "tactics"
    assert is_nil(imported.description)

    conn
    |> Pow.Plug.assign_current_user(owner, [])
    |> get(redirected_to(result))
    |> html_response(200)

    assert redirected_to(result) == "/en/tactics/collections/#{imported.slug}"
    assert File.read!(path) == original
  end

  test "classification keeps the PGN and existing progress, and only the owner can change it", %{
    conn: conn
  } do
    owner = user()
    study = collection(owner, %{training_kind: "repertoire"})
    prefix = hd(String.split(study.slug, "-"))
    path = "priv/static/study_pgn/#{prefix}.pgn"
    original = File.read!(path)
    key = prefix <> "_chapter_stats"
    Repo.insert!(%Listudy.Progress.UserSetting{user_id: owner.id, key: key, value: "{}"})

    params = %{
      "study" => %{
        "title" => study.title,
        "description" => "",
        "training_kind" => "tactics"
      }
    }

    conn
    |> Pow.Plug.assign_current_user(user(), [])
    |> put("/en/studies/#{study.slug}", params)
    |> html_response(302)

    assert Studies.get_study!(study.id).training_kind == "repertoire"

    result =
      conn |> Pow.Plug.assign_current_user(owner, []) |> put("/en/studies/#{study.slug}", params)

    updated = Studies.get_study!(study.id)
    assert updated.training_kind == "tactics"
    assert is_nil(updated.description)
    assert Study.changeset(updated, %{description: "A"}).valid?
    assert redirected_to(result) == "/en/tactics/collections/#{updated.slug}"
    assert File.read!(path) == original
    assert Repo.get_by!(Listudy.Progress.UserSetting, user_id: owner.id, key: key).value == "{}"
    {:ok, copy} = Studies.clone_study(updated, owner.id, "Copy")
    assert copy.training_kind == "tactics"
    File.rm!("priv/static/study_pgn/#{hd(String.split(copy.slug, "-"))}.pgn")
    refute Study.changeset(updated, %{training_kind: "unknown"}).valid?
    refute Study.changeset(updated, %{training_kind: nil}).valid?
  end
end
