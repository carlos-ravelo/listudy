# Introductory opening studies

The default seed installs five public English repertoires from the bundled
Lichess PGNs listed in `catalog.json`. It does not generate chess explanations.

| Study | Side | Chapters | Source annotations |
| --- | --- | --- | --- |
| Italian Game | White | 2 | [BobbyMen](https://lichess.org/study/pPHITVvn) |
| King's Indian Defense | Black | 3 | [LeninPerez](https://lichess.org/study/rlgqOaZK), [EamonMont](https://lichess.org/study/Joy5NGT1/nCf4188a) |
| Queen's Gambit Declined | Black | 3 | [LeninPerez](https://lichess.org/study/4NDhDHBV) |
| London System | White | 3 | [MatteoHaas / FunnyAnimatorJimTV](https://lichess.org/study/lwahBieP) |
| Queen's Gambit | White | 3 | [caelT8](https://lichess.org/study/DAmLK0ug), [ErinYu](https://lichess.org/study/5wYcdjXQ/MrDITFgI) |

These are small samples for choosing an opening, not complete repertoires. The
King's Indian is included as requested; the Queen's Gambit Declined supplies a
second option for Black against `d4`. The Italian uses the two previously
selected BobbyMen chapters. The other studies combine introductory lines with
an opening excerpt from an annotated game. The complete games remain linked
through their original `ChapterURL` headers and the study's source links.

## Provenance and selection

Sources were downloaded through the public Lichess PGN API on 19 October 2026.
The manifest records each selected chapter, source annotator, author credits,
source checksum, excerpt limit and bundled PGN checksum. A public export is not
labelled as CC0 or as carrying some other unverified licence.

All retained moves, comments, starting comments, annotation glyphs, arrows and
variations are from the source PGNs. No chess prose was added or rewritten.
Selection and PGN formatting are the only editorial transformations, together
with these metadata changes:

- Stable `ListudyChapterId` identities and the training `Orientation` are added.
- `Event` uses the source chapter title so chapter selection is understandable.
- Excerpts retain at most 12 full moves per branch (10 in the Queen's Gambit
  model game). `ListudyExcerpt` identifies them; their result becomes `*`, with
  the original result retained in `ListudyOriginalResult`.
- London comments contain original `%anno` credits to FunnyAnimatorJimTV as
  well as MatteoHaas's export attribution; both are credited.
- The Erin game export has the generic annotator `lichess.org`. Its
  [study page](https://lichess.org/study/5wYcdjXQ/MrDITFgI) identifies ErinYu in
  annotation credits, recorded separately as `ListudySourceAuthor` without
  replacing the original `Annotator` field.

The study details display **Imported by** for the local owner and link the
**Source annotations** and **Original studies** separately. Source descriptions
also identify the annotators. No account is created in an annotator's name.

Original source commentary may contain the author's spelling, historical
assessments or instructions for Lichess's interactive lessons. Attribution and
legal move validation do not certify every strategic statement.

The earlier AI-assisted `italian_beginner_en.pgn` and its engine review remain
research artifacts; they are not part of this catalogue or installed by this
seed. Previously installed studies and owner edits are left untouched.

## Install and verify

```sh
mix run priv/repo/seed_openings.exs
LISTUDY_SEED_OWNER=your_username mix run priv/repo/seed_beginner_studies.exs
```

The normal `priv/repo/seeds.exs` setup installs these studies too, using its
existing `Arne` account unless `LISTUDY_SEED_OWNER` is supplied. Each installed
study prints a link opening Sparring. Installation uses bundled files and
requires no Lichess network access.

Repeat runs preserve study records, PGNs, ownership and progress identities.
Existing PGNs without matching study records cause a failure instead of being
replaced. Each new study validates its checksum and all PGN branches through
the app's existing Python chess boundary before writing the file and record.

```sh
python3 scripts/verify_starter_studies.py
# Compare every retained comment and branch with fresh source exports:
python3 scripts/verify_starter_studies.py --fetch-sources
mix test test/listudy/beginner_studies_test.exs test/listudy/starter_openings_test.exs
```

Fresh source verification fails if an author changes the audited source
snapshot. Review that change before updating the manifest or bundled PGN.
