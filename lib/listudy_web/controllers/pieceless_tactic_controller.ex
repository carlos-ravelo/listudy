defmodule ListudyWeb.PiecelessTacticController do
  use ListudyWeb, :controller

  alias Listudy.PiecelessTactics
  alias Listudy.PiecelessTactics.PiecelessTactic

  def index(conn, _params) do
    piecelesstactic = PiecelessTactics.list_piecelesstactic()
    render(conn, "index.html", piecelesstactic: piecelesstactic)
  end

  def new(conn, _params) do
    changeset = PiecelessTactics.change_pieceless_tactic(%PiecelessTactic{})
    render(conn, "new.html", changeset: changeset)
  end

  def create(conn, %{"pieceless_tactic" => pieceless_tactic_params}) do
    case PiecelessTactics.create_pieceless_tactic(pieceless_tactic_params) do
      {:ok, pieceless_tactic} ->
        conn
        |> put_flash(:info, "Pieceless tactic created successfully.")
        |> redirect(to: Routes.pieceless_tactic_path(conn, :show, pieceless_tactic))

      {:error, %Ecto.Changeset{} = changeset} ->
        render(conn, "new.html", changeset: changeset)
    end
  end

  def show(conn, %{"id" => id}) do
    pieceless_tactic = PiecelessTactics.get_pieceless_tactic!(id)
    render(conn, "show.html", pieceless_tactic: pieceless_tactic)
  end

  def public(conn, %{"id" => id}) do
    pieceless_tactic = PiecelessTactics.get_pieceless_tactic!(id)

    render(conn, "public.html",
      pieceless_tactic: pieceless_tactic,
      solution_format: "uci",
      next_url: Routes.pieceless_tactic_path(conn, :random, conn.assigns.locale, id),
      noindex: true
    )
  end

  def puzzle(conn, %{"id" => id}) do
    tactic = Listudy.Tactics.get_tactic!(id)

    render(conn, "public.html",
      pieceless_tactic: %{id: tactic.id, fen: tactic.fen, solution: tactic.moves},
      solution_format: "san",
      next_url: Routes.pieceless_tactic_path(conn, :random, conn.assigns.locale),
      noindex: true
    )
  end

  def random(conn, params) do
    tactic = get_random_tactic(params) || PiecelessTactics.get_random_tactic()

    cond do
      tactic ->
        redirect(conn,
          to: Routes.pieceless_tactic_path(conn, :public, conn.assigns.locale, tactic)
        )

      tactic = Listudy.Tactics.get_random_tactic() ->
        redirect(conn,
          to: Routes.pieceless_tactic_path(conn, :puzzle, conn.assigns.locale, tactic)
        )

      true ->
        render(conn, "empty.html")
    end
  end

  # exlude the id from the pool of possible randoms
  defp get_random_tactic(%{"id" => id}) do
    Listudy.PiecelessTactics.get_random_tactic(id)
  end

  defp get_random_tactic(_) do
    Listudy.PiecelessTactics.get_random_tactic()
  end

  def edit(conn, %{"id" => id}) do
    pieceless_tactic = PiecelessTactics.get_pieceless_tactic!(id)
    changeset = PiecelessTactics.change_pieceless_tactic(pieceless_tactic)
    render(conn, "edit.html", pieceless_tactic: pieceless_tactic, changeset: changeset)
  end

  def update(conn, %{"id" => id, "pieceless_tactic" => pieceless_tactic_params}) do
    pieceless_tactic = PiecelessTactics.get_pieceless_tactic!(id)

    case PiecelessTactics.update_pieceless_tactic(pieceless_tactic, pieceless_tactic_params) do
      {:ok, pieceless_tactic} ->
        conn
        |> put_flash(:info, "Pieceless tactic updated successfully.")
        |> redirect(to: Routes.pieceless_tactic_path(conn, :show, pieceless_tactic))

      {:error, %Ecto.Changeset{} = changeset} ->
        render(conn, "edit.html", pieceless_tactic: pieceless_tactic, changeset: changeset)
    end
  end

  def delete(conn, %{"id" => id}) do
    pieceless_tactic = PiecelessTactics.get_pieceless_tactic!(id)
    {:ok, _pieceless_tactic} = PiecelessTactics.delete_pieceless_tactic(pieceless_tactic)

    conn
    |> put_flash(:info, "Pieceless tactic deleted successfully.")
    |> redirect(to: Routes.pieceless_tactic_path(conn, :index))
  end
end
