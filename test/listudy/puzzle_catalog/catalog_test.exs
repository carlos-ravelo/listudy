defmodule Listudy.PuzzleCatalogTest do
  use Listudy.DataCase
  alias Listudy.{PuzzleCatalog, Repo, Tactics}
  alias Listudy.Tactics.Tactic

  test "batched CSV import preserves source, applies the setup move and deduplicates retries" do
    path = Path.expand("test/fixtures/puzzles/lichess.csv")
    {:ok, job} = PuzzleCatalog.enqueue(path, "lichess.csv")
    on_exit(fn -> File.rm(job.path) end)
    assert %{status: "completed", inserted: 2, processed: 2} = PuzzleCatalog.run_pending()
    puzzle = Repo.get_by!(Tactic, source: "lichess", source_id: "00sHx")
    assert puzzle.rating == 1760
    assert puzzle.themes == ["mate", "mateIn2", "middlegame", "short"]
    assert puzzle.last_move == "e8d7"
    assert puzzle.fen == "q5nr/1ppknQpp/3p4/1P2p3/4P3/B1PP1b2/B5PP/5K2 w - - 1 18"
    assert puzzle.color == "white"
    assert puzzle.moves == "Be6+ Kd8 Qf8#"
    assert puzzle.source_moves == "e8d7 a2e6 d7d8 f7f8"
    assert puzzle.played == 0
    Tactics.increase_played(puzzle.id)
    {:ok, retry} = PuzzleCatalog.enqueue(path, "lichess.csv")
    on_exit(fn -> File.rm(retry.path) end)
    assert %{status: "completed", inserted: 0, processed: 2} = PuzzleCatalog.run_pending()
    assert Repo.get!(Tactic, puzzle.id).played == 1
    assert Repo.aggregate(Tactic, :count) >= 2
  end

  test "theme and original rating filter intersect and single-puzzle pools remain playable" do
    puzzle =
      Repo.insert!(%Tactic{
        source: "lichess",
        source_id: "fixture",
        themes: ["fork", "pin"],
        rating: 1650
      })

    filters =
      PuzzleCatalog.filters(%{"theme" => "fork", "min_rating" => "1600", "max_rating" => "1700"})

    assert PuzzleCatalog.select(filters).id == puzzle.id
    assert PuzzleCatalog.select(filters, puzzle.id).id == puzzle.id
    assert PuzzleCatalog.select(%{filters | "theme" => "mate"}) == nil
    assert PuzzleCatalog.select(%{filters | "min_rating" => 1800}) == nil
  end

  test "daily selection and uniform sampling tolerate empty catalogs and gaps in ids" do
    Repo.delete_all(Tactic)
    assert Tactics.daily_tactic() == nil
    assert Tactics.get_random_tactic() == nil
    first = Repo.insert!(%Tactic{id: 900_001, rating: 1000})
    second = Repo.insert!(%Tactic{id: 990_001, rating: 1600})

    for day <- 1..20 do
      assert Tactics.daily_tactic(Date.new!(2026, 10, day)).id in [first.id, second.id]
    end

    assert Tactics.daily_tactic() == Tactics.daily_tactic()
    assert Tactics.get_random_tactic(first.id).id == second.id
    assert Tactics.get_random_easy_tactic().id == first.id
  end

  test "malformed CSV fails without inserting records" do
    path =
      Path.join(System.tmp_dir!(), "invalid-puzzles-#{System.unique_integer([:positive])}.csv")

    File.write!(path, "hello,world\n1,2\n")
    {:ok, job} = PuzzleCatalog.enqueue(path, "invalid.csv")

    on_exit(fn ->
      File.rm(path)
      File.rm(job.path)
    end)

    assert %{status: "failed", inserted: 0, error: error} = PuzzleCatalog.run_pending()
    assert error =~ "required Lichess columns"
  end
end
