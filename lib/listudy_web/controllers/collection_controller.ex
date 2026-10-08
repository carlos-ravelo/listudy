defmodule ListudyWeb.CollectionController do
  use ListudyWeb, :controller
  alias Listudy.Collections

  def index(conn, _), do: json(conn, Collections.fetch(conn.assigns.current_user.id))

  def update(conn, %{"revision" => revision, "data" => data}) when is_binary(revision) do
    case Collections.save(conn.assigns.current_user.id, revision, data) do
      {:ok, result} -> json(conn, result)
      {:error, reason} -> error(conn, reason)
    end
  end

  def update(conn, _), do: error(conn, :invalid)

  def create_study(conn, params) do
    case Collections.create_study(
           conn.assigns.current_user.id,
           params["revision"],
           params["collection"],
           params["title"],
           params["color"]
         ) do
      {:ok, study} ->
        json(conn, %{
          url: Routes.study_path(conn, :edit, get_session(conn, :locale) || "en", study)
        })

      {:error, reason} ->
        error(conn, reason)
    end
  end

  defp error(conn, :conflict),
    do:
      conn
      |> put_status(:conflict)
      |> json(%{
        error:
          "Collections changed in another session. Your local copy is kept. Reload saved collections before continuing."
      })

  defp error(conn, :empty),
    do:
      conn
      |> put_status(:unprocessable_entity)
      |> json(%{error: "Add at least one chapter before creating a study."})

  defp error(conn, :title),
    do:
      conn
      |> put_status(:unprocessable_entity)
      |> json(%{error: "The study title must contain 3 to 100 characters."})

  defp error(conn, reason) do
    message =
      if is_binary(reason),
        do: reason,
        else:
          "The collection could not be saved. Check its name, chapter data and size (maximum 2 MB)."

    conn |> put_status(:unprocessable_entity) |> json(%{error: message})
  end
end
