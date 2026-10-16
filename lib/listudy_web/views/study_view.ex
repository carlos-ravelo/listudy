defmodule ListudyWeb.StudyView do
  use ListudyWeb, :view

  def training_path(conn, locale, %{training_kind: "tactics"} = study),
    do: Routes.tactics_collection_path(conn, :tactics_collection, locale, study)

  def training_path(conn, locale, study), do: Routes.study_path(conn, :show, locale, study)

  def library_copy(tactics) do
    if tactics do
      %{
        all: dgettext("study", "All collections"),
        remove_group:
          dgettext(
            "study",
            "Remove this group? Its collections will be kept in their current lists."
          ),
        daily_help: dgettext("study", "Keep the collections you practice regularly here."),
        library_help:
          dgettext("study", "Other collections stay available here whenever you need them."),
        all_help: dgettext("study", "All your tactics collections."),
        empty_daily:
          dgettext(
            "study",
            "Your daily list is empty. Open Library or All collections to bring a collection back."
          ),
        empty_library:
          dgettext(
            "study",
            "No collections in Library yet. Move collections here using Organize."
          ),
        empty_search: dgettext("study", "No collections match these filters."),
        title: dgettext("study", "Your tactics"),
        import_label: dgettext("study", "Import tactics PGN"),
        empty_title: dgettext("study", "Your tactics library"),
        empty_help:
          dgettext(
            "study",
            "Import a tactics PGN to practice its exercises, variations and explanations."
          ),
        import_empty: dgettext("study", "Import tactics PGN"),
        explore: dgettext("study", "Practice public puzzles"),
        favorites: dgettext("study", "Saved collections"),
        show_all: dgettext("study", "Show all collections"),
        groups_help:
          dgettext(
            "study",
            "Group collections by book, theme or purpose. Groups work across Daily and Library."
          )
      }
    else
      %{
        all: dgettext("study", "All studies"),
        remove_group:
          dgettext("study", "Remove this group? Its studies will be kept in their current lists."),
        daily_help:
          dgettext("study", "Keep everyday studies here. Move reference material to Library."),
        library_help:
          dgettext("study", "Reference studies stay available for practice and collections."),
        all_help: dgettext("study", "All your studies, including reference material."),
        empty_daily:
          dgettext(
            "study",
            "Your daily list is empty. Open Library or All studies to bring a study back."
          ),
        empty_library:
          dgettext(
            "study",
            "No reference studies yet. Move studies here from their actions menu or use Organize."
          ),
        empty_search: dgettext("study", "No studies match these filters."),
        title: dgettext("study", "Your Studies"),
        import_label: dgettext("study", "Import repertoire"),
        empty_title: dgettext("study", "Your first training session"),
        empty_help:
          dgettext(
            "study",
            "Import a PGN or a Lichess study, or explore a public study to start practicing."
          ),
        import_empty: dgettext("study", "Import my repertoire"),
        explore: dgettext("study", "Find a study to practice"),
        favorites: dgettext("study", "Favored Studies"),
        show_all: dgettext("study", "Show all studies"),
        groups_help:
          dgettext(
            "study",
            "Group studies by opening, repertoire or purpose. Groups work across Daily and Library."
          )
      }
    end
  end

  def study_script_path(conn) do
    path = Routes.static_path(conn, "/js/study.js")
    separator = if String.contains?(path, "?"), do: "&", else: "?"

    # Escape existing one-year browser caches for the old unversioned URL.
    # Subsequent undigested requests revalidate under the endpoint's policy.
    path <> separator <> "v=chapter-editor-1"
  end

  def selected_opening(assigns) do
    if Map.has_key?(assigns, :study) do
      assigns.study.opening_id
    else
      1
    end
  end
end
