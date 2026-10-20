defmodule ListudyWeb.PageView do
  use ListudyWeb, :view

  def emphasize_analysis_sources(text) do
    escaped = text |> html_escape() |> safe_to_string()

    Enum.reduce(["PGN", "Chess.com", "Lichess"], escaped, fn source, html ->
      emphasis = content_tag(:strong, source, class: "home-analysis-source") |> safe_to_string()
      String.replace(html, source, emphasis)
    end)
    |> raw()
  end
end
