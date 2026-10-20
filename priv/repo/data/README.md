# Starter opening catalogue

`common_openings.json` contains ten familiar opening families selected for the
study form. This is a starter selection, not a statistical popularity ranking.
Names, ECO classifications and PGN lines come from
[lichess-org/chess-openings](https://github.com/lichess-org/chess-openings),
released under CC0. FEN and UCI moves are derived from those PGN lines.

Populate an existing database with:

```sh
mix run priv/repo/seed_openings.exs
```

The script also runs during `mix ecto.setup`. Repeating it skips existing names
and slugs, preserves administrator edits, and generates missing board images
with the existing Python chess renderer. It needs no network access.

Manage the records at `/admin/openings`. The study form already reads this table
and displays opening names alphabetically, without ECO codes in its labels.
