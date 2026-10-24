defmodule ListudyWeb.StudySearchLive do
  use Phoenix.LiveView

  alias Listudy.Studies
  use Gettext, backend: ListudyWeb.Gettext
  alias ListudyWeb.Router.Helpers, as: Routes

  def render(assigns) do
    ~L"""
    <section class="study-discovery study-library repertoire-library practice-page" aria-labelledby="study-discovery-title">
      <div class="study-library-heading">
        <h1 id="study-discovery-title"><%= dgettext("study", "Search for studies") %></h1>
      </div>
      <form class="study-discovery-toolbar study-library-toolbar" phx-change="suggest" phx-submit="search" role="search">
        <div class="study-discovery-search">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg>
          <input class="form-control" id="study-search" type="search" aria-label="<%= dgettext("study", "Search for studies") %>" name="q" value="<%= @query %>" placeholder="<%= dgettext("study", "Search") %>…" autocomplete="off" phx-debounce="250" maxlength="100"/>
        </div>
        <div id="study-search-colors" phx-hook="StudySearchColors" class="study-discovery-selectors study-library-color-toggles" role="group" aria-label="<%= dgettext("study", "Study color") %>">
          <input type="hidden" name="color" value="<%= @color %>"/>
          <%= for {value, label, piece} <- [{"white", dgettext("study", "White"), "♔"}, {"black", dgettext("study", "Black"), "♚"}] do %>
            <button class="btn" type="button" data-library-color="<%= value %>" aria-pressed="<%= @color == value %>">
              <span class="study-discovery-selector-piece" aria-hidden="true"><%= piece %></span><%= label %>
            </button>
          <% end %>
        </div>
        <div class="study-discovery-selectors study-library-color-toggles">
          <input type="hidden" name="kind" value="<%= @kind %>"/>
          <input type="hidden" name="ordering" value="<%= @ordering %>"/>
          <button class="btn" type="button" phx-click="toggle-kind" aria-pressed="<%= @kind == "tactics" %>"><%= gettext("Tactics") %></button>
          <button class="btn" type="button" phx-click="toggle-ordering" aria-pressed="<%= @ordering == "favorites" %>"><%= dgettext("study", "Favorites") %></button>
        </div>
      </form>

      <%= if @matches == [] do %>
        <div class="study-discovery-empty study-library-empty" role="status">
          <%= if @kind == "tactics" do %>
            <p><%= dgettext("study", "No collections match these filters.") %></p>
            <a href="<%= Routes.study_path(@socket, :new, @locale, kind: "tactics") %>"><%= dgettext("study", "Create tactics") %></a>
          <% else %>
            <p><%= dgettext("study", "No studies found. Try another opening or import your repertoire.") %></p>
            <a href="<%= Routes.study_path(@socket, :new, @locale) %>"><%= dgettext("study", "Import my repertoire") %></a>
          <% end %>
        </div>
      <% else %>
        <ul class="study-library-list study_search_results" aria-label="<%= dgettext("study", "Studies") %>">
          <%= for match <- @matches do %>
            <%= Phoenix.View.render(ListudyWeb.ComponentView, "study_list_row.html", study: match, context: @socket, locale: @locale, editable: false, discovery: true) %>
          <% end %>
        </ul>
      <% end %>
    </section>
    """
  end

  def mount(%{"locale" => locale}, _session, socket) do
    result = Studies.search_by_title("", "newest")
    Gettext.put_locale(ListudyWeb.Gettext, locale)

    {:ok,
     assign(socket,
       query: nil,
       ordering: "newest",
       color: "all",
       kind: "repertoire",
       matches: result,
       locale: locale
     )}
  end

  def handle_event("toggle-kind", _, socket) do
    kind = if socket.assigns.kind == "tactics", do: "repertoire", else: "tactics"
    {:noreply, socket |> assign(:kind, kind) |> search()}
  end

  def handle_event("toggle-ordering", _, socket) do
    ordering = if socket.assigns.ordering == "favorites", do: "newest", else: "favorites"
    {:noreply, socket |> assign(:ordering, ordering) |> search()}
  end

  def handle_event("set-color", %{"color" => color}, socket)
      when color in ["all", "white", "black"] do
    {:noreply, socket |> assign(:color, color) |> search()}
  end

  def handle_event(_, %{"q" => query, "ordering" => order} = params, socket)
      when is_binary(query) do
    query = String.slice(query, 0, 100)
    order = if order in ["newest", "favorites"], do: order, else: "newest"
    color = if params["color"] in ["white", "black"], do: params["color"], else: "all"

    kind =
      if params["kind"] in ["repertoire", "tactics"],
        do: params["kind"],
        else: socket.assigns.kind

    {:noreply,
     socket |> assign(ordering: order, color: color, query: query, kind: kind) |> search()}
  end

  defp search(socket) do
    result =
      Studies.search_by_title(
        socket.assigns.query || "",
        socket.assigns.ordering,
        socket.assigns.color,
        socket.assigns.kind
      )

    assign(socket, :matches, result)
  end
end
