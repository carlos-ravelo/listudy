# LISTUDY_SEED_OWNER=your_username mix run priv/repo/seed_beginner_studies.exs
# Seeds with an opening_slug require seed_openings.exs; others use Uncategorized.
owner =
  Listudy.Repo.get_by!(Listudy.Users.User,
    username: System.get_env("LISTUDY_SEED_OWNER") || "Arne"
  )

case Listudy.Seeds.BeginnerStudies.seed(owner.id) do
  {:ok, installed} ->
    for {status, study} <- installed do
      path =
        if study.training_kind == "tactics",
          do: "/en/tactics/collections/#{study.slug}",
          else: "/en/studies/#{study.slug}?mode=sparring"

      IO.puts("#{study.title}: #{status}; #{path}")
    end

  {:error, reason} ->
    raise "Could not seed beginner studies: #{inspect(reason)}"
end
