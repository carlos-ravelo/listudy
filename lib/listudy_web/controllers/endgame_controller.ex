defmodule ListudyWeb.EndgameController do
  use ListudyWeb, :controller

  def index(conn, _params) do
    render(conn, "index.html", endgame: ListudyWeb.EndgameCatalogue.chapters())
  end

  def chapter(conn, %{"chapter" => chapter}) do
    render(conn, "chapter.html",
      chapter: ListudyWeb.EndgameCatalogue.chapters()[String.to_atom(chapter)],
      slug: chapter
    )
  end

  def game(conn, %{"chapter" => chapter_slug, "subchapter" => subchapter_slug, "game" => game}) do
    {game_id, _} = Integer.parse(game)
    index = game_id - 1
    chapter = ListudyWeb.EndgameCatalogue.chapters()[String.to_atom(chapter_slug)]
    subchapter = chapter[:endgames][String.to_atom(subchapter_slug)]
    game_list = subchapter[:games]
    game = Enum.at(game_list, index)
    next = next(game_list, game_id)

    render(conn, "game.html",
      game: game,
      next: next,
      chapter: chapter,
      chapter_slug: chapter_slug,
      subchapter: subchapter,
      subchapter_slug: subchapter_slug,
      index: game_id,
      noindex: true
    )
  end

  defp next(game_list, index) when length(game_list) == index do
    "back"
  end

  defp next(game_list, index) when length(game_list) > index do
    index + 1
  end
end
