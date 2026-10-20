defmodule Mix.Tasks.Puzzles.Import do
  use Mix.Task
  @shortdoc "Queue a local Lichess CSV/CSV.zst import (default: 50,000 balanced puzzles)"

  def run(args) do
    {opts, paths, invalid} = OptionParser.parse(args, strict: [limit: :integer, run: :boolean])

    if invalid != [] or length(paths) != 1,
      do: Mix.raise("Usage: mix puzzles.import FILE.csv[.zst] [--limit 50000] [--run]")

    limit = Keyword.get(opts, :limit, 50000)
    unless limit in 1..50000, do: Mix.raise("Limit must be between 1 and 50000")
    Mix.Task.run("app.start")
    path = hd(paths)

    case Listudy.PuzzleCatalog.enqueue(path, Path.basename(path), limit) do
      {:ok, job} ->
        Mix.shell().info("Queued puzzle import ##{job.id}.")

        if opts[:run], do: run_queued(job.id)

      {:error, reason} ->
        Mix.raise("Import could not be queued: #{inspect(reason)}")
    end
  end

  defp run_queued(id) do
    case Listudy.PuzzleCatalog.run_pending() do
      {:error, :busy} ->
        Mix.raise("An import is already running; this job remains queued.")

      %Listudy.PuzzleCatalog.Import{id: ^id, status: "completed"} = job ->
        Mix.shell().info("Completed: #{job.processed} processed, #{job.inserted} inserted.")

      %Listudy.PuzzleCatalog.Import{id: ^id, status: "failed", error: error} ->
        Mix.raise(error)

      %Listudy.PuzzleCatalog.Import{} ->
        run_queued(id)

      nil ->
        Mix.shell().info("The background worker has already processed this queue.")
    end
  end
end
