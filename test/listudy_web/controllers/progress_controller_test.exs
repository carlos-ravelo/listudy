defmodule ListudyWeb.ProgressControllerTest do
  use ListudyWeb.ConnCase
  alias Listudy.Repo

  setup do
    user =
      Repo.insert!(%Listudy.Users.User{username: "ProgressOwner", email: "progress@example.com"})

    other =
      Repo.insert!(%Listudy.Users.User{
        username: "ProgressOther",
        email: "otherprogress@example.com"
      })

    {:ok, user: user, other: other}
  end

  defp auth(user),
    do:
      build_conn()
      |> Pow.Plug.assign_current_user(user, [])
      |> put_req_header("accept", "application/json")

  test "progress uses revisions and rejects stale and legacy overwrites", %{
    user: user,
    other: other
  } do
    key = "study_chapter_stats"
    value = Jason.encode!(%{version: 1, chapters: %{a: %{attempts: 1, errors: 0}}})

    saved =
      auth(user)
      |> post("/api/progress/sync", %{key: key, value: value, revision: ""})
      |> json_response(200)

    conflict =
      auth(user)
      |> post("/api/progress/sync", %{key: key, value: value, revision: ""})
      |> json_response(409)

    assert conflict["value"] == value
    assert conflict["revision"] == saved["revision"]
    assert auth(user) |> post("/api/progress/sync", %{key: key, value: value}) |> response(409)
    index = auth(user) |> get("/api/progress") |> json_response(200)
    assert index[key] == value
    assert index["_progress_revisions"][key] == saved["revision"]
    refute Map.has_key?(auth(other) |> get("/api/progress") |> json_response(200), key)

    assert auth(user)
           |> post("/api/progress/sync", %{key: key, value: "{}", revision: saved["revision"]})
           |> response(422)
  end

  test "ordinary preferences retain their existing protocol", %{user: user} do
    assert auth(user)
           |> post("/api/progress/sync", %{key: "move_delay", value: "fast"})
           |> json_response(200) == %{"status" => "ok"}
  end
end
