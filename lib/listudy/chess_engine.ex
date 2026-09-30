defmodule Listudy.Games.ChessEngine do
  @moduledoc """
  JSON boundary to the Python repertoire index and position matcher.
  Each batch parses a game once and compares it with all requested studies.
  """

  # Keep in step with chess_analysis/repertoire.py when matching semantics change.
  @analysis_version "positions-v3"

  def fingerprint(pgn) do
    :crypto.hash(:sha256, @analysis_version <> "\0" <> pgn) |> Base.encode16(case: :lower)
  end

  def analyze_batch(studies, games) do
    run("batch", Jason.encode!(%{studies: studies, games: games}))
  end

  def training_chapters(pgn, mistakes) do
    positions = Enum.map(mistakes, &Map.take(&1, [:fen, :expected]))
    run("training_chapters", Jason.encode!(%{pgn: pgn, mistakes: positions}))
  end

  defp run(mode, input) do
    path =
      Path.join(
        System.tmp_dir!(),
        "listudy-analysis-#{Base.encode16(:crypto.strong_rand_bytes(12), case: :lower)}.json"
      )

    try do
      File.write!(path, "", [:exclusive])
      File.chmod!(path, 0o600)
      File.write!(path, input)
      script = Application.app_dir(:listudy, "priv/python/pgn_parser.py")
      python = Application.get_env(:listudy, :analysis_python, "python3")

      case System.cmd(python, [script, mode, path]) do
        {output, 0} ->
          case Jason.decode(output) do
            {:ok, %{"games" => games} = data} when mode == "batch" and is_list(games) ->
              {:ok, data}

            {:ok, %{"chapters" => chapters} = data}
            when mode == "training_chapters" and is_list(chapters) ->
              {:ok, data}

            _ ->
              {:error, "The chess parser returned an invalid response."}
          end

        {output, _} ->
          case Jason.decode(output) do
            {:ok, %{"error" => reason}} -> {:error, reason}
            _ -> {:error, "The chess parser failed."}
          end
      end
    rescue
      error -> {:error, Exception.message(error)}
    after
      File.rm(path)
    end
  end
end
