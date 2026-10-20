# Italian study comparison — 19 October 2026

The three AI-assisted chapters in `priv/repo/data/studies/italian_beginner_en.pgn`
were compared with the first two chapters exported from
[BobbyMen's study](https://lichess.org/study/pPHITVvn). The downloaded PGN identifies
the annotator as `https://lichess.org/@/BobbyMen`.

## Lines

| Our chapter | Relationship to BobbyMen's two chapters |
| --- | --- |
| Quiet development against `...Bc5` | Identical first three complete moves. Despite different move orders, both sources reach our position after White's sixth move. Subsequent moves differ: BobbyMen includes `a4` and `h3`; our example retreats the bishop to `b3`. |
| Two Knights with `...Be7` | Only the first five plies coincide, through `3.Bc4`. BobbyMen chooses `3...Bc5` and does not cover our `3...Nf6` branch. |
| Central break `...d5` | Only the first five plies coincide. This branch is not covered by the two reference chapters. |

Position comparison used piece placement, side to move, castling rights and legal
en-passant availability. Move counters were excluded so that different move
orders could match. The comparison does not establish identical repetition
histories or identical draw-claim rights.

## Comments

BobbyMen's first chapter has one commented position and the second has five.
Their comments support the general themes of development, central control,
castling and preparing `d4` with `c3`. They do not independently verify all of our
move-specific comments, and do not cover our Two Knights examples.

One teaching detail in our first chapter needs clarification: after `Nbd2`, the
knight blocks the c1 bishop's diagonal through d2. Developing that bishop is a
future task, requiring the knight to move or the b2 pawn to move first. `Nf1` is
legal in the final position. Saying merely to develop the c1 bishop omits that
prerequisite.

## Additional verification

All 50 plies in our three lines were legal. Nineteen explicit positional checks
verified the concrete claims about attacks, defences, castling, material and
blocked diagonals. These checks do not certify strategic or teaching quality.

The follow-up review used Stockfish 19 Lite WASM, 64 MiB hash, with searches
limited to depth 20 or 1,500 ms per search. Each selected move was compared with
an unrestricted search from the same position, retaining the complete history.

| Our chapter | Minimum completed search depth | Largest estimated move loss |
| --- | --- | --- |
| Quiet development | 19 | 13 centipawns, `8.Bb3` |
| Two Knights | 19 | 8 centipawns, `4...Be7` |
| Central break | 17 | 43 centipawns, `4...d5` |

Finite engine searches provide estimates. These results do not prove optimal
play, validate prose explanations, or provide a 100% correctness guarantee.
Matching another public study would not supply that guarantee either.

## Published material for a source-based seed

- [Capablanca, Chess Fundamentals, sections 6–8](https://www.gutenberg.org/files/33870/33870-h/33870-h.htm):
  general opening strategy, central control and traps. This is a source for
  principles rather than a complete modern repertoire of common openings.
- [Edward Lasker, Chess Strategy, chapter IV and games 4–6](https://www.gutenberg.org/cache/epub/5614/pg5614-images.html):
  opening principles and annotated Giuoco Piano examples. Its historical
  assessments should remain identified as the author's assessments.
- [Wikibooks, Chess Opening Theory — Giuoco Pianissimo](https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._e4/1...e5/2._Nf3/2...Nc6/3._Bc4/3...Bc5/4._c3/4...Nf6/5._d3):
  a concrete opening sequence, development plans and a short theory table.

For subsequent seeds, select the published source first, retain author/source
and applicable licence information, and transcribe its lines and annotations.
Any notation conversion, selection or omission should be recorded. Do not extend
the author's line with AI-generated chess explanations or label the imported
annotations as the uploader's own work.
