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

  test "tactics and favorites toggle independently and retain search and color", %{conn: conn} do
    user = Repo.insert!(%Listudy.Users.User{username: "ToggleOwner", email: "toggle@example.com"})

    for {kind, color, private} <- [
          {"repertoire", "black", false},
          {"tactics", "black", false},
          {"tactics", "white", false},
          {"tactics", "black", true}
        ] do
      Repo.insert!(%Listudy.Studies.Study{
        user_id: user.id,
        title: "Toggle discovery #{kind} #{color} #{private}",
        slug: "toggle#{System.unique_integer([:positive])}-search",
        training_kind: kind,
        color: color,
        private: private
      })
    end

    {:ok, view, _html} = live(conn, "/en/studies/search")
    refute has_element?(view, "input[type=radio][name=ordering]")
    assert has_element?(view, "button[phx-click=toggle-kind][aria-pressed=false]")

    view
    |> element("form[role=search]")
    |> render_change(%{"q" => "Toggle discovery", "color" => "black"})

    html = view |> element("button[phx-click=toggle-kind]") |> render_click()
    assert html =~ "Toggle discovery tactics black false"
    refute html =~ "Toggle discovery repertoire"
    refute html =~ "Toggle discovery tactics white"
    refute html =~ "Toggle discovery tactics black true"

    html = view |> element("button[phx-click=toggle-ordering]") |> render_click()
    assert html =~ "Toggle discovery tactics black false"
    assert has_element?(view, "button[phx-click=toggle-kind][aria-pressed=true]")
    assert has_element?(view, "button[phx-click=toggle-ordering][aria-pressed=true]")

    html = view |> element("button[phx-click=toggle-kind]") |> render_click()
    assert html =~ "Toggle discovery repertoire black false"
    refute html =~ "Toggle discovery tactics"
    assert has_element?(view, "button[phx-click=toggle-ordering][aria-pressed=true]")

    view |> element("button[phx-click=toggle-ordering]") |> render_click()
    assert has_element?(view, "button[phx-click=toggle-ordering][aria-pressed=false]")
    assert has_element?(view, "#study-search[value='Toggle discovery']")
  end

  test "search stars save and remove tactics favorites across reloads", %{conn: conn} do
    owner =
      Repo.insert!(%Listudy.Users.User{username: "StarOwner", email: "star-owner@example.com"})

    visitor =
      Repo.insert!(%Listudy.Users.User{
        username: "StarVisitor",
        email: "star-visitor@example.com"
      })

    collection =
      Repo.insert!(%Listudy.Studies.Study{
        title: "Search star collection",
        slug: "search-star-collection",
        user_id: owner.id,
        training_kind: "tactics",
        color: "white",
        private: false
      })

    private =
      Repo.insert!(%Listudy.Studies.Study{
        title: "Private star collection",
        slug: "private-star-collection",
        user_id: owner.id,
        training_kind: "tactics",
        private: true
      })

    conn = Pow.Plug.assign_current_user(conn, visitor, [])
    {:ok, view, _html} = live(conn, "/en/studies/search")
    view |> element("button[phx-click=toggle-kind]") |> render_click()
    selector = "#study-result-#{collection.id} button[phx-click=toggle-favorite]"
    assert has_element?(view, selector <> "[aria-pressed=false]")
    view |> element(selector) |> render_click()
    assert has_element?(view, selector <> "[aria-pressed=true]")
    assert Listudy.StudyFavorites.user_favorites_study(visitor.id, collection.id)
    refute Listudy.StudyFavorites.user_favorites_study(owner.id, collection.id)

    {:ok, reloaded, _html} = live(conn, "/en/studies/search")
    reloaded |> element("button[phx-click=toggle-kind]") |> render_click()
    assert has_element?(reloaded, selector <> "[aria-pressed=true]")
    reloaded |> element(selector) |> render_click()
    assert has_element?(reloaded, selector <> "[aria-pressed=false]")
    refute Listudy.StudyFavorites.user_favorites_study(visitor.id, collection.id)

    render_hook(reloaded, "toggle-favorite", %{
      "id" => to_string(private.id),
      "favorite" => "true"
    })

    refute Listudy.StudyFavorites.user_favorites_study(visitor.id, private.id)
    assert has_element?(reloaded, "[role=alert]", "Could not update favorites")
  end

  test "anonymous search stars lead to sign in", %{conn: conn} do
    owner =
      Repo.insert!(%Listudy.Users.User{
        username: "AnonymousStarOwner",
        email: "anonymous-star@example.com"
      })

    study =
      Repo.insert!(%Listudy.Studies.Study{
        title: "Anonymous star study",
        slug: "anonymous-star-study",
        user_id: owner.id,
        private: false
      })

    {:ok, view, _html} = live(conn, "/en/studies/search")

    assert has_element?(
             view,
             "#study-result-#{study.id} a.study-list-favorites[href='/session/new']"
           )

    refute has_element?(view, "button[phx-click=toggle-favorite]")
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
