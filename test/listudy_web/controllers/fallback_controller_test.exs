defmodule ListudyWeb.FallbackControllerTest do
  use ListudyWeb.ConnCase, async: true
  alias ListudyWeb.FallbackController

  defp call(result),
    do:
      build_conn()
      |> put_req_header("accept", "application/json")
      |> FallbackController.call(result)

  test "renders atom errors as JSON with the matching status" do
    assert call({:error, :not_found}) |> json_response(404) == %{"error" => "Not found."}
    assert call({:error, :forbidden}) |> json_response(403) == %{"error" => "Forbidden"}
    assert call({:error, :bad_request}) |> json_response(400) == %{"error" => "Bad request."}
  end

  test "renders changeset errors per field" do
    changeset = Listudy.Progress.UserSetting.changeset(%Listudy.Progress.UserSetting{}, %{})

    assert call({:error, changeset}) |> json_response(422) == %{
             "error" => "The data could not be saved.",
             "errors" => %{"key" => ["can't be blank"], "user_id" => ["can't be blank"]}
           }
  end
end
