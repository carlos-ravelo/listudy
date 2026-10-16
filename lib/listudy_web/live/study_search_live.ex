defmodule ListudyWeb.StudySearchLive do
  use Phoenix.LiveView

  alias Listudy.Studies
  import ListudyWeb.Gettext
  alias ListudyWeb.Router.Helpers, as: Routes

  def render(assigns) do
    ~L"""
    <section class="study-discovery" aria-labelledby="study-discovery-title">
      <h1 id="study-discovery-title"><%= dgettext("study", "Search for studies") %></h1>
      <form class="study-discovery-toolbar" phx-change="suggest" phx-submit="search" role="search">
        <div class="study-discovery-search">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg>
          <input id="study-search" type="search" aria-label="<%= dgettext("study", "Search for studies") %>" name="q" value="<%= @query %>" placeholder="<%= dgettext("study", "Search") %>…" autocomplete="off" phx-debounce="250" maxlength="100"/>
        </div>
        <select name="color" id="study-search-color" aria-label="<%= dgettext("study", "Study color") %>">
          <option value="all" <%= if @color == "all" do %>selected<%end%>><%= dgettext("study", "Both colors") %></option>
          <option value="white" <%= if @color == "white" do %>selected<%end%>><%= dgettext("study", "White") %></option>
          <option value="black" <%= if @color == "black" do %>selected<%end%>><%= dgettext("study", "Black") %></option>
        </select>
        <select name="ordering" id="ordering" aria-label="<%= dgettext("study", "Sort studies") %>">
          <option value="newest" <%= if @ordering == "newest" do %>selected<%end%>><%= dgettext("study", "Newest")%></option>
          <option value="favorites" <%= if @ordering == "favorites" do %>selected<%end%>><%= dgettext("study", "Favorites")%></option>
        </select>
      </form>

      <%= if @matches == [] do %>
        <div class="study-discovery-empty" role="status">
          <p><%= dgettext("study", "No studies found. Try another opening or import your repertoire.") %></p>
          <a href="<%= Routes.study_path(@socket, :new, @locale) %>"><%= dgettext("study", "Import my repertoire") %></a>
        </div>
      <% else %>
        <ul class="study-discovery-list study_search_results" aria-label="<%= dgettext("study", "Studies") %>">
          <%= for match <- @matches do %>
            <li class="study_search_result" id="study-result-<%= match.id %>">
              <a class="study-discovery-row" href="<%= Routes.study_path(@socket, :show, @locale, match) %>" aria-labelledby="study-title-<%= match.id %>">
                <span class="study-discovery-piece" aria-hidden="true">
                  <%= if match.color in ["white", "black"] do %>
                    <%= if match.color == "black", do: "♚", else: "♔" %>
                  <% else %>
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4h6l2 2 2-2h6v15h-6l-2 2-2-2H4Z"/><path d="M12 6v15"/></svg>
                  <% end %>
                </span>
                <div class="study-discovery-content">
                  <h2 id="study-title-<%= match.id %>"><%= match.title %></h2>
                  <%= if match.description not in [nil, ""] do %>
                    <p class="study-discovery-description"><%= shorten_description(match.description) %></p>
                  <% end %>
                  <div class="study-discovery-meta">
                    <%= if match.color in ["white", "black"] do %>
                      <span class="study-discovery-side"><%= if match.color == "white", do: dgettext("study", "White"), else: dgettext("study", "Black") %></span>
                    <% end %>
                    <span><%= dgettext("study", "by") %> <%= match.user.username %></span>
                  </div>
                </div>
                <span class="study-discovery-favorites" aria-label="<%= dngettext("study", "%{count} favorite", "%{count} favorites", length(match.study_favorites)) %>">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/></svg>
                  <%= length(match.study_favorites) %>
                </span>
              </a>
            </li>
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
     assign(socket, query: nil, ordering: "newest", color: "all", matches: result, locale: locale)}
  end

  def handle_event(_, %{"q" => query, "ordering" => order} = params, socket)
      when is_binary(query) do
    query = String.slice(query, 0, 100)
    order = if order in ["newest", "favorites"], do: order, else: "newest"
    color = if params["color"] in ["white", "black"], do: params["color"], else: "all"
    result = Studies.search_by_title(query, order, color)
    {:noreply, assign(socket, matches: result, ordering: order, color: color, query: query)}
  end

  defp shorten_description(description) do
    limit = 200

    case String.length(description) do
      n when n < limit ->
        description

      _ ->
        String.slice(description, 0, limit) <> "..."
    end
  end
end
