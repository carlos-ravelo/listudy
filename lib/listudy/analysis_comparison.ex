defmodule Listudy.Games.AnalysisComparison do
  @moduledoc """
  Groups equally ranked chapters that give the same comparison for a played game.
  Unplayed continuations can differ; matched moves and reported departures cannot.
  """

  def rank(choices, library) do
    choices
    |> Enum.sort_by(fn {study, result} ->
      location = get_in(library, ["studies", to_string(study.id), "location"]) || "daily"
      {if(location == "daily", do: 0, else: 1), study.id, result["chapter_index"]}
    end)
    |> Enum.sort_by(fn {_, result} -> result["score"] end, :desc)
  end

  def groups(choices) do
    by_comparison = Enum.group_by(choices, &comparison_key/1)

    choices
    |> Enum.map(&comparison_key/1)
    |> Enum.uniq()
    |> Enum.map(fn key ->
      chapters = Map.fetch!(by_comparison, key)
      {study, result} = hd(chapters)
      %{result: result, color: study.color, chapters: chapters}
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
