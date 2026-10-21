defmodule ListudyWeb.StudyCreationTest do
  use ListudyWeb.ConnCase
  alias Listudy.Repo

  setup %{conn: conn} do
    n = System.unique_integer([:positive])

    user =
      Repo.insert!(%Listudy.Users.User{username: "Creator#{n}", email: "creator#{n}@example.com"})

    {:ok, conn: Pow.Plug.assign_current_user(conn, user, []), user: user}
  end

  test "creation offers a board first and retains import", %{conn: conn} do
    catalog = File.read!("priv/repo/data/common_openings.json") |> Jason.decode!(keys: :atoms)

    for attributes <- Enum.take(catalog.openings, 3) do
      Repo.get_by(Listudy.Openings.Opening, name: attributes.name) ||
        Repo.insert!(Listudy.Openings.Opening.changeset(%Listudy.Openings.Opening{}, attributes))
    end

    for kind <- ["repertoire", "tactics"] do
      html = conn |> get("/en/studies/new?kind=#{kind}") |> html_response(200)
      assert html =~ "Start on the board"
      assert html =~ "source=blank"
      assert html =~ "study_pgn"
      assert [_, _] = html_find(html, ".study-create-options > .study-create-card")
      assert [_] = html_find(html, ".study-create-card #study_lichess_study")
      assert [_] = html_find(html, ".study-create-card .study-create-legal")
      assert [_] = html_find(html, ".study-create-fields #study_title")
      assert [_] = html_find(html, ".study-form-actions a[href='/en/studies']")
      assert [_] = html_find(html, "#study_opening_picker.ui-modal")
      assert html =~ "/css/bootstrap_management.css"
      assert html =~ "/js/bootstrap_management.js"
      refute html =~ "/css/app.css"
      refute html =~ "/js/app.js"
      assert [_] = html_find(html, "input#study_opening_id[type='hidden']")
      assert [] = html_find(html, "select#study_opening_id")
      assert [] = html_find(html, ".study-create details, .study-create .one-third")

      if dir = System.get_env("LISTUDY_CREATE_FORM_PREVIEW") do
        File.mkdir_p!(dir)
        File.write!(Path.join(dir, kind <> ".html"), html)
      end
    end
  end

  test "blank repertoire and exercise share the chapter editor", %{conn: conn} do
    for kind <- ["repertoire", "tactics"] do
      html = conn |> get("/en/studies/new?source=blank&kind=#{kind}") |> html_response(200)
      assert html =~ ~s(data-draft="true")
      assert html =~ "/css/bootstrap_editor.css"
      assert html =~ "/js/bootstrap_editor.js"
      refute html =~ "/js/app.js"
      assert html =~ ~s(data-kind="#{kind}")
      assert html =~ "Set up a position"
      assert html =~ "Engine analysis"

      if dir = System.get_env("LISTUDY_CREATE_PREVIEW") do
        File.mkdir_p!(dir)
        File.write!(Path.join(dir, kind <> ".html"), html)
      end
    end
  end

  test "creating a private exercise preserves the position, comments and solution", %{
    conn: conn,
    user: user
  } do
    pgn = "[SetUp \"1\"]\n[FEN \"7k/5K2/6Q1/8/8/8/8/8 w - - 0 1\"]\n\n1. Qg7# {Mating net} *"

    result =
      conn
      |> post("/en/studies", %{
        draft: %{title: "My first exercise", training_kind: "tactics", pgn: pgn}
      })
      |> json_response(200)

    slug = result["url"] |> String.split("/") |> Enum.at(-2)
    study = Listudy.Studies.get_study_by_slug!(slug)
    assert study.user_id == user.id
    assert study.private
    assert study.training_kind == "tactics"
    path = "priv/static/study_pgn/#{hd(String.split(study.slug, "-"))}.pgn"
    on_exit(fn -> File.rm(path) end)
    assert File.read!(path) =~ "Qg7#"
    assert File.read!(path) =~ "Mating net"
    assert File.read!(path) =~ "ListudyChapterId"

    assert conn
           |> recycle()
           |> Pow.Plug.assign_current_user(user, [])
           |> get(result["url"])
           |> html_response(200) =~ "data-draft=\"false\""
  end

  test "rejects empty and invalid solutions without creating records", %{conn: conn} do
    count = Repo.aggregate(Listudy.Studies.Study, :count)

    for pgn <- ["*", "1. e5 *", "[SetUp \"1\"]\n[FEN \"8/8/8/8/8/8/8/8 w - - 0 1\"]\n\n*"] do
      assert conn
             |> post("/en/studies", %{
               draft: %{title: "Invalid study", training_kind: "repertoire", pgn: pgn}
             })
             |> json_response(422)
    end

    assert Repo.aggregate(Listudy.Studies.Study, :count) == count
  end
end
