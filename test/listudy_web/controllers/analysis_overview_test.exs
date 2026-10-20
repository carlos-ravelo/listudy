defmodule ListudyWeb.AnalysisOverviewTest do
  use ListudyWeb.ConnCase
  alias Listudy.Repo

  setup do
    user =
      Repo.insert!(%Listudy.Users.User{username: "OverviewUser", email: "overview@example.com"})

    {:ok, user: user}
  end

  defp owned_conn(user), do: build_conn() |> Pow.Plug.assign_current_user(user, [])
  defp owned_json_conn(user), do: owned_conn(user) |> put_req_header("accept", "application/json")

  test "overview defaults to last week and sorts by deviations while honoring all time", %{
    user: user
  } do
    studies =
      for {title, recent_count, old_count} <- [{"Alpha", 1, 3}, {"Zulu", 2, 0}] do
        study =
          Repo.insert!(%Listudy.Studies.Study{
            title: title,
            slug: String.downcase(title),
            description: "A study for the overview",
            color: "white",
            user_id: user.id
          })

        for index <- 1..(recent_count + old_count) do
          date =
            DateTime.utc_now()
            |> DateTime.add(if(index <= recent_count, do: -60, else: -15 * 86400), :second)
            |> DateTime.truncate(:second)

          game =
            Repo.insert!(%Listudy.Games.UserGame{
              user_id: user.id,
              platform: "lichess",
              game_id_on_platform: "#{title}#{index}",
              pgn: "1. e4 *",
              played_at: date
            })

          Repo.insert!(%Listudy.Games.StudyGame{
            study_id: study.id,
            user_game_id: game.id,
            status: "deviation"
          })
        end

        study
      end

    assert length(studies) == 2
    conn = owned_conn(user) |> get("/analysis")
    assert html_response(conn, 200) =~ "data-repertoires"
    assert conn.assigns.filter == "last_week"

    assert Enum.map(conn.assigns.studies_stats, &{&1.study.title, &1.deviations}) == [
             {"Zulu", 2},
             {"Alpha", 1}
           ]

    all = owned_conn(user) |> get("/analysis?filter=all")
    assert all.assigns.filter == "all"

    assert Enum.map(all.assigns.studies_stats, &{&1.study.title, &1.deviations}) == [
             {"Alpha", 4},
             {"Zulu", 2}
           ]
  end

  test "availability is account scoped and skips disconnected or syncing accounts", %{user: user} do
    assert owned_json_conn(user) |> get("/analysis/new-games/lichess") |> json_response(200) == %{
             "status" => "disconnected"
           }

    assert owned_json_conn(user) |> get("/analysis/new-games/unknown") |> json_response(400) == %{
             "error" => "Unknown platform"
           }

    user = user |> Ecto.Changeset.change(lichess_username: "user") |> Repo.update!()
    Listudy.Games.GameSync.start(user.id, "lichess")

    assert owned_json_conn(user) |> get("/analysis/new-games/lichess") |> json_response(200) == %{
             "status" => "syncing"
           }

    status = owned_json_conn(user) |> get("/analysis/sync-status") |> json_response(200)
    assert status["lichess"]["status"] == "running"
  end
end
