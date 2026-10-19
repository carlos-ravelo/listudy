# LISTUDY_SEED_OWNER=your_username mix run priv/repo/seed_beginner_studies.exs
# The opening catalogue must already exist; see seed_openings.exs.
owner =
  Listudy.Repo.get_by!(Listudy.Users.User,
    username: System.get_env("LISTUDY_SEED_OWNER") || "Arne"
  )

case Listudy.Seeds.BeginnerStudies.seed(owner.id) do
  {:ok, installed} ->
    for {status, study} <- installed do
      IO.puts("#{study.title}: #{status}; /en/studies/#{study.slug}?mode=sparring")
    end

  {:error, reason} ->
    raise "Could not seed beginner studies: #{inspect(reason)}"
end
