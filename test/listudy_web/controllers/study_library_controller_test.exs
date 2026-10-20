defmodule ListudyWeb.StudyLibraryControllerTest do
  use ListudyWeb.ConnCase
  alias Listudy.Repo
  alias Listudy.StudyLibrary

  setup do
    owner =
      Repo.insert!(%Listudy.Users.User{username: "Librarian", email: "librarian@example.com"})

    other =
      Repo.insert!(%Listudy.Users.User{
        username: "OtherLibrarian",
        email: "other-librarian@example.com"
      })

    studies =
      for index <- 1..3 do
        Repo.insert!(%Listudy.Studies.Study{
          title: "Repertoire #{index}",
          description: "Keep this source",
          slug: "library-#{index}-study",
          user_id: owner.id,
          private: true,
          color: "white"
        })
      end

    foreign =
      Repo.insert!(%Listudy.Studies.Study{
        title: "Other repertoire",
        slug: "foreign-library-study",
        user_id: other.id,
        private: false,
        color: "black"
      })

    {:ok, owner: owner, other: other, studies: studies, foreign: foreign}
  end

  defp auth(user),
    do:
      build_conn()
      |> Pow.Plug.assign_current_user(user, [])
      |> put_req_header("accept", "application/json")

  defp operation(user, params), do: auth(user) |> patch("/api/study-library", params)

  test "daily and reference organization is personal and does not change studies", %{
    owner: owner,
    other: other,
    studies: studies
  } do
    assert StudyLibrary.fetch(owner.id)["studies"] == %{}
    [first, second | _] = studies

    data =
      operation(owner, %{action: "create_group", name: "Queen's Gambit"})
      |> json_response(200)
      |> Map.fetch!("data")

    group = data["groups"] |> Map.keys() |> hd()

    operation(owner, %{action: "move", study_ids: [first.id, second.id], location: "library"})
    |> json_response(200)

    data =
      operation(owner, %{action: "move", study_ids: [first.id], group: group})
      |> json_response(200)
      |> Map.fetch!("data")

    assert data["studies"][to_string(first.id)] == %{"location" => "library", "group" => group}
    assert data["studies"][to_string(second.id)]["location"] == "library"
    assert StudyLibrary.fetch(other.id)["studies"] == %{}
    assert Repo.get!(Listudy.Studies.Study, first.id).title == first.title
    assert Repo.get!(Listudy.Studies.Study, first.id).private

    data =
      operation(owner, %{action: "rename_group", group: group, name: "Main repertoire"})
      |> json_response(200)
      |> Map.fetch!("data")

    assert data["groups"][group] == "Main repertoire"

    data =
      operation(owner, %{action: "delete_group", group: group})
      |> json_response(200)
      |> Map.fetch!("data")

    assert data["groups"] == %{}
    assert data["studies"][to_string(first.id)] == %{"location" => "library", "group" => nil}

    data =
      operation(owner, %{action: "move", study_ids: [first.id], location: "daily"})
      |> json_response(200)
      |> Map.fetch!("data")

    assert data["studies"][to_string(first.id)]["location"] == "daily"
    assert auth(owner) |> get("/api/study-library") |> json_response(200) == %{"data" => data}
  end

  test "rejects unauthorized studies and invalid groups without partial writes", %{
    owner: owner,
    other: other,
    studies: [first | _],
    foreign: foreign
  } do
    assert operation(other, %{action: "move", study_ids: [first.id], location: "library"})
           |> response(403)

    assert operation(owner, %{
             action: "move",
             study_ids: [first.id, foreign.id],
             location: "library"
           })
           |> response(403)

    assert StudyLibrary.fetch(owner.id)["studies"] == %{}

    assert operation(owner, %{action: "move", study_ids: [first.id], location: "missing"})
           |> response(422)

    assert operation(owner, %{action: "move", study_ids: [first.id], group: "missing"})
           |> response(422)

    assert operation(owner, %{action: "create_group", name: "   "}) |> response(422)

    assert operation(owner, %{action: "create_group", name: String.duplicate("x", 61)})
           |> response(422)

    operation(owner, %{action: "create_group", name: "Reference"}) |> json_response(200)
    assert operation(owner, %{action: "create_group", name: " reference "}) |> response(422)
    assert StudyLibrary.fetch(owner.id)["studies"] == %{}
  end

  test "saved public favorites can be organized privately and inaccessible favorites are excluded",
       %{owner: owner, other: other, foreign: foreign} do
    Repo.insert!(%Listudy.StudyFavorites.StudyFavorite{user_id: owner.id, study_id: foreign.id})

    operation(owner, %{action: "move", study_ids: [foreign.id], location: "library"})
    |> json_response(200)

    assert StudyLibrary.fetch(other.id)["studies"] == %{}
    foreign |> Ecto.Changeset.change(private: true) |> Repo.update!()

    assert operation(owner, %{action: "move", study_ids: [foreign.id], location: "daily"})
           |> response(403)
  end

  test "bulk visibility updates owned studies and preserves library organization", %{
    owner: owner,
    studies: [first, second, third]
  } do
    operation(owner, %{action: "move", study_ids: [first.id], location: "library"})
    |> json_response(200)

    before = StudyLibrary.fetch(owner.id)

    for private <- [false, true] do
      result =
        operation(owner, %{
          action: "set_privacy",
          study_ids: ["#{first.id}", second.id, first.id],
          private: private
        })
        |> json_response(200)

      assert result["data"] == before
      assert Repo.get!(Listudy.Studies.Study, first.id).private == private
      assert Repo.get!(Listudy.Studies.Study, second.id).private == private
      assert Repo.get!(Listudy.Studies.Study, third.id).private
      assert Repo.get!(Listudy.Studies.Study, first.id).title == first.title
    end
  end

  test "bulk visibility rejects favorites and invalid input without partial writes", %{
    owner: owner,
    studies: [first | _],
    foreign: foreign
  } do
    Repo.insert!(%Listudy.StudyFavorites.StudyFavorite{user_id: owner.id, study_id: foreign.id})

    for ids <- [[first.id, foreign.id], [first.id, 0], [first.id, "invalid"], [first.id, -1]] do
      assert operation(owner, %{action: "set_privacy", study_ids: ids, private: false})
             |> response(403)

      assert Repo.get!(Listudy.Studies.Study, first.id).private
      refute Repo.get!(Listudy.Studies.Study, foreign.id).private
    end

    for params <- [
          %{study_ids: [], private: false},
          %{study_ids: List.duplicate(first.id, 501), private: false},
          %{study_ids: [first.id], private: "false"},
          %{study_ids: [first.id], private: nil},
          %{study_ids: [first.id]},
          %{study_ids: "invalid", private: false}
        ] do
      assert operation(owner, Map.put(params, :action, "set_privacy")) |> response(422)
      assert Repo.get!(Listudy.Studies.Study, first.id).private
    end
  end

  test "library page renders organization and avoids duplicating owned favorites", %{
    owner: owner,
    studies: [first | _]
  } do
    Repo.insert!(%Listudy.StudyFavorites.StudyFavorite{user_id: owner.id, study_id: first.id})

    operation(owner, %{action: "move", study_ids: [first.id], location: "library"})
    |> json_response(200)

    conn = build_conn() |> Pow.Plug.assign_current_user(owner, [])
    html = conn |> get(Routes.study_path(conn, :index, "en")) |> html_response(200)
    assert html =~ "data-library-state="
    assert html =~ "data-library-view=\"favorites\""
    assert html =~ "data-library-view=\"all\""
    refute html =~ "data-library-view=\"daily\""

    assert [_] =
             Floki.find(
               html,
               "[data-study-id='#{first.id}'] [data-library-favorite][aria-pressed='true']"
             )

    assert html =~ "data-library-groups-dialog"
    assert length(Regex.scan(~r/data-study-id="#{first.id}"/, html)) == 1
    assert html =~ "data-method=\"delete\""
    assert html =~ "data-confirm="
    if path = System.get_env("LISTUDY_LIBRARY_PREVIEW"), do: File.write!(path, html)
  end

  test "stars use real favorites, are idempotent and preserve folders", %{
    owner: owner,
    other: other,
    studies: [first | _],
    foreign: foreign
  } do
    data = operation(owner, %{action: "create_group", name: "Openings"}) |> json_response(200)
    group = data["data"]["groups"] |> Map.keys() |> hd()
    operation(owner, %{action: "move", study_ids: [first.id], group: group}) |> json_response(200)

    for _ <- 1..2 do
      operation(owner, %{action: "set_favorite", study_id: first.id, favorite: true})
      |> json_response(200)
    end

    assert Enum.map(Listudy.Studies.get_studies_by_favorite!(owner.id), & &1.id) == [first.id]
    assert Enum.map(StudyLibrary.favorite_studies(owner.id), & &1.id) == [first.id]

    assert operation(other, %{action: "set_favorite", study_id: first.id, favorite: true})
           |> response(403)

    operation(owner, %{action: "set_favorite", study_id: foreign.id, favorite: true})
    |> json_response(200)

    assert Listudy.StudyFavorites.user_favorites_study(owner.id, foreign.id)

    for _ <- 1..2 do
      operation(owner, %{action: "set_favorite", study_id: first.id, favorite: false})
      |> json_response(200)
    end

    refute Listudy.StudyFavorites.user_favorites_study(owner.id, first.id)
    assert StudyLibrary.fetch(owner.id)["studies"][to_string(first.id)]["group"] == group

    assert operation(owner, %{action: "set_favorite", study_id: first.id, favorite: "true"})
           |> response(422)
  end

  test "legacy preference writes cannot overwrite library organization", %{owner: owner} do
    operation(owner, %{action: "create_group", name: "Keep this"}) |> json_response(200)
    before = StudyLibrary.fetch(owner.id)

    assert auth(owner)
           |> post("/api/progress/sync", %{key: "study_library_v1", value: "{}"})
           |> response(422)

    assert StudyLibrary.fetch(owner.id) == before

    refute Map.has_key?(
             auth(owner) |> get("/api/progress") |> json_response(200),
             "study_library_v1"
           )
  end
end
