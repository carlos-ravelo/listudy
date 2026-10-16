defmodule ListudyWeb.EndgameView do
  use ListudyWeb, :view

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
