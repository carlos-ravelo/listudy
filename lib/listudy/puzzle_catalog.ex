defmodule Listudy.PuzzleCatalog do
  import Ecto.Query
  alias Listudy.Repo
  alias Listudy.Tactics.Tactic
  alias Listudy.PuzzleCatalog.Import

  def imports, do: Repo.all(from i in Import, order_by: [desc: i.id], limit: 20)

  def directory do
    Application.get_env(:listudy, :puzzle_import_directory, "var/puzzle_imports") |> Path.expand()
  end

  def enqueue(path, filename, limit \\ 50000) when limit in 1..50000 do
    File.mkdir_p!(directory())

    destination =
      Path.join(
        directory(),
        Base.url_encode64(:crypto.strong_rand_bytes(18), padding: false) <>
          if(String.ends_with?(String.downcase(filename), ".zst"), do: ".csv.zst", else: ".csv")
      )

    with :ok <- File.cp(path, destination) do
      case Repo.insert(%Import{path: destination, filename: Path.basename(filename), limit: limit}) do
        {:ok, job} ->
          {:ok, job}

        error ->
          File.rm(destination)
          error
      end
    end
  end

  # A session lock serializes workers and CLI processes, including across nodes.
  # Batches commit independently; retries deduplicate by the source identity.
  def run_pending do
    Repo.checkout(
      fn ->
        %{rows: [[locked]]} = Repo.query!("SELECT pg_try_advisory_lock(174629, 50000)")

        if locked do
          try do
            job =
              Repo.one(
                from i in Import,
                  where: i.status in ["queued", "running"],
                  order_by: i.id,
                  limit: 1
              )

            if job, do: run(job)
          after
            Repo.query!("SELECT pg_advisory_unlock(174629, 50000)")
          end
        else
          {:error, :busy}
        end
      end,
      timeout: :infinity
    )
  end

  defp update_job(job, attrs), do: job |> Ecto.Changeset.change(attrs) |> Repo.update!()

  defp run(job) do
    output = job.path <> ".jsonl"

    try do
      job = update_job(job, status: "running", error: nil)
      python = Application.get_env(:listudy, :analysis_python, "python3")
      script = Application.app_dir(:listudy, "priv/python/puzzle_catalog.py")

      case System.cmd(python, [script, job.path, output, "--limit", to_string(job.limit)]) do
        {summary, 0} ->
          stats = Jason.decode!(summary)
          initial = {0, job.inserted}

          {processed, inserted} =
            output
            |> File.stream!()
            |> Stream.map(&decode_row/1)
            |> Stream.chunk_every(500)
            |> Enum.reduce(initial, fn rows, {processed, inserted} ->
              {:ok, totals} =
                Repo.transaction(fn ->
                  {count, _} =
                    Repo.insert_all(Tactic, rows,
                      on_conflict: :nothing,
                      conflict_target: [:source, :source_id]
                    )

                  totals = {processed + length(rows), inserted + count}
                  update_job(job, processed: elem(totals, 0), inserted: elem(totals, 1))
                  totals
                end)

              totals
            end)

          update_job(job,
            status: "completed",
            processed: processed,
            inserted: inserted,
            skipped: stats["rejected"]
          )

        {message, _} ->
          reason =
            case Jason.decode(message) do
              {:ok, %{"error" => error}} -> error
              _ -> "CSV preparation failed. Check Python chess and zstd installation."
            end

          update_job(job, status: "failed", error: String.slice(reason, 0, 1000))
      end
    rescue
      error ->
        update_job(job, status: "failed", error: String.slice(Exception.message(error), 0, 1000))
    after
      File.rm(output)
    end
  end

  @fields ~w(source source_id source_fen source_moves fen color moves last_move rating rating_deviation popularity source_plays themes opening_tags link played)a
  defp decode_row(line) do
    data = Jason.decode!(line)
    now = NaiveDateTime.utc_now() |> NaiveDateTime.truncate(:second)

    Enum.reduce(@fields, %{inserted_at: now, updated_at: now}, fn key, attrs ->
      Map.put(attrs, key, Map.fetch!(data, Atom.to_string(key)))
    end)
  end

  def themes do
    Repo.query!(
      "SELECT theme, count(*) FROM tactics, unnest(themes) AS theme WHERE source = 'lichess' GROUP BY theme ORDER BY theme"
    ).rows
  end

  def filters(params) do
    %{
      "theme" =>
        if(is_binary(params["theme"]), do: String.slice(params["theme"], 0, 80), else: ""),
      "min_rating" => rating(params["min_rating"], 0),
      "max_rating" => rating(params["max_rating"], 4000)
    }
  end

  defp rating(value, default) when is_binary(value) do
    case Integer.parse(value) do
      {number, ""} when number in 0..4000 -> number
      _ -> default
    end
  end

  defp rating(_, default), do: default

  def query(filters) do
    query =
      from t in Tactic,
        where:
          t.source == "lichess" and t.rating >= ^filters["min_rating"] and
            t.rating <= ^filters["max_rating"]

    case filters["theme"] do
      "" -> query
      theme -> from t in query, where: fragment("? @> ARRAY[?]::varchar[]", t.themes, ^theme)
    end
  end

  def count(filters), do: Repo.aggregate(query(filters), :count, :id)

  def select(filters, previous \\ -1) do
    base = query(filters)

    Listudy.Tactics.sample(from(t in base, where: t.id != ^previous)) ||
      Listudy.Tactics.sample(base)
  end
end
