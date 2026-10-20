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

  test "equally strong continuations choose one stable best match and one exercise", %{
    user: user
  } do
    first = study(user, "Knight", "1. e4 e5 2. Nf3 *")
    second = study(user, "Bishop", "1. e4 e5 2. Bc4 *")
    game = game(user, "1. e4 e5 2. d4 *")
    assert {:ok, 1} = Analyzer.analyze_all_user_studies(user.id, "lichess")
    assert statuses(game) == %{first.id => "deviation", second.id => "other_match"}
    assert [%{study_id: id, expected_move: "Nf3"}] = Repo.all(Deviation)
    assert id == first.id

    assert {:ok, [{chosen, _}, {alternative, _}], []} =
             Analyzer.analyze_single_pgn(user.id, game.pgn)

    assert chosen.id == first.id
    assert alternative.id == second.id
  end

  test "automatic comparison groups sources, prefers daily studies and preserves explicit scope",
       %{user: user} do
    reference = study(user, "A reference", "1. e4 e5 2. Nf3 *")
    copy = study(user, "B reference", "1. e4 e5 2. Nf3 *")
    alternative = study(user, "C bishop line", "1. e4 e5 2. Bc4 *")
    daily = study(user, "Z daily repertoire", "1. e4 e5 2. Nf3 *")

    assert {:ok, _} =
             Listudy.StudyLibrary.update(user.id, %{
               "action" => "move",
               "study_ids" => [reference.id, copy.id, alternative.id],
               "location" => "library"
             })

    game = game(user, "1. e4 e5 2. d4 *")
    assert {:ok, 1} = Analyzer.analyze_all_user_studies(user.id, "lichess")

    assert statuses(game) == %{
             daily.id => "deviation",
             reference.id => "other_match",
             copy.id => "other_match",
             alternative.id => "other_match"
           }

    assert [%{study_id: id}] = Repo.all(Deviation)
    assert id == daily.id

    html =
      conn_for(user)
      |> get("/analysis/games/#{game.id}/compare?period=last_week")
      |> html_response(200)

    [root] = Floki.find(html, "#analysis-comparison")
    [json] = Floki.attribute(root, "data-comparisons")

    assert [%{"result" => %{"expected" => ["Nf3"]}}, %{"result" => %{"expected" => ["Bc4"]}}] =
             Jason.decode!(json)

    assert Floki.find(html, "[data-match-group='0'] .analysis-chapter-name")
           |> hd()
           |> Floki.text() == "Z daily repertoire"

    assert html =~ "Also in 2 chapters"
    assert html =~ "Other matching lines (1)"
    refute html =~ "Choose a result"
    refute html =~ "Saved study results"
    if path = System.get_env("LISTUDY_COMPARISON_PREVIEW"), do: File.write!(path, html)

    library = conn_for(user) |> get("/analysis/games?period=last_week") |> html_response(200)
    [href] = Floki.find(library, ".analysis-game-row") |> Floki.attribute("href")
    refute href =~ "compare_study_id"
    assert href =~ "period=last_week"

    scoped =
      conn_for(user) |> get("/analysis/games?study_id=#{alternative.id}") |> html_response(200)

    [href] = Floki.find(scoped, ".analysis-game-row") |> Floki.attribute("href")
    assert href =~ "compare_study_id=#{alternative.id}"

    game(user, "1. d4 d5 *")
    assert {:ok, 1} = Analyzer.analyze_all_user_studies(user.id, "lichess")
    unmatched = conn_for(user) |> get("/analysis/games?status=out_of_scope") |> html_response(200)
    [row] = Floki.find(unmatched, ".analysis-game-row")

    assert Floki.find(row, ".analysis-status-out_of_scope") |> Floki.text() ==
             "No matching chapter"

    assert Floki.find(row, ".analysis-game-study-name") == []
  end

  test "a study with conflicting chapters still chooses and trains one exact chapter", %{
    user: user
  } do
    study =
      study(user, "Two choices", "1. e4 e5 2. Nf3 *\n\n[Event \"Bishop\"]\n\n1. e4 e5 2. Bc4 *")

    game = game(user, "1. e4 e5 2. d4 *")
    assert {:ok, 1} = Analyzer.analyze_all_user_studies(user.id, "lichess")
    assert statuses(game) == %{study.id => "deviation"}
    assert [%{expected_move: "Nf3"}] = Repo.all(Deviation)
    assert {:ok, [{_, result}, {_, _}], []} = Analyzer.analyze_single_pgn(user.id, game.pgn)
    assert result["chapter_index"] == 0
    assert result["expected"] == ["Nf3"]
  end

  test "incomplete repertoire comparison shows valid matches and names the unavailable study", %{
    user: user
  } do
    reference = study(user, "A reference", "1. e4 e5 2. Nf3 *")
    valid = study(user, "Z daily repertoire", "1. e4 e5 2. Nf3 *")

    assert {:ok, _} =
             Listudy.StudyLibrary.update(user.id, %{
               "action" => "move",
               "study_ids" => [reference.id],
               "location" => "library"
             })

    invalid = study(user, "Needs PGN repair", "1. e4 e5 2. Ke3 *")
    game = game(user, "1. e4 e5 2. d4 *")
    assert {:ok, 1} = Analyzer.analyze_all_user_studies(user.id, "lichess")

    assert statuses(game) == %{
             valid.id => "ambiguous",
             reference.id => "ambiguous",
             invalid.id => "error"
           }

    assert Repo.aggregate(Deviation, :count) == 0

    assert {:ok, [{selected, _}, {_, _}], [%{id: unavailable_id}]} =
             Analyzer.analyze_single_pgn(user.id, game.pgn)

    assert selected.id == valid.id
    assert unavailable_id == invalid.id

    library = conn_for(user) |> get("/analysis/games") |> html_response(200)
    [row] = Floki.find(library, ".analysis-game-row")
    assert Floki.find(row, ".analysis-status-ambiguous") |> Floki.text() == "Matching line found"
    assert Floki.find(row, ".analysis-game-open") |> Floki.text() == "View comparison"

    assert Floki.find(row, ".analysis-game-study-name") |> Enum.map(&Floki.text/1) == [
             valid.title
           ]

    refute library =~ "Comparison needs review"

    html = conn_for(user) |> get("/analysis/games/#{game.id}/compare") |> html_response(200)
    assert html =~ "Comparison incomplete"
    assert html =~ "Needs PGN repair"
    assert html =~ "Try comparison again"

    [practice] =
      Floki.find(html, "#analysis-outcome-0 a.button-primary") |> Floki.attribute("href")

    assert practice =~ "practice_expected=Nf3"
    assert practice =~ "/#{valid.slug}"

    if path = System.get_env("LISTUDY_COMPARISON_PREVIEW"),
      do: File.write!(path <> ".partial.html", html)
  end

  test "live comparison does not present saved outcomes as current results", %{user: user} do
    study = study(user, "Current repertoire", "1. e4 e5 2. Nf3 *")
    game = game(user, "1. e4 e5 2. d4 *")
    assert {:ok, 1} = Analyzer.analyze_all_user_studies(user.id, "lichess")
    assert statuses(game) == %{study.id => "deviation"}

    path =
      Application.app_dir(
        :listudy,
        "priv/static/study_pgn/#{hd(String.split(study.slug, "-"))}.pgn"
      )

    File.write!(path, "[Event \"Current repertoire\"]\n\n1. e4 e5 2. d4 *")
    html = conn_for(user) |> get("/analysis/games/#{game.id}/compare") |> html_response(200)
    assert html =~ "Game ended in your repertoire"
    refute html =~ "Saved study results"
    refute html =~ "Practice this line"
    refute html =~ "data-select-group"
    assert html =~ "Game PGN"

    if path = System.get_env("LISTUDY_COMPARISON_PREVIEW"),
      do: File.write!(path <> ".single.html", html)
  end

  test "different departures from one position share one exercise and retain game history", %{
    user: user
  } do
    study = study(user, "Main repertoire", "1. e4 e5 2. Nf3 *")
    game(user, "[Result \"1-0\"]\n\n1. e4 e5 2. d4 1-0", -60)
    game(user, "[Result \"0-1\"]\n\n1. e4 e5 2. Bc4 0-1")
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

    if path = System.get_env("LISTUDY_GAMES_PREVIEW") do
      File.write!(path, conn_for(user) |> get("/analysis/games") |> html_response(200))

      filtered =
        conn_for(user)
        |> get(
          "/analysis/games?platform=lichess&study_id=#{study.id}&status=deviation&period=last_week"
        )
        |> html_response(200)

      File.write!(path <> ".filtered.html", filtered)
    end

    if path = System.get_env("LISTUDY_STUDY_GAME_PREVIEW") do
      opening = Repo.one!(from o in Listudy.Openings.Opening, limit: 1)
      Repo.update!(Ecto.Changeset.change(study, opening_id: opening.id))
      html = conn_for(user) |> get("/en/studies/#{study.slug}") |> html_response(200)
      File.write!(path, html)
    end
  end

  test "game rows identify the opponent and separate game outcomes from repertoire comparison", %{
    user: user
  } do
    first = game(user, "[Result \"1-0\"]\n\n1. e4 e5 1-0")
    first |> Ecto.Changeset.change(result: "mate") |> Repo.update!()
    unknown = game(user, "1. e4 e5 *")
    unknown |> Ecto.Changeset.change(result: "resign") |> Repo.update!()
    library = Games.ImportedGames.list_recent(user.id, %{})
    won = Enum.find(library.games, &(&1.id == first.id))
    assert won.player_color == "white"
    assert won.game_result == "1-0"
    assert ListudyWeb.AnalysisView.game_outcome(won) == "Won"
    assert ListudyWeb.AnalysisView.game_opponent(won) == "vs Opponent"
    assert Enum.find(library.games, &(&1.id == unknown.id)).game_result == nil
    html = conn_for(user) |> get("/analysis/games?platform=lichess") |> html_response(200)
    assert html =~ "You as White"
    assert html =~ "Game result: Won"
    assert html =~ "Result unavailable"
    assert html =~ "data-game-filters-more"
    assert html =~ "Remove platform filter"
    assert html =~ "data-local-time"
  end

  test "black-side results and empty-library states are explicit", %{user: user} do
    user = user |> Ecto.Changeset.change(chess_com_username: "ChessPlayer") |> Repo.update!()
    game = game(user, "[Result \"0-1\"]\n\n1. e4 e5 0-1")

    game
    |> Ecto.Changeset.change(
      platform: "chess_com",
      white_player: "Rival",
      black_player: "CHESSPLAYER"
    )
    |> Repo.update!()

    assert [%{player_color: "black", game_result: "0-1"} = row] =
             Games.ImportedGames.list_recent(user.id, %{}).games

    assert ListudyWeb.AnalysisView.game_outcome(row) == "Won"
    assert ListudyWeb.AnalysisView.game_opponent(row) == "vs Rival"
    html = conn_for(user) |> get("/analysis/games?platform=lichess") |> html_response(200)
    assert html =~ "No games match these filters"
    assert html =~ "Reset filters"

    other =
      Repo.insert!(%Listudy.Users.User{
        username: "EmptyLibrary",
        email: "empty-library@example.com"
      })

    empty = conn_for(other) |> get("/analysis/games") |> html_response(200)
    assert empty =~ "No imported games yet"
    assert empty =~ "Connect or sync games"
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
