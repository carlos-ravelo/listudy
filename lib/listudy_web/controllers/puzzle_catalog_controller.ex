defmodule ListudyWeb.PuzzleCatalogController do
  use ListudyWeb, :controller
  alias Listudy.PuzzleCatalog

  def index(conn, params), do: start(conn, params)

  def start(conn, params) do
    filters = PuzzleCatalog.filters(params)

    case PuzzleCatalog.select(filters) do
      nil ->
        render(conn, "index.html", filters: filters, themes: PuzzleCatalog.themes(), count: 0)

      tactic ->
        redirect(conn,
          to:
            Routes.catalog_tactics_path(
              conn,
              ListudyWeb.TacticsLive,
              conn.assigns.locale,
              tactic,
              filters
            )
        )
    end
  end

  def imports(conn, _params) do
    render(conn, "imports.html", imports: PuzzleCatalog.imports())
  end

  def create(conn, %{"import" => %{"file" => %Plug.Upload{} = upload}}) do
    if String.ends_with?(String.downcase(upload.filename), [".csv", ".csv.zst"]) do
      case PuzzleCatalog.enqueue(upload.path, upload.filename) do
        {:ok, _} ->
          conn
          |> put_flash(:info, gettext("Import queued. Refresh this page to see progress."))
          |> redirect(to: Routes.puzzle_catalog_path(conn, :imports))

        _ ->
          conn
          |> put_flash(:error, gettext("Could not queue this file."))
          |> redirect(to: Routes.puzzle_catalog_path(conn, :imports))
      end
    else
      conn
      |> put_flash(:error, gettext("Choose a CSV or CSV.zst file."))
      |> redirect(to: Routes.puzzle_catalog_path(conn, :imports))
    end
  end

  def create(conn, _) do
    conn
    |> put_flash(:error, gettext("Choose a CSV or CSV.zst file."))
    |> redirect(to: Routes.puzzle_catalog_path(conn, :imports))
  end
end
