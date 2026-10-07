defmodule Listudy.StudyPgn do
  alias Listudy.Games.ChessEngine

  def revision(pgn), do: :crypto.hash(:sha256, pgn) |> Base.encode16(case: :lower)

  def replace_chapter(path, expected_revision, index, tree) do
    locked(path, fn ->
      with {:ok, current} <- File.read(path),
           true <- revision(current) == expected_revision,
           {:ok, %{"pgn" => edited, "playback_index" => playback_index}} <-
             ChessEngine.replace_chapter(current, index, tree),
           :ok <- write_atomic(path, edited) do
        {:ok, playback_index}
      else
        false -> {:error, :conflict}
        error -> error
      end
    end)
  end

  def replace(path, pgn), do: locked(path, fn -> write_atomic(path, pgn) end)

  defp locked(path, operation) do
    :global.trans({{__MODULE__, Path.expand(path)}, self()}, operation)
  end

  defp write_atomic(path, pgn) do
    temporary = path <> "." <> Base.encode16(:crypto.strong_rand_bytes(12)) <> ".tmp"

    try do
      with :ok <- File.write(temporary, pgn, [:exclusive]),
           :ok <- File.rename(temporary, path) do
        :ok
      end
    after
      File.rm(temporary)
    end
  end
end
