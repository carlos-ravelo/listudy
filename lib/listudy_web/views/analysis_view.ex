defmodule ListudyWeb.AnalysisView do
  use ListudyWeb, :view

  def analysis_platform_label("chess_com"), do: "Chess.com"
  def analysis_platform_label("lichess"), do: "Lichess"
  def analysis_platform_label(platform), do: platform

  def analysis_status_label("match"), do: "No own deviations detected"
  def analysis_status_label("deviation"), do: "You deviated"
  def analysis_status_label("ambiguous"), do: "Comparison needs review"
  def analysis_status_label("out_of_scope"), do: "No matching chapter"
  def analysis_status_label("error"), do: "Comparison unavailable"
  def analysis_status_label("other_match"), do: "Another study selected"
  def analysis_status_label(status), do: status

  def game_opponent(%{player_color: "white"} = game), do: "vs " <> (game.black_player || "Black")
  def game_opponent(%{player_color: "black"} = game), do: "vs " <> (game.white_player || "White")

  def game_opponent(game),
    do: (game.white_player || "White") <> " – " <> (game.black_player || "Black")

  def game_outcome(%{game_result: "1/2-1/2"}), do: "Draw"
  def game_outcome(%{game_result: "*"}), do: "Unfinished"

  def game_outcome(%{game_result: result, player_color: color})
      when result in ["1-0", "0-1"] and color in ["white", "black"] do
    if result == "1-0" == (color == "white"), do: "Won", else: "Lost"
  end

  def game_outcome(%{game_result: "1-0"}), do: "White won"
  def game_outcome(%{game_result: "0-1"}), do: "Black won"
  def game_outcome(_), do: "Result unavailable"

  def primary_game_result(summaries) do
    Enum.find_value(~w(deviation ambiguous match error out_of_scope other_match), fn status ->
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

  def practice_path(conn, study, result) do
    Routes.study_path(conn, :show, conn.assigns[:locale] || "en", study.slug,
      chapter_index: result["chapter_index"],
      chapter: result["chapter"],
      practice_fen: result["fen"],
      practice_expected: Enum.join(result["expected"], " / ")
    )
  end

  def move_label(fen) do
    [_, turn, _, _, _, number] = String.split(fen)
    number <> if(turn == "w", do: ".", else: "...")
  end

  def comparison_feedback(result, color) do
    cond do
      result["deviation"] and player_to_move?(result["fen"], color) ->
        {:player, "You left this line"}

      result["deviation"] ->
        {:opponent, "Opponent left this line"}

      result["reason"] == "book_ended" ->
        {:book_end, "Repertoire line ended"}

      true ->
        {:game_end, "Game ended in your repertoire"}
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
