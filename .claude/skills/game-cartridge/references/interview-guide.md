# Cartridge design interview guide

Run this as an AskUserQuestion grilling session BEFORE generating anything.
When converting from rulebook text, skip questions the text already answers
and confirm only the gaps. Note the mapping in parentheses — every answer
lands in a concrete payload field.

## Round 1 — System identity & core mechanics

1. **Source system / genre** — published ruleset (which?) or homebrew?
   Setting/tone? (drives all flavor text, names, currencies)
2. **Dice mechanic** —
   - d20-style → keep defaults (`rngToolD20`/`rngQueueD20` true)
   - d100/percentile → `diceD100Mode: true`, `rngToolD100`/`rngQueueD100`
   - dice pools / other (e.g. W&G d6 pools, PbtA 2d6) → keep RNG on but plan
     an `unlocked_base` override of `rng_system` teaching the real mechanic
   - diceless/narrative → `rngEnabled: false`
3. **Health model** — single HP? dual meters (wounds/shock, health/stress)?
   conditions-only? (drives `character`/`party`/`combat` stock prompts and
   bar markers; dual meters = two `((BAR*))` lines)
4. **Progression** — XP levels (keep stock `xp`)? levelless/milestone
   (disable `xp`)? system-specific (disable `xp`, add a custom field like
   W&G's ADVANCEMENT)? (drives `modules.xp`, `blockOrder`, maybe a field)

## Round 2 — Trackers & resources (the heart of the design)

5. **Resources/meters to track** — list them (mana, sanity, glory, heat,
   corruption, faction rep...). For each: range? who changes it (time /
   GM-judged events / stated facts → drivers)? gradual or instant effects
   (→ effectOwner)? does the narrator need new rules for it (→ GM half)?
   (each becomes a customFields entry ± gameSystems bundle)
6. **Inventory style** — fantasy coin (GP) / modern cash / barter-wealth
   rating / slots or weight? (drives `inventory` stock prompt currency +
   worth grammar; slots/weight → `((SLOTS))`/`((WEIGHT))` line)
7. **Magic/powers** — spell slots (keep stock `spells`)? none (disable)?
   different resource (disable `spells`, custom field like PSYKER_POWERS)?
8. **Time & calendar** — 24h clock (`use24hTime`)? real dates
   (`useDdMmYyFormat`)? custom calendar (rewrite `time` stock prompt, e.g.
   Imperial Dates)?

## Round 3 — Narrative systems & finish

9. **Quests** — deadlines (`questsDeadlines`)? giver-mood pressure
   (`questsFrustration`)? difficulty ratings (`questsDifficulty`)?
10. **Party** — max size mention in `party` prompt; benching module
    (`party_bench` + `benched party` module) for split-party play?
11. **Relationships** — NPC relationship bars on (`npcRelationshipBars`)?
12. **Narrator extras** — CYOA choice mode (`CYOA_mode`)? loot generosity /
    random events / resting rules kept or overridden (per-section toggles or
    `unlocked_base` overrides)?
13. **Identity** — cartridge name, icon (≤4 chars, ideally 1 emoji),
    one-line description.

## Output contract

After the interview, restate the design as a table (mechanic → payload
change) before building: modules on/off, custom fields (tag/markers/drivers/
effectOwner), stock prompts to rewrite, base sections to override, toggles.
Get a nod on that summary, then generate.
