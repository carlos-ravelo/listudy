defmodule ListudyWeb.AnalysisTrainingTest do
  use ListudyWeb.ConnCase
  import Ecto.Query
  alias Listudy.{Repo, Games}
  alias Listudy.Games.{Analyzer, Deviation, StudyGame, UserGame}

  setup do
    user =
      Repo.insert!(%Listudy.Users.User{
        username: "AnalysisTrainer",
        email: "analysis-trainer@example.com",
        lichess_username: "Player"
      })

    {:ok, user: user}
  end

  defp study(user, title, moves) do
    slug = "analysis#{System.unique_integer([:positive])}-study"

    path =
      Application.app_dir(:listudy, "priv/static/study_pgn/#{hd(String.split(slug, "-"))}.pgn")

    File.write!(path, "[Event \"#{title}\"]\n\n#{moves}")
    on_exit(fn -> File.rm(path) end)

    Repo.insert!(%Listudy.Studies.Study{
      user_id: user.id,
      title: title,
      slug: slug,
      color: "white",
      description: "Analysis test"
    })
  end

  defp game(user, moves, seconds \\ 0) do
    Repo.insert!(%UserGame{
      user_id: user.id,
      platform: "lichess",
      game_id_on_platform: "game#{System.unique_integer([:positive])}",
      white_player: "Player",
      black_player: "Opponent",
      pgn: moves,
      played_at:
        DateTime.utc_now() |> DateTime.add(seconds, :second) |> DateTime.truncate(:second)
    })
  end

  defp statuses(game),
    do:
      Repo.all(
        from s in StudyGame, where: s.user_game_id == ^game.id, select: {s.study_id, s.status}
      )
      |> Map.new()

  defp conn_for(user), do: build_conn() |> Pow.Plug.assign_current_user(user, [])

  test "a move accepted by the closest study is not a mistake against an alternative source", %{
    user: user
  } do
    reference = study(user, "Italian", "1. e4 e5 2. Nf3 Nc6 3. Bc4 *")
    daily = study(user, "Scotch", "1. e4 e5 2. Nf3 Nc6 3. d4 *")
    game = game(user, "1. e4 e5 2. Nf3 Nc6 3. d4 exd4 *")
    assert {:ok, 1} = Analyzer.analyze_all_user_studies(user.id, "lichess")
    assert statuses(game) == %{reference.id => "other_match", daily.id => "match"}
    assert Repo.aggregate(Deviation, :count) == 0
    assert {:ok, 0} = Analyzer.analyze_all_user_studies(user.id, "lichess")
  end

  test "equivalent sources produce one target and changes invalidate the whole comparison", %{
    user: user
  } do
    reference = study(user, "Reference", "1. e4 e5 2. Nf3 *")
    daily = study(user, "Summary", "1. e4 e5 2. Nf3 *")

    assert {:ok, _} =
             Listudy.StudyLibrary.update(user.id, %{
               "action" => "move",
               "study_ids" => [reference.id],
               "location" => "library"
             })

    game = game(user, "1. e4 e5 2. d4 *")
    assert {:ok, 1} = Analyzer.analyze_all_user_studies(user.id, "lichess")
    assert statuses(game) == %{reference.id => "other_match", daily.id => "deviation"}
    assert [%{study_id: id}] = Repo.all(Deviation)
    assert id == daily.id

    path =
      Application.app_dir(
        :listudy,
        "priv/static/study_pgn/#{hd(String.split(reference.slug, "-"))}.pgn"
      )

    File.write!(path, "1. e4 e5 2. d4 *")
    assert {:ok, 1} = Analyzer.analyze_all_user_studies(user.id, "lichess")
    assert statuses(game) == %{reference.id => "match", daily.id => "other_match"}
    assert Repo.aggregate(Deviation, :count) == 0
  end

  test "contradictory equally strong chapters remain ambiguous instead of becoming exercises", %{
    user: user
  } do
    first = study(user, "Knight", "1. e4 e5 2. Nf3 *")
    second = study(user, "Bishop", "1. e4 e5 2. Bc4 *")
    game = game(user, "1. e4 e5 2. d4 *")
    assert {:ok, 1} = Analyzer.analyze_all_user_studies(user.id, "lichess")
    assert statuses(game) == %{first.id => "ambiguous", second.id => "ambiguous"}
    assert Repo.aggregate(Deviation, :count) == 0
  end

  test "different departures from one position share one exercise and retain game history", %{
    user: user
  } do
    study = study(user, "Main repertoire", "1. e4 e5 2. Nf3 *")
    game(user, "1. e4 e5 2. d4 *", -60)
    game(user, "1. e4 e5 2. Bc4 *")
    assert {:ok, 2} = Analyzer.analyze_all_user_studies(user.id, "lichess")

    assert [%{times_repeated: 2, expected: "Nf3"}] =
             Games.get_unique_mistakes_to_train(study.id, user.id)

    conn = conn_for(user) |> get("/analysis")
    html = html_response(conn, 200)
    assert html =~ "games with deviations"
    assert html =~ "Disconnect and delete imported games"
    assert html =~ "data-confirm="
    assert [%{deviations: 2, relevant_games: 2, positions: [_]}] = conn.assigns.studies_stats
    train = conn_for(user) |> get("/analysis/#{study.id}/train") |> html_response(200)
    assert train =~ "data-study-pgn="
    assert train =~ "same reviews and study progress"
    if path = System.get_env("LISTUDY_ANALYSIS_PREVIEW"), do: File.write!(path, html)
    if path = System.get_env("LISTUDY_TRAIN_PREVIEW"), do: File.write!(path, train)

    if path = System.get_env("LISTUDY_STUDY_GAME_PREVIEW") do
      opening = Repo.one!(from o in Listudy.Openings.Opening, limit: 1)
      Repo.update!(Ecto.Changeset.change(study, opening_id: opening.id))
      html = conn_for(user) |> get("/en/studies/#{study.slug}") |> html_response(200)
      File.write!(path, html)
    end
  end

  test "game evidence endpoint is restricted to the study owner", %{user: user} do
    study = study(user, "Private practice", "1. e4 e5 *")

    own =
      conn_for(user)
      |> put_req_header("accept", "application/json")
      |> get("/analysis/studies/#{study.id}/positions")

    assert json_response(own, 200) == %{"positions" => []}

    other =
      Repo.insert!(%Listudy.Users.User{
        username: "OtherTrainer",
        email: "other-trainer@example.com"
      })

    assert_error_sent 404, fn ->
      conn_for(other)
      |> put_req_header("accept", "application/json")
      |> get("/analysis/studies/#{study.id}/positions")
    end
  end
end
