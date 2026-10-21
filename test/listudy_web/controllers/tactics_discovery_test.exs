defmodule ListudyWeb.TacticsDiscoveryTest do
  use ListudyWeb.ConnCase

  defp preview(name, html) do
    if directory = System.get_env("LISTUDY_DISCOVERY_PREVIEW") do
      File.mkdir_p!(directory)
      File.write!(Path.join(directory, name <> ".html"), html)
    end
  end

  test "tactics includes visualization for an empty library without a separate practice menu", %{
    conn: conn
  } do
    html = conn |> get("/en/tactics") |> html_response(200)
    assert html =~ "/css/bootstrap_tactics.css"
    refute html =~ "/css/app.css"
    assert [_] = html_find(html, ".tactics-modes a[href='/en/blind-tactics']")
    assert [_] = html_find(html, ".tactics-modes a[href='/en/pieceless-tactics']")
    assert [_] = html_find(html, "form#library-puzzles[action='/en/tactics/puzzles/start']")
    assert [] = html_find(html, "[data-nav-section=practice]")
    assert [_] = html_find(html, "a[data-nav-section=tactics]")
    assert [_, _] = html_find(html, ".tactics-cards > .tactics-source-panel")

    assert [] =
             html_find(
               html,
               ".tactics-sources, .study-library-views, .tactics-source-panel[hidden]"
             )

    preview("library", html)
    collections = build_conn() |> get("/en/tactics?source=collections") |> html_response(200)
    assert [_, _] = html_find(collections, ".tactics-cards > .tactics-source-panel")
    assert [] = html_find(collections, ".tactics-source-panel[hidden]")
    preview("library-collections", collections)
  end

  test "visualization guides share compact help and accessible training actions", %{conn: conn} do
    for mode <- ["blind-tactics", "pieceless-tactics"] do
      html = conn |> get("/en/features/#{mode}") |> html_response(200)
      assert [_] = html_find(html, ".training-guide .training-header h1")
      assert [_] = html_find(html, ".training-actions a[href='/en/#{mode}']")
      assert [_] = html_find(html, ".training-guide img[width][height][alt]")
      assert [_] = html_find(html, "details.training-help")
      assert [] = html_find(html, "a button")
      refute html =~ "There is only one continuation"
      preview(mode, html)
    end
  end

  test "single puzzle sharing points players toward the existing board editor", %{conn: conn} do
    html = conn |> get("/en/tactics/custom") |> html_response(200)
    [editor] = html_find(html, ".training-tool-intro a.button")
    href = editor |> Floki.attribute("href") |> hd()
    assert href =~ "kind=tactics"
    assert href =~ "source=blank"
    assert [_] = html_find(html, "form#custom_tactic_form #fen_input[required]")
    assert [] = html_find(html, "#last_move_input[required]")
    assert [_] = html_find(html, "textarea#iframe_code[readonly]")
    assert [] = html_find(html, "a button")
    preview("custom", html)
    iframe = build_conn() |> get("/en/iframe/custom-tactic") |> html_response(200)
    preview("iframe", iframe)
  end

  test "embed documentation is shared and technical details stay secondary", %{conn: conn} do
    for {url, name} <- [{"/en/webmaster", "webmaster"}, {"/en/webmaster/custom-tactics", "embed"}] do
      html = conn |> get(url) |> html_response(200)
      assert [_] = html_find(html, ".training-tool-page iframe[title][loading=lazy]")
      assert [_] = html_find(html, ".training-help code") |> Enum.take(1)
      assert [] = html_find(html, "a button")
      preview(name, html)
    end
  end
end
