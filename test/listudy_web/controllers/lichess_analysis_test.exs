defmodule ListudyWeb.LichessAnalysisTest do
  use ListudyWeb.ConnCase
  import Ecto.Query
  alias Listudy.Repo

  test "study renders the Lichess analysis action" do
    user =
      Repo.insert!(%Listudy.Users.User{
        username: "AnalysisLink",
        email: "analysis-link@example.com"
      })

    opening = Repo.one!(from o in Listudy.Openings.Opening, limit: 1)
    prefix = "analysislink#{System.unique_integer([:positive])}"

    study =
      Repo.insert!(%Listudy.Studies.Study{
        title: "Analysis link test",
        description: "Analysis link test",
        slug: prefix <> "-study",
        user_id: user.id,
        opening_id: opening.id,
        private: false,
        color: "white"
      })

    path = Application.app_dir(:listudy, "priv/static/study_pgn/#{prefix}.pgn")
    File.write!(path, "[Event \"Analysis link\"]\n\n1. e4 e5 *")
    on_exit(fn -> File.rm(path) end)

    html = build_conn() |> get("/en/studies/#{study.slug}") |> html_response(200)
    assert html =~ "id=\"analysis_board\""
    assert html =~ "data-import-prompt="

    if preview = System.get_env("LISTUDY_LICHESS_ANALYSIS_PREVIEW"),
      do: File.write!(preview, html)
  end
end
