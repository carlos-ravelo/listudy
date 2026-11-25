defmodule ListudyWeb.FallbackController do
  @moduledoc """
  Translates error tuples returned by JSON controller actions (via
  `action_fallback`) into JSON responses shaped like the rest of the API:
  `%{error: message}`, plus `errors` per field for changesets.
  """
  use ListudyWeb, :controller

  def call(conn, {:error, %Ecto.Changeset{} = changeset}) do
    errors = Ecto.Changeset.traverse_errors(changeset, &ListudyWeb.ErrorHelpers.translate_error/1)

    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "The data could not be saved.", errors: errors})
  end

  def call(conn, {:error, :not_found}), do: error(conn, :not_found, "Not found.")
  def call(conn, {:error, :forbidden}), do: error(conn, :forbidden, "Forbidden")
  def call(conn, {:error, :bad_request}), do: error(conn, :bad_request, "Bad request.")

  defp error(conn, status, message),
    do: conn |> put_status(status) |> json(%{error: message})
end
