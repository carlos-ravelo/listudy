defmodule ListudyWeb.PuzzlePreferences do
  alias Listudy.PuzzleCatalog

  def filters(conn, params) do
    defaults =
      with value when is_binary(value) <- conn.req_cookies["puzzle_rating"],
           [minimum, maximum] <- String.split(value, ":"),
           {low, ""} <- Integer.parse(minimum),
           {high, ""} <- Integer.parse(maximum),
           true <- low >= 0 and high <= 4000 and low <= high do
        %{"min_rating" => minimum, "max_rating" => maximum}
      else
        _ -> %{}
      end

    PuzzleCatalog.filters(Map.merge(defaults, params))
  end
end
