defmodule ListudyWeb.PuzzleCatalogView do
  use ListudyWeb, :view

  def theme_name(theme),
    do: theme |> String.replace(~r/([a-z])([A-Z])/, "\\1 \\2") |> String.capitalize()
end
