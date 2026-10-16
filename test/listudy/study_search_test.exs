defmodule Listudy.StudySearchTest do
  use Listudy.DataCase

  setup do
    user = Repo.insert!(%Listudy.Users.User{username: "StudyFinder", email: "finder@example.com"})
    {:ok, user: user}
  end

  defp study(user, title, color, private \\ false) do
    Repo.insert!(%Listudy.Studies.Study{
      user_id: user.id,
      title: title,
      slug: "finder#{System.unique_integer([:positive])}-study",
      description: "Study search test repertoire",
      color: color,
      private: private,
      updated_at: ~N[2024-01-01 00:00:00]
    })
  end

  test "color filters the full catalogue before the result limit and excludes private studies", %{
    user: user
  } do
    black = study(user, "Filter repertoire target", "black")
    study(user, "Filter repertoire private", "black", true)

    for index <- 1..21 do
      entry = study(user, "Filter repertoire #{index}", "white")
      entry |> Ecto.Changeset.change(updated_at: ~N[2025-01-01 00:00:00]) |> Repo.update!()
    end

    assert length(Listudy.Studies.search_by_title("Filter repertoire", "newest")) == 20

    assert Enum.map(
             Listudy.Studies.search_by_title("Filter repertoire", "newest", "black"),
             & &1.id
           ) == [black.id]

    assert Listudy.Studies.search_by_title("Filter repertoire target", "newest", "white") == []
  end

  test "search, color and ordering remain combined across filter changes", %{user: user} do
    black = study(user, "Filter repertoire black", "black")
    white = study(user, "Filter repertoire white", "white")

    for entry <- [black, white] do
      Repo.insert!(%Listudy.StudyFavorites.StudyFavorite{user_id: user.id, study_id: entry.id})
    end

    {:ok, socket} =
      ListudyWeb.StudySearchLive.mount(%{"locale" => "en"}, %{}, %Phoenix.LiveView.Socket{})

    assert socket.assigns.color == "all"
    assert socket.assigns.ordering == "newest"

    {:noreply, socket} =
      ListudyWeb.StudySearchLive.handle_event(
        "suggest",
        %{"q" => "Filter repertoire", "ordering" => "favorites", "color" => "black"},
        socket
      )

    assert Enum.map(socket.assigns.matches, & &1.id) == [black.id]
    assert socket.assigns.color == "black"
    assert socket.assigns.ordering == "favorites"

    {:noreply, socket} =
      ListudyWeb.StudySearchLive.handle_event(
        "suggest",
        %{"q" => "Filter repertoire white", "ordering" => "newest", "color" => "all"},
        socket
      )

    assert Enum.map(socket.assigns.matches, & &1.id) == [white.id]
  end
end
