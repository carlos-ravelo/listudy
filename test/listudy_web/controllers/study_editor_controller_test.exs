defmodule ListudyWeb.StudyEditorControllerTest do
  use ListudyWeb.ConnCase
  alias Listudy.Repo

  setup %{conn: conn} do
    owner =
      Repo.insert!(%Listudy.Users.User{
        username: "ChapterEditor",
        email: "chapter-editor@example.com"
      })

    other =
      Repo.insert!(%Listudy.Users.User{username: "OtherEditor", email: "other-editor@example.com"})

    file_id = "editor#{System.unique_integer([:positive])}"

    study =
      Repo.insert!(%Listudy.Studies.Study{
        title: "Editor study",
        description: "An editor test study",
        slug: file_id <> "-study",
        user_id: owner.id,
        private: true,
        color: "white"
      })

    path = Path.join("priv/static/study_pgn", file_id <> ".pgn")
    File.mkdir_p!(Path.dirname(path))
    pgn = "[Event \"Chapter (A)\"]\n\n1. e4 e5 *\n\n[Event \"Other\"]\n\n1. d4 d5 *\n"
    File.write!(path, pgn)
    on_exit(fn -> File.rm(path) end)

    {:ok,
     study: study,
     path: path,
     pgn: pgn,
     owner_user: owner,
     owner_conn: Pow.Plug.assign_current_user(conn, owner, []),
     other_conn: Pow.Plug.assign_current_user(conn, other, [])}
  end

  test "study page renders the collection dialog with the signed-in account", %{
    owner_conn: owner,
    study: study,
    owner_user: user
  } do
    html = owner |> get(Routes.study_path(owner, :show, "en", study)) |> html_response(200)
    assert html =~ "collection_modal"
    assert html =~ "data-user-id=\"#{user.id}\""
  end

  test "library renders owned studies with compact navigation", %{owner_conn: owner, study: study} do
    html = owner |> get(Routes.study_path(owner, :index, "en")) |> html_response(200)
    assert html =~ "data-study-library"
    assert html =~ "data-library-row"
    assert html =~ study.title
    assert html =~ Routes.study_path(owner, :edit, "en", study.slug)
  end

  test "only the owner can open and save the editor", %{
    conn: conn,
    other_conn: other,
    owner_conn: owner,
    study: study,
    path: path,
    pgn: pgn
  } do
    url = Routes.study_path(conn, :editor, "en", study)
    assert conn |> get(url) |> response(403) == "Forbidden"
    assert other |> get(url) |> response(403) == "Forbidden"
    assert owner |> get(url) |> html_response(200) =~ "chapter_editor"
    save_url = Routes.study_path(conn, :save_chapter, "en", study)
    assert other |> post(save_url, %{}) |> json_response(403) == %{"error" => "Forbidden"}
    assert File.read!(path) == pgn
  end

  test "maintenance is owner-only and saves reordered chapters", %{
    conn: conn,
    owner_conn: owner,
    other_conn: other,
    study: study,
    path: path,
    pgn: pgn,
    owner_user: user
  } do
    url = Routes.study_path(conn, :manage_chapters, "en", study)
    assert conn |> post(url, %{}) |> json_response(403) == %{"error" => "Forbidden"}
    assert other |> post(url, %{}) |> json_response(403) == %{"error" => "Forbidden"}

    assert owner |> get(Routes.study_path(conn, :edit, "en", study)) |> html_response(200) =~
             "studyMaintenance"

    {:ok, %{"chapters" => chapters}} = Listudy.Games.ChessEngine.maintenance(pgn)
    params = %{revision: Listudy.StudyPgn.revision(pgn), chapters: Enum.reverse(chapters)}

    response =
      owner
      |> recycle()
      |> Pow.Plug.assign_current_user(user, [])
      |> post(url, params)
      |> json_response(200)

    assert response["url"] == Routes.study_path(conn, :edit, "en", study)
    saved = File.read!(path)
    assert saved =~ "ListudyChapterId"

    assert owner
           |> recycle()
           |> Pow.Plug.assign_current_user(user, [])
           |> post(url, params)
           |> json_response(409)

    assert File.read!(path) == saved
  end

  test "save validates moves, preserves other chapters and rejects stale revisions", %{
    owner_conn: conn,
    study: study,
    path: path,
    pgn: pgn
  } do
    {:ok, %{"editor" => %{"chapters" => [chapter | _]}}} = Listudy.Games.ChessEngine.editor(pgn)
    tree = Map.put(chapter, "comment", "A new introduction")
    params = %{revision: Listudy.StudyPgn.revision(pgn), chapter_index: 0, tree: tree}
    url = Routes.study_path(conn, :save_chapter, "en", study)

    result =
      conn
      |> put_req_header("content-type", "application/json")
      |> post(url, Jason.encode!(params))
      |> json_response(200)

    assert result["url"] =~ "chapter_index=0"
    saved = File.read!(path)
    assert saved =~ "A new introduction"
    assert saved =~ "[Event \"Other\"]\n\n1. d4 d5 *\n"

    assert conn
           |> put_req_header("content-type", "application/json")
           |> post(url, Jason.encode!(params))
           |> json_response(409)

    assert File.read!(path) == saved

    invalid = %{
      params
      | revision: Listudy.StudyPgn.revision(saved),
        tree: %{root: [%{move: "e5", children: []}]}
    }

    assert conn
           |> put_req_header("content-type", "application/json")
           |> post(url, Jason.encode!(invalid))
           |> json_response(422)

    assert File.read!(path) == saved
  end
end
