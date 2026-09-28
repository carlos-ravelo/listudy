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

  def comparison_title(result) do
    cond do
      result["deviation"] ->
        "#{move_label(result["fen"])} #{result["played"]} · suggests #{Enum.join(result["expected"], " / ")}"

      result["reason"] == "book_ended" ->
        "Stored line ends before #{move_label(result["fen"])}"

      true ->
        "Game ends in a stored position"
    end
  end

  def moving_side(fen), do: if(Enum.at(String.split(fen), 1) == "w", do: "White", else: "Black")
end
