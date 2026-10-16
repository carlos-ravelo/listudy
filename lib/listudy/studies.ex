defmodule Listudy.Studies do
  @moduledoc """
  The Studies context.
  """

  import Ecto.Query, warn: false
  alias Listudy.Repo
  alias Listudy.Helpers

  alias Listudy.Studies.Study
  alias Listudy.StudyFavorites.StudyFavorite

  @doc """
  Returns the list of studies.

  ## Examples

      iex> list_studies()
      [%Study{}, ...]

  """
  def list_studies do
    Repo.all(Study)
  end

  @doc """
  Gets a single study.

  Raises `Ecto.NoResultsError` if the Study does not exist.

  ## Examples

      iex> get_study!(123)
      %Study{}

      iex> get_study!(456)
      ** (Ecto.NoResultsError)

  """
  def get_study!(id), do: Repo.get!(Study, id)

  def get_study_by_slug!(slug), do: Repo.get_by(Study, slug: slug)

  @doc """
  Gets a study by the slug id.
  E.g. get study abcdef-this-is-an-awesome-study by abcdef
  """
  def get_study_by_slug_start(id) do
    slug = id <> "%"

    query =
      from s in Study,
        where: like(s.slug, ^slug)

    Repo.one(query)
  end

  def get_study_by_user!(user) do
    query = from(Study, where: [user_id: ^user])
    Repo.all(query)
  end

  def get_public_studies_by_user!(user) do
    query = from(Study, where: [user_id: ^user, private: false])
    Repo.all(query)
  end

  def get_all_public_studies() do
    query =
      from(s in Study,
        join: f in StudyFavorite,
        on: s.id == f.study_id,
        where: s.private == false,
        group_by: s.id,
        select: %{
          :id => s.id,
          :slug => s.slug,
          :favorites => count(f.id),
          :updated_at => s.updated_at
        }
      )

    Repo.all(query)
  end

  def get_opening_studies(opening_id) do
    min_favs = Application.get_env(:listudy, :seo)[:study_min_favorites]

    query =
      from(s in Study,
        left_join: f in StudyFavorite,
        on: s.id == f.study_id,
        where: s.private == false and s.opening_id == ^opening_id,
        group_by: s.id,
        order_by: [desc: count(f.id)],
        limit: 6,
        having: count(f.id) >= ^min_favs,
        select: s
      )

    Repo.all(query) |> Repo.preload([:study_favorites, :user])
  end

  def get_studies_by_favorite!(user) do
    query =
      from s in Study,
        join: f in StudyFavorite,
        on: f.study_id == s.id,
        where: f.user_id == ^user and (not s.private or s.user_id == ^user),
        select: s

    Repo.all(query)
  end

  defp by_title(query, word) do
    word = "%" <> word <> "%"

    from c in query,
      where: like(fragment("lower(?)", c.title), fragment("lower(?)", ^word))
  end

  defp not_private(query) do
    from c in query,
      where: not c.private
  end

  defp title_limit(query) do
    from c in query,
      limit: 20
  end

  defp order_by_favorites(query) do
    from c in query,
      join: f in StudyFavorite,
      on: f.study_id == c.id,
      group_by: c.id,
      order_by: [desc: count(f.id)]
  end

  defp order_by_newest(query) do
    from c in query,
      order_by: [desc: c.updated_at]
  end

  defp by_color(query, color) when color in ["white", "black"] do
    from c in query, where: c.color == ^color
  end

  defp by_color(query, _color), do: query

  def search_by_title(word, order, color \\ "all")

  def search_by_title(word, "favorites", color) do
    query =
      Study
      |> by_title(word)
      |> not_private
      |> where([s], s.training_kind == "repertoire")
      |> by_color(color)
      |> title_limit
      |> order_by_favorites

    Repo.all(query) |> Repo.preload([:study_favorites, :user])
  end

  def search_by_title(word, "newest", color) do
    query =
      Study
      |> by_title(word)
      |> not_private
      |> where([s], s.training_kind == "repertoire")
      |> by_color(color)
      |> title_limit
      |> order_by_newest

    Repo.all(query) |> Repo.preload([:study_favorites, :user])
  end

  def search_by_title(title) do
    search_by_title(title, "favorites")
  end

  @doc """
  Creates a study.

  ## Examples

      iex> create_study(%{field: value})
      {:ok, %Study{}}

      iex> create_study(%{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def clone_study(%Study{} = source, user_id, copy_label) do
    title =
      String.slice(source.title, 0, max(0, 100 - String.length(copy_label) - 3)) <>
        " (" <> copy_label <> ")"

    file_id = Listudy.Slug.random_alnum()
    source_id = source.slug |> String.split("-") |> hd()
    path = Path.join("priv/static/study_pgn", file_id <> ".pgn")
    source_path = Path.join("priv/static/study_pgn", source_id <> ".pgn")

    attrs = source |> Map.take([:description, :color, :opening_id, :training_kind])

    attrs =
      Map.merge(attrs, %{
        title: title,
        slug: file_id <> "-" <> Listudy.Slug.slugify(title),
        user_id: user_id,
        private: true
      })

    with {:ok, pgn} <- File.read(source_path) do
      result =
        Repo.transaction(fn ->
          case create_study(attrs) do
            {:ok, study} ->
              case Listudy.StudyPgn.replace(path, pgn) do
                :ok -> study
                {:error, reason} -> Repo.rollback(reason)
              end

            {:error, changeset} ->
              Repo.rollback(changeset)
          end
        end)

      case result do
        {:ok, study} ->
          {:ok, study}

        {:error, reason} ->
          File.rm(path)
          {:error, reason}
      end
    end
  end

  def create_study(attrs \\ %{}) do
    %Study{}
    |> Study.changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Updates a study.

  ## Examples

      iex> update_study(study, %{field: new_value})
      {:ok, %Study{}}

      iex> update_study(study, %{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def update_study(%Study{} = study, attrs) do
    study
    |> Study.changeset(attrs)
    |> Repo.update()
  end

  @doc """
  Deletes a study.

  ## Examples

      iex> delete_study(study)
      {:ok, %Study{}}

      iex> delete_study(study)
      {:error, %Ecto.Changeset{}}

  """
  def delete_study(%Study{} = study) do
    Repo.delete(study)
  end

  @doc """
  Returns an `%Ecto.Changeset{}` for tracking study changes.

  ## Examples

      iex> change_study(study)
      %Ecto.Changeset{data: %Study{}}

  """
  def change_study(%Study{} = study, attrs \\ %{}) do
    Study.changeset(study, attrs)
  end

  def study_aggregate() do
    Study
    |> Helpers.count_by_month(:inserted_at)
    |> Repo.all()
  end
end
