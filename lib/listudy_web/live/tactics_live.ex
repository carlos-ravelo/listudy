defmodule ListudyWeb.TacticsLive do
  require Logger
  import ListudyWeb.Gettext, only: [gettext: 1]
  use Phoenix.LiveView

  alias Listudy.Tactics
  alias Listudy.PuzzleCatalog
  alias Listudy.Openings
  alias Listudy.Events
  alias Listudy.Players
  alias Listudy.Motifs
  alias ListudyWeb.Router.Helpers, as: Routes

  def render(assigns) do
    Phoenix.View.render(ListudyWeb.LiveView, "tactics.html", assigns)
  end

  def mount(%{"locale" => locale, "id" => id} = params, _session, socket) do
    Gettext.put_locale(ListudyWeb.Gettext, locale)
    tactic = Tactics.get_tactic!(id)
    socket = add_extra(params, socket)
    socket = assign(socket, :noindex, true)
    canonical = Routes.tactics_path(socket, ListudyWeb.TacticsLive, "en", tactic)

    {:ok,
     assign(socket,
       locale: locale,
       tactic: tactic,
       canonical: canonical,
       catalog_filters: nil,
       filter_draft: PuzzleCatalog.filters(%{}),
       filter_count: 0,
       filter_error: nil,
       puzzle_themes: PuzzleCatalog.themes(),
       puzzle_attempt: ""
     )}
  end

  def handle_params(params, uri, socket) do
    catalog = String.contains?(URI.parse(uri).path, "/tactics/puzzles/")

    filters = PuzzleCatalog.filters(params)

    tactic =
      if to_string(socket.assigns.tactic.id) == params["id"],
        do: socket.assigns.tactic,
        else: Tactics.get_tactic!(params["id"])

    {:noreply,
     assign(socket,
       tactic: tactic,
       catalog_filters: if(catalog, do: filters, else: nil),
       filter_draft: filters,
       filter_count: PuzzleCatalog.count(filters),
       filter_error: filter_error(filters),
       puzzle_attempt: params["attempt"] || ""
     )}
  end

  def handle_event("preview_filters", params, socket) do
    filters = PuzzleCatalog.filters(params)

    {:noreply,
     assign(socket,
       filter_draft: filters,
       filter_count: PuzzleCatalog.count(filters),
       filter_error: filter_error(filters)
     )}
  end

  def handle_event("apply_filters", params, socket) do
    filters = PuzzleCatalog.filters(params)
    error = filter_error(filters)
    tactic = if !error, do: PuzzleCatalog.select(filters, socket.assigns.tactic.id)

    if tactic do
      socket = assign(socket, catalog_filters: filters)
      {:noreply, push_patch(socket, to: get_next_url(socket, tactic))}
    else
      {:noreply,
       socket
       |> assign(
         filter_draft: filters,
         filter_count: 0,
         filter_error:
           error || gettext("No puzzles match. Try another theme or a wider rating range.")
       )
       |> push_event("puzzle-filter-error", %{field: if(error, do: "min_rating", else: "theme")})}
    end
  end

  def handle_event("next", _value, socket) do
    Tactics.increase_played(socket.assigns.tactic.id)
    tactic = get_next_tactic(socket) || socket.assigns.tactic
    url = get_next_url(socket, tactic)

    if is_map(socket.assigns.catalog_filters) do
      {:noreply, push_patch(socket, to: url, replace: true)}
    else
      {:noreply, push_redirect(socket, to: url, replace: true)}
    end
  end

  def handle_event(event, _, socket) do
    Logger.error("Unhandled event in tactics live: #{event}")
    {:noreply, socket}
  end

  defp filter_error(filters) do
    if filters["min_rating"] > filters["max_rating"],
      do: gettext("Minimum rating must not exceed maximum rating.")
  end

  defp add_extra(%{"motif" => slug}, socket) do
    motif = Motifs.get_by_slug!(slug)
    assign(socket, :motif, motif)
  end

  defp add_extra(%{"opening" => slug}, socket) do
    opening = Openings.get_by_slug!(slug)
    assign(socket, :opening, opening)
  end

  defp add_extra(%{"event" => slug}, socket) do
    event = Events.get_by_slug!(slug)
    assign(socket, :event, event)
  end

  defp add_extra(%{"player" => slug}, socket) do
    player = Players.get_by_slug!(slug)
    assign(socket, :player, player)
  end

  defp add_extra(_params, socket) do
    socket
  end

  defp get_next_tactic(%{assigns: %{catalog_filters: filters}} = socket) when is_map(filters) do
    Listudy.PuzzleCatalog.select(filters, socket.assigns.tactic.id)
  end

  defp get_next_tactic(%{:assigns => %{:opening => opening}} = socket) do
    Tactics.get_random_opening_tactic(socket.assigns.tactic.id, opening.id)
  end

  defp get_next_tactic(%{:assigns => %{:motif => motif}} = socket) do
    Tactics.get_random_motif_tactic(socket.assigns.tactic.id, motif.id)
  end

  defp get_next_tactic(%{:assigns => %{:event => event}} = socket) do
    Tactics.get_random_event_tactic(socket.assigns.tactic.id, event.id)
  end

  defp get_next_tactic(%{:assigns => %{:player => player}} = socket) do
    Tactics.get_random_player_tactic(socket.assigns.tactic.id, player.id)
  end

  defp get_next_tactic(socket) do
    Tactics.get_random_tactic(socket.assigns.tactic.id)
  end

  defp get_next_url(%{assigns: %{catalog_filters: filters}} = socket, tactic)
       when is_map(filters) do
    filters =
      if tactic.id == socket.assigns.tactic.id,
        do:
          Map.put(filters, "attempt", to_string(System.unique_integer([:positive, :monotonic]))),
        else: filters

    Routes.catalog_tactics_path(
      socket,
      ListudyWeb.TacticsLive,
      socket.assigns.locale,
      tactic,
      filters
    )
  end

  defp get_next_url(%{:assigns => %{:opening => opening}} = socket, tactic) do
    Routes.opening_tactics_path(
      socket,
      ListudyWeb.TacticsLive,
      socket.assigns.locale,
      opening.slug,
      tactic
    )
  end

  defp get_next_url(%{:assigns => %{:motif => motif}} = socket, tactic) do
    Routes.motif_tactics_path(
      socket,
      ListudyWeb.TacticsLive,
      socket.assigns.locale,
      motif.slug,
      tactic
    )
  end

  defp get_next_url(%{:assigns => %{:event => event}} = socket, tactic) do
    Routes.event_tactics_path(
      socket,
      ListudyWeb.TacticsLive,
      socket.assigns.locale,
      event.slug,
      tactic
    )
  end

  defp get_next_url(%{:assigns => %{:player => player}} = socket, tactic) do
    Routes.player_tactics_path(
      socket,
      ListudyWeb.TacticsLive,
      socket.assigns.locale,
      player.slug,
      tactic
    )
  end

  defp get_next_url(socket, tactic) do
    Routes.tactics_path(socket, ListudyWeb.TacticsLive, socket.assigns.locale, tactic)
  end
end
