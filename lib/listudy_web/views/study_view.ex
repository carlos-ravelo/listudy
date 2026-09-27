defmodule ListudyWeb.StudyView do
  use ListudyWeb, :view

  def study_script_path(conn) do
    path = Routes.static_path(conn, "/js/study.js")
    separator = if String.contains?(path, "?"), do: "&", else: "?"

    # Escape existing one-year browser caches for the old unversioned URL.
    # Subsequent undigested requests revalidate under the endpoint's policy.
    path <> separator <> "v=chapter-links-2"
  end

  def selected_opening(assigns) do
    if Map.has_key?(assigns, :study) do
      assigns.study.opening_id
    else
      1
    end
  end
end
