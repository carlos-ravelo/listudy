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

  test "hydration omits legacy trees and scopes progress without losing preferences", %{
    user: user,
    other: other
  } do
    for {key, value} <- [
          {"one_tree", "large unused tree"},
          {"one_chapter_stats", "stats one"},
          {"one_chapter_reviews", "reviews one"},
          {"two_chapter_stats", "stats two"},
          {"two_chapter_reviews", "reviews two"},
          {"move_delay", "fast"},
          {"study_collections_v1", "collections"},
          {"study_library_v1", "library"}
        ] do
      Repo.insert!(%Listudy.Progress.UserSetting{user_id: user.id, key: key, value: value})
    end

    Repo.insert!(%Listudy.Progress.UserSetting{
      user_id: other.id,
      key: "one_chapter_stats",
      value: "other user's progress"
    })

    full = auth(user) |> get("/api/progress") |> json_response(200)
    refute Map.has_key?(full, "one_tree")
    assert full["two_chapter_stats"] == "stats two"

    scoped = auth(user) |> get("/api/progress", %{study_id: "one"}) |> json_response(200)
    assert scoped["one_chapter_stats"] == "stats one"
    assert scoped["one_chapter_reviews"] == "reviews one"
    assert scoped["move_delay"] == "fast"

    assert Map.keys(scoped["_progress_revisions"]) |> Enum.sort() ==
             ["one_chapter_reviews", "one_chapter_stats"]

    for key <- [
          "one_tree",
          "two_chapter_stats",
          "two_chapter_reviews",
          "study_collections_v1",
          "study_library_v1"
        ] do
      refute Map.has_key?(scoped, key)
    end
  end
end
