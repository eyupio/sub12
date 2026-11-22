# Simulation realism

How the simulated community is made to read as people. Read it before adding a simulated action or persona trait. It appends to the root `CLAUDE.md` and never overrides it; sections the text names but that are not here (for example "Placeholder credentials are refused" or "Outgoing public URLs") are in `CLAUDE.md`.

## Simulation Realism

Everything that makes the simulated community look inhabited lives in
`service/simulation.go`. The guiding rule: **anything a visitor could use to
tell one persona from another must be stable and self-consistent**. Traits are
derived from an FNV hash of the persona's id (`personaTraitsFor`), so the same
account shoots to the same standard, writes in the same voice, and shoots the
same ground forever — across restarts, with nothing extra stored.

- **Character** — `personaTraits` fixes skill, consistency, talkativeness,
  sociability, competitiveness, activity level, writing voice, home ground,
  discipline, usual distance, indoor/outdoor, and rifle/pellet choice. The bio
  written at provisioning is composed from those same values, so the profile,
  the gear list and the cards all agree.
- **Uneven activity** — actor selection is weighted by a *cubed* activity trait,
  so a keen minority generates most of the traffic and there is a quiet tail.
  A persona also holds the floor for a short run of consecutive actions (a
  browse session) rather than the engine drawing a fresh actor every time.
- **Time** — cards are back-dated with a decaying offset, pulled toward the
  weekend just gone, and never dated before the persona joined. New personas'
  join dates are staggered back through `persona_history_days`, so a roster
  looks grown rather than provisioned in one afternoon.
- **Sessions** — every card shot on the same day shares one form value
  (`sessionForm`) and one set of weather conditions (`dayConditions`, keyed on
  ground + date, with a UK seasonal temperature curve). Two personas who shot
  the same county on the same Sunday report the same wind. Scores respond to
  form, wind and accumulated experience; notes are chosen to match the
  conditions and the result, so a calm day never reports a gale.
- **Conversation** — comments react to the tier of the card they are on (a 190
  gets encouragement, a 245 gets praise and sometimes the score quoted), in the
  persona's own voice, avoiding the lines that persona used most recently.
  Comments also reply into existing threads, addressed to the author by name.
- **Engagement** — target selection prefers recently posted content
  (`simRecentWindow`) and spreads likes across cards, posts, comments and
  activities. Follows prefer whoever just followed the persona, then
  friends-of-friends, then a stranger; unfollows prefer the follows nobody
  reciprocated. That produces a clustered, reciprocal graph rather than a
  uniform mesh.

Six of these are admin-tunable from the simulation page (`backdate_days`,
`weekend_bias`, `away_day_chance`, `reply_chance`, `session_actions`,
`persona_history_days`); each accepts 0 to switch that behaviour off. The rest
are intentionally not settings — they are what "human" means here, not knobs.

When adding a new behaviour, prefer deriving it from the persona's traits over
adding another random roll: randomness per action is exactly what makes a feed
read as generated.

### An action that changes nothing is not an action

The engine's counters are the only evidence anyone has that it is working, so
the one thing it must never do is report work it did not do. Two paths made it
lie, and both are the shape to watch for when adding an action:

- **A no-op that returns no error still counts.** `LikeService.Like` is
  idempotent — re-liking returns `created=false`, not an error — and the engine
  discarded that flag, so a persona re-liking the same card scored a performed
  action while the site did not change. The like-target queries now take
  `unlikedOnly` and exclude what the actor already liked (`notAlreadyLiked`),
  and `like` returns `created`. Any new action needs the same two halves: pick
  a target the action can actually affect, and report only what landed.
- **`max_cards_per_persona` is a lifetime ceiling, not a rate limit.**
  `persona_count × max_cards_per_persona` (12 × 30 at defaults) is every score
  card the simulation will ever post; at ~20 actions/hour a roster reaches it in
  days and then never posts another. Likes and comments carry on churning over
  the cards that already exist, so `total_actions` keeps climbing and nothing
  new appears — which is exactly what "enabled but stopped working" looks like.
  A capped persona is no longer offered `post` (`pickAction` zeroes the weight;
  `""` means the persona has nothing it can do), a failed attempt ends the
  browse session so the retry draws somebody else, and a fully capped roster
  writes an actionable message to `last_error`. Raising the cap, adding
  personas, or setting it to 0 is the fix — the engine cannot invent headroom.

`last_error` therefore persists until another error supersedes it or the admin
saves the settings: the next clean batch must not blank it, or the reason the
engine had gone quiet would be erased seconds after it was written to the
dashboard. `last_error_at` is rendered beside it and says how stale the message
is.
