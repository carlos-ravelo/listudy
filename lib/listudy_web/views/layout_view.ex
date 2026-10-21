defmodule ListudyWeb.LayoutView do
  use ListudyWeb, :view

  def app_stylesheet_path(conn) do
    stylesheet =
      cond do
        conn.assigns[:bootstrap_management] -> "/css/bootstrap_management.css"
        conn.assigns[:bootstrap_study] -> "/css/bootstrap_study.css"
        conn.assigns[:bootstrap_ui] -> "/css/bootstrap_ui.css"
        true -> "/css/app.css"
      end

    path = Routes.static_path(conn, stylesheet)
    separator = if String.contains?(path, "?"), do: "&", else: "?"
    path <> separator <> "v=study-maintenance-1"
  end

  def app_script_path(conn) do
    script =
      cond do
        conn.assigns[:bootstrap_management] -> "/js/bootstrap_management.js"
        conn.assigns[:bootstrap_study] -> "/js/bootstrap_study.js"
        conn.assigns[:bootstrap_ui] -> "/js/bootstrap_ui.js"
        true -> "/js/app.js"
      end

    Routes.static_path(conn, script)
  end

  def is_halloween(date) do
    {{_, month, day}, {hour, _, _}} = date
    (month == 10 and day in 27..31) or (month == 11 and day == 1 and hour in 0..6)
  end

  def is_xmas(date) do
    {{_, month, day}, {_, _, _}} = date
    month == 12 and day in 22..26
  end

  def is_april_fools(date) do
    {{_, month, day}, {_, _, _}} = date
    month == 4 and day == 1
  end

  def is_new_year(date) do
    {{_, month, day}, {_, _, _}} = date
    (month == 12 and day == 31) or (month == 1 and day == 1)
  end

  def is_halloween do
    is_halloween(:calendar.universal_time())
  end

  def is_xmas do
    is_xmas(:calendar.universal_time())
  end

  def is_april_fools do
    is_april_fools(:calendar.universal_time())
  end

  def is_new_year do
    is_new_year(:calendar.universal_time())
  end
end
