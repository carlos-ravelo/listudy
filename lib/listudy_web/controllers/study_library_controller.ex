defmodule ListudyWeb.StudyLibraryController do
  use ListudyWeb, :controller
  alias Listudy.StudyLibrary

  def index(conn, _), do: json(conn, %{data: StudyLibrary.fetch(conn.assigns.current_user.id)})

  def update(conn, params) do
    case StudyLibrary.update(conn.assigns.current_user.id, params) do
      {:ok, data} ->
        json(conn, %{data: data})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "Choose studies from your own library."})

      {:error, :group_name} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "Use a unique group name of 1 to 60 characters (up to 50 groups)."})

      {:error, _} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "The library could not be updated."})
    end
  end
end
