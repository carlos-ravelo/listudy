defmodule Listudy.Games.AnalysisComparison do
  @moduledoc """
  Groups equally ranked chapters that give the same comparison for a played game.
  Unplayed continuations can differ; matched moves and reported departures cannot.
  """

  def groups(choices) do
    choices
    |> Enum.sort_by(fn {study, result} ->
      {study.title, study.id, result["chapter_index"]}
    end)
    |> Enum.group_by(&comparison_key/1)
    |> Enum.map(fn {_, chapters} ->
      {study, result} = hd(chapters)
      %{result: result, color: study.color, chapters: chapters}
    end)
    |> Enum.sort_by(fn %{chapters: [{study, result} | _]} ->
      {study.title, study.id, result["chapter_index"]}
    end)
  end

  defp comparison_key({study, result}) do
    outcome =
      result
      |> Map.take(["reason", "deviation", "fen", "ply", "played", "entry_ply", "transposed"])
      |> Map.put("expected", Enum.sort(result["expected"] || []))
      |> Map.put(
        "earlier_departures",
        Enum.map(result["earlier_departures"] || [], fn event ->
          Map.update!(event, "expected", &Enum.sort/1)
        end)
      )

    # Older payloads cannot prove that the matched section is identical.
    matched = result["matched_plies"] || {study.id, result["chapter_index"]}
    {study.color, matched, outcome}
  end
end
