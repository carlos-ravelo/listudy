defmodule Listudy.StudyPgnTest do
  use ExUnit.Case
  alias Listudy.StudyPgn
  alias Listudy.Games.ChessEngine

  setup do
    path = Path.join(System.tmp_dir!(), "editor-test-#{System.unique_integer([:positive])}.pgn")
    pgn = "[Event \"First\"]\n\n1. e4 e5 *\n\n[Event \"Second\"]\n\n1. d4 d5 *\n"
    File.write!(path, pgn)
    on_exit(fn -> File.rm(path) end)
    {:ok, path: path, pgn: pgn}
  end

  test "only one save from a shared revision succeeds", %{path: path, pgn: pgn} do
    {:ok, %{"editor" => %{"chapters" => [chapter | _]}}} = ChessEngine.editor(pgn)
    tree = Map.put(chapter, "comment", "New comment")
    revision = StudyPgn.revision(pgn)

    results =
      1..2
      |> Enum.map(fn _ ->
        Task.async(fn -> StudyPgn.replace_chapter(path, revision, 0, tree) end)
      end)
      |> Enum.map(&Task.await(&1, 15000))

    assert Enum.count(results, &(&1 == {:ok, 0})) == 1
    assert {:error, :conflict} in results
    assert File.read!(path) =~ "New comment"
    assert File.read!(path) =~ "[Event \"Second\"]\n\n1. d4 d5 *\n"
  end

  test "invalid edits leave the saved file unchanged", %{path: path, pgn: pgn} do
    tree = %{"root" => [%{"move" => "e5", "children" => []}], "comment" => ""}
    assert {:error, _} = StudyPgn.replace_chapter(path, StudyPgn.revision(pgn), 0, tree)
    assert File.read!(path) == pgn
  end

  test "maintenance retains stable identities and rejects stale or invalid saves", %{
    path: path,
    pgn: pgn
  } do
    {:ok, %{"chapters" => chapters}} = ChessEngine.maintenance(pgn)
    revision = StudyPgn.revision(pgn)
    assert {:ok, :saved} = StudyPgn.manage_chapters(path, revision, Enum.reverse(chapters))
    saved = File.read!(path)
    {:ok, %{"chapters" => reordered}} = ChessEngine.maintenance(saved)
    assert Enum.map(reordered, & &1["id"]) == Enum.map(Enum.reverse(chapters), & &1["id"])
    assert {:error, :conflict} = StudyPgn.manage_chapters(path, revision, chapters)
    assert {:error, _} = StudyPgn.manage_chapters(path, StudyPgn.revision(saved), [])
    assert File.read!(path) == saved
  end

  test "an uploaded replacement invalidates an open editor", %{path: path, pgn: pgn} do
    assert :ok = StudyPgn.replace(path, "1. c4 e5 *")
    assert {:error, :conflict} = StudyPgn.replace_chapter(path, StudyPgn.revision(pgn), 0, %{})
    assert File.read!(path) == "1. c4 e5 *"
  end
end
