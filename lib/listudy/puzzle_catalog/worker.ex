defmodule Listudy.PuzzleCatalog.Worker do
  use GenServer
  require Logger

  def start_link(opts), do: GenServer.start_link(__MODULE__, opts, name: __MODULE__)

  def init(_) do
    schedule()
    {:ok, nil}
  end

  def handle_info(:work, state) do
    if Application.get_env(:listudy, :puzzle_import_worker, true) do
      try do
        Listudy.PuzzleCatalog.run_pending()
      rescue
        error -> Logger.error("Puzzle import worker: #{Exception.message(error)}")
      end
    end

    schedule()
    {:noreply, state}
  end

  defp schedule, do: Process.send_after(self(), :work, 5000)
end
