defmodule ListudyWeb.BootstrapSiteTest do
  use ListudyWeb.ConnCase
  import Phoenix.LiveViewTest
  alias Listudy.Repo

  defp preview(name, html) do
    if directory = System.get_env("LISTUDY_SITE_PREVIEW") do
      File.mkdir_p!(directory)
      File.write!(Path.join(directory, name <> ".html"), html)
    end
  end

  test "public study search retains query, color, ordering and private visibility", %{conn: conn} do
    user =
      Repo.insert!(%Listudy.Users.User{
        username: "SearchOwner",
        email: "bootstrap-search@example.com"
      })

    for {color, private} <- [{"white", false}, {"black", false}, {"black", true}] do
      Repo.insert!(%Listudy.Studies.Study{
        user_id: user.id,
        title: "Bootstrap search #{color} #{private}",
        color: color,
        slug: "bootstrap#{System.unique_integer([:positive])}-search",
        private: private,
        description: "Search repertoire",
        updated_at: ~N[2099-01-01 00:00:00]
      })
    end

    html = conn |> get("/en/studies/search") |> html_response(200)
    assert html =~ "/css/bootstrap_discovery.css"
    refute html =~ "/css/app.css"
    preview("search", html)
    {:ok, view, _html} = live(conn, "/en/studies/search")

    html =
      view
      |> element("form[role=search]")
      |> render_change(%{"q" => "Bootstrap search", "ordering" => "newest", "color" => "all"})

    assert html =~ "Bootstrap search white false"
    assert html =~ "Bootstrap search black false"
    refute html =~ "Bootstrap search black true"
    html = render_hook(view, "set-color", %{"color" => "black"})
    assert html =~ "Bootstrap search black false"
    refute html =~ "Bootstrap search white false"

    html =
      view
      |> element("form[role=search]")
      |> render_submit(%{"q" => "not-a-study", "ordering" => "favorites", "color" => "all"})

    assert html =~ "No studies found"
    preview("search-empty", html)
  end

  test "representative site pages render their existing workflows", %{conn: conn} do
    for {name, route} <- [
          {"home", "/en"},
          {"privacy", "/en/privacy"},
          {"signin", "/registration/new"},
          {"events", "/en/events"},
          {"openings", "/en/openings"},
          {"players", "/en/players"},
          {"motif", "/en/motif"},
          {"books", "/en/books"},
          {"endgames", "/en/endgames"},
          {"stockfish", "/en/play-stockfish"},
          {"custom", "/en/tactics/custom"},
          {"iframe", "/en/iframe/custom-tactic"}
        ] do
      html = build_conn() |> get(route) |> html_response(200)
      assert html =~ "/css/bootstrap_site.css"
      refute html =~ "/css/app.css"
      refute html =~ "modal_open"
      preview(name, html)
    end

    user =
      Repo.insert!(%Listudy.Users.User{
        username: "BootstrapAdmin",
        email: "bootstrap-admin@example.com",
        role: "admin"
      })

    html =
      conn
      |> Pow.Plug.assign_current_user(user, [])
      |> get("/admin/puzzle-imports")
      |> html_response(200)

    preview("admin", html)
  end

  test "book disclosures and recommendations use shared dialogs", %{conn: conn} do
    conn = get(conn, "/en/books")

    book = %{
      slug: "bootstrap-book",
      title: "Bootstrap Book",
      summary: "Book summary",
      amazon_id: "0000000",
      author: %{name: "Author"},
      expert_recommendations: [
        %{player: %{slug: "expert", name: "Expert"}, text: "A recommendation", source: "Source"}
      ]
    }

    thumb =
      Phoenix.View.render_to_string(ListudyWeb.BookView, "thumb.html",
        conn: conn,
        locale: "en",
        book: book
      )

    assert thumb =~ "data-bs-toggle"
    assert thumb =~ "ui-modal"
    refute thumb =~ "modal_open"
    refute thumb =~ "modal_close"
    home = build_conn() |> get("/en") |> html_response(200)
    preview("book", String.replace(home, "</main>", thumb <> "</main>"))
  end
end
