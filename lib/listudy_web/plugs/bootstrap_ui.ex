defmodule ListudyWeb.Plugs.BootstrapUI do
  import Plug.Conn

  def init(options), do: options

  def call(%{path_info: [_locale, "studies", "search"]} = conn, _options) do
    conn
    |> assign(:bootstrap_ui, true)
    |> assign(:bootstrap_discovery, true)
  end

  def call(conn, _options), do: conn
end
