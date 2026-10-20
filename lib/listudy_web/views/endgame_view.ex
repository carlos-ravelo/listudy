defmodule ListudyWeb.EndgameView do
  use ListudyWeb, :view

  def material_icons(chapter, group \\ nil) do
    groups = %{
      "queen" => ["Q"],
      "rook" => ["R"],
      "bishop-bishop" => ["B", "B"],
      "bishop-knight" => ["B", "N"]
    }

    categories = %{
      "basic" => ["K", "Q"],
      "king-and-pawn" => ["K", "P"],
      "kings-bishops-and-pawns" => ["B", "P"],
      "knights-bishops-and-pawns" => ["N", "B", "P"],
      "two-minor-pieces-against-one" => ["B", "N"],
      "rook-against-pawns" => ["R", "P"],
      "rook-against-minor-pieces" => ["R", "B", "N"],
      "minor-pieces-against-rook" => ["B", "N", "R"],
      "queen-against-pawns" => ["Q", "P"],
      "queens-and-pawns" => ["Q", "P"],
      "queen-against-rook" => ["Q", "R"],
      "queen-against-minor-pieces" => ["Q", "B", "N"]
    }

    Map.get(groups, to_string(group), Map.get(categories, to_string(chapter), ["K"]))
  end

  def practice_games(conn, locale, chapters) do
    for {chapter_slug, chapter} <- chapters,
        {slug, type} <- chapter.endgames,
        {_, index} <- Enum.with_index(type.games) do
      %{
        id: "#{chapter_slug}_#{slug}_#{index + 1}",
        url: Routes.endgame_path(conn, :game, locale, chapter_slug, slug, index + 1)
      }
    end
  end

  def next_button(url) do
    """
    <a href="#{url}"><button id="next" class="hidden continue_button">#{dgettext("endgame", "Next")}</button></a>
    <link href="#{url}" rel="prerender"/>
    """
  end
end
