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
     owner_conn: Pow.Plug.assign_current_user(conn, owner, []),
     other_conn: Pow.Plug.assign_current_user(conn, other, [])}
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
