defmodule Listudy.Games.TrainingDeviations do
  @moduledoc """
  Select clear user-side departures for mistake training.
  Earlier departures may be move-order transpositions, so they are not exercises.
  """

  def events(nil, _color), do: []

  def events(result, color) do
    if result["deviation"] && user_departure?(result, color) do
      [normalize_event(result)]
    else
      []
    end
  end

  def outcome(result, color) do
    {
      result["deviation"],
      result["fen"],
      result["played"],
      Enum.sort(result["expected"] || []),
      events(result, color)
    }
  end

  defp user_departure?(event, color) do
    side = event["fen"] |> String.split() |> Enum.at(1)
    expected = event["expected"] || []

    event["played"] && expected != [] &&
      if(side == "w", do: "white", else: "black") == color
  end

  defp normalize_event(event) do
    %{
      fen: event["fen"],
      ply: event["ply"],
      played: event["played"],
      expected: event["expected"] |> Enum.uniq() |> Enum.sort()
    }
  end
end
