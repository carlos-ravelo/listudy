defmodule ListudyWeb.AnalysisView do
  use ListudyWeb, :view

  def analysis_platform_label("chess_com"), do: "Chess.com"
  def analysis_platform_label("lichess"), do: "Lichess"
  def analysis_platform_label(platform), do: platform

  def analysis_status_label("match"), do: "No trainable deviation"
  def analysis_status_label("deviation"), do: "Deviation from study"
  def analysis_status_label("ambiguous"), do: "Several possible chapters"
  def analysis_status_label("out_of_scope"), do: "No matching chapter"
  def analysis_status_label("error"), do: "Comparison unavailable"
  def analysis_status_label(status), do: status

  def primary_game_result(summaries) do
    Enum.find_value(~w(deviation ambiguous match out_of_scope error), fn status ->
      Enum.find(summaries, &(&1.status == status))
    end)
  end

  def comparison_groups(choices), do: Listudy.Games.AnalysisComparison.groups(choices)

  def chapter_path(conn, study, result) do
    params = [chapter_index: result["chapter_index"]]

    # The parser synthesizes this label for missing Event headers. The study
    # page translates its own fallback, so only named chapters get a title guard.
    params =
      if result["chapter"] == "Chapter #{result["chapter_index"] + 1}",
        do: params,
        else: Keyword.put(params, :chapter, result["chapter"])

    Routes.study_path(conn, :show, conn.assigns[:locale] || "en", study.slug, params)
  end

  def move_label(fen) do
    [_, turn, _, _, _, number] = String.split(fen)
    number <> if(turn == "w", do: ".", else: "...")
  end

  def comparison_feedback(result, color) do
    cond do
      result["deviation"] and player_to_move?(result["fen"], color) ->
        {:player, "⚠️ You deviated"}

      result["deviation"] ->
        {:opponent, "🚨 Your opponent deviated"}

      result["reason"] == "book_ended" ->
        {:book_end, "📘 Repertoire line ended"}

      true ->
        {:game_end, "✓ Game ended in a repertoire position"}
    end
  end

  def comparison_actor(fen, color) do
    if player_to_move?(fen, color), do: "You", else: "Opponent"
  end

  def comparison_move_summary(result) do
    if result["deviation"] do
      "#{move_label(result["fen"])} #{result["played"]}"
    else
      "Position #{move_label(result["fen"])}"
    end
  end

  defp player_to_move?(fen, color) do
    side = if Enum.at(String.split(fen), 1) == "w", do: "white", else: "black"
    side == color
  end
end
