defmodule ListudyWeb.CollectionControllerTest do
  use ListudyWeb.ConnCase
  alias Listudy.Repo

  setup do
    owner =
      Repo.insert!(%Listudy.Users.User{username: "Collector", email: "collector@example.com"})

    other =
      Repo.insert!(%Listudy.Users.User{
        username: "OtherCollector",
        email: "other-collector@example.com"
      })

    pgn =
      "[Event \"Original\"]\n[ListudyChapterId \"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"]\n[ListudyOriginalIndex \"3\"]\n\n1. e4 {Keep me} e5 (1... c5) *"

    item = %{
      "title" => "Selected chapter",
      "study" => "Original study",
      "studyPath" => "/en/studies/source-study",
      "pgn" => pgn
    }

    data = %{"active" => "My repertoire", "collections" => %{"My repertoire" => [item]}}
    {:ok, owner: owner, other: other, data: data}
  end

  defp auth(user),
    do:
      build_conn()
      |> Pow.Plug.assign_current_user(user, [])
      |> put_req_header("accept", "application/json")

  test "collections are private to the owner and reject stale or invalid writes", %{
    owner: owner,
    other: other,
    data: data
  } do
    saved = auth(owner) |> put("/api/collections", %{revision: "", data: data}) |> json_response(200)
    assert saved["data"] == data
    assert auth(owner) |> get("/api/collections") |> json_response(200) == saved

    assert auth(other) |> get("/api/collections") |> json_response(200) == %{
             "revision" => "",
             "data" => %{"active" => "Default", "collections" => %{"Default" => []}}
           }

    assert auth(owner) |> put("/api/collections", %{revision: "", data: data}) |> response(409)

    assert auth(owner)
           |> put("/api/collections", %{
             revision: saved["revision"],
             data: %{active: "missing", collections: %{}}
           })
           |> response(422)

    assert auth(owner) |> get("/api/collections") |> json_response(200) == saved
  end

  test "create study preserves moves and annotations with new identities and leaves collection intact",
       %{owner: owner, data: data} do
    saved = auth(owner) |> put("/api/collections", %{revision: "", data: data}) |> json_response(200)

    result =
      auth(owner)
      |> post("/api/collections/study", %{
        revision: saved["revision"],
        collection: "My repertoire",
        title: "My new study",
        color: "black"
      })
      |> json_response(200)

    study = Repo.get_by!(Listudy.Studies.Study, user_id: owner.id, title: "My new study")
    assert study.private
    assert study.color == "black"
    assert result["url"] == Routes.study_path(build_conn(), :edit, "en", study)
    path = Path.join("priv/static/study_pgn", hd(String.split(study.slug, "-")) <> ".pgn")
    on_exit(fn -> File.rm(path) end)
    pgn = File.read!(path)
    assert pgn =~ "Keep me"
    assert pgn =~ "c5"
    assert pgn =~ "ListudySourceStudy"
    refute pgn =~ "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    refute pgn =~ "ListudyOriginalIndex"
    assert auth(owner) |> get("/api/collections") |> json_response(200) == saved
  end

  test "invalid chapter PGN does not create a study", %{owner: owner, data: data} do
    data =
      put_in(
        data,
        ["collections", "My repertoire", Access.at(0), "pgn"],
        "[Event \"Invalid\"]\n\n1. e5 *"
      )

    saved = auth(owner) |> put("/api/collections", %{revision: "", data: data}) |> json_response(200)

    assert auth(owner)
           |> post("/api/collections/study", %{
             revision: saved["revision"],
             collection: "My repertoire",
             title: "Invalid study",
             color: "white"
           })
           |> response(422)

    refute Repo.get_by(Listudy.Studies.Study, user_id: owner.id, title: "Invalid study")
  end
end
