# Game system design guide

A **game system** adapts the framework to a new ruleset. It bundles up to two
halves:

- **GM half** — a `customSyspromptLibrary` section (snake_case tag, full
  `<tag>…</tag>` wrap) that teaches the NARRATOR the rule: when it triggers,
  what it changes in the fiction, what inline annotations to emit.
- **Tracker half** — a `customFields` entry (UPPER_SNAKE tag) whose `prompt`
  teaches the STATE EXTRACTOR how to maintain the number(s): update logic,
  clamps, tier table, and the exact `[TAG]…[/TAG]` output format with markers.

The `gameSystems[]` record links them (`syspromptLibraryId`, `customFieldTag`)
and records the design decisions (drivers, effectOwner).

## The two-agent split (most important rule)

The narrator and the state extractor are different LLM calls with different
prompts. **Never duplicate accounting between them.**

- GM half: fiction, triggers, and *annotations* — e.g. emit
  `*(Test Failure: Failed Fear test. +1 Ruin)*`. It never computes running
  totals and never sees the tier thresholds (a GM that knows the exact
  threshold table telegraphs it in narration).
- Tracker half: arithmetic and state — read annotations/prose, apply deltas,
  clamp, classify into a tier, and output the block. It never invents events.
- `template` is a render sample for the UI/previews only; no LLM ever sees it.

## Drivers (how the tracked value changes)

Pick at least one when `needsTracker`:

- **driverTime** — passive drift from elapsed `[TIME]`. Rules: state the rate
  as a whole number **per minute** (never per hour), minimum 1/min, exactly
  ONE rate (conditional overrides allowed, no multi-term formulas), and the
  GM must NOT narrate the numeric drain.
- **driverGmAnnotation** — changes require cross-turn judgment (reputation,
  sanity, favor). The GM half must define the qualifying event categories and
  emit natural-language inline deltas: `*(Reason. +/-N Thing)*`, with a rough
  magnitude guide (minor +1 / moderate +2 / major +3).
- **driverStatedFact** — the number is stated plainly in prose (damage taken,
  gold spent); the tracker just reads it.

## effectOwner

- `"tracker"` (default): the tracker owns the threshold table and reports the
  current tier in its block; the GM reacts to the *reported* tier (one turn
  behind). Use for gradual meters.
- `"gm"`: the GM owns thresholds and reacts same-turn. Reserve for instant,
  can't-be-late effects (death at 0, explosion at max). The GM half then
  carries the threshold table instead of the tracker.

## Voice and macro rules

- Both halves are 2nd-person imperatives ("You track…", "You grant…") —
  "you" = the agent being instructed, never the player.
- The player is the literal macro `{{user}}` — never a hardcoded persona name,
  never "your inventory" (whose?).
- 10–30 lines per half; concise, no leftover placeholders like `YOUR_TAG`.
- Tracker `prompt` must end with the exact output format, e.g.:
  ```
  [RUIN]
  Ruin: ((BARPURPLE)) [current/max] ([Tier])
  [/RUIN]
  ```

## Overriding base sections (`unlocked_base`)

To replace a stock rule wholesale (e.g. a different dice system), add a
library entry with `origin: "unlocked_base"`, `baseTag: "<base tag>"`, content
wrapped in `<baseTag>…</baseTag>`, and set `syspromptModules[baseTag] = false`.
It renders in the base section's slot (no `lib:` order key). Good targets:
`rng_system` (dice pools), `xp_system` (non-XP progression), `saving_throws`,
`resting` (non-D&D recovery), `loot` (setting-appropriate economies).

## Worked patterns from the Wrath & Glory cartridge (40k)

The W&G cartridge (not committed — it embeds verbatim rulebook text) shows the
full pattern vocabulary:

1. **Party meter with GM annotations — "Glory"**: shared 0–6 pool. GM half
   defines qualifying events (critical success, elite kill, heroic roleplay)
   and emits `*(Shift: Precision Shot. +1 Glory)*`. Tracker half applies
   deltas, clamps 0–6, reports tiers (Legendary/Inspired/Driven/Desperate).
   Field template: `Glory: ((ORBS)) 2/6 (Inspired)`. Drivers: gmAnnotation
   (+statedFact); effectOwner: tracker.
2. **GM resource pool — "Ruin"**: the GM's own spendable currency. Same
   annotation mechanism but effectOwner **gm** (spending Ruin changes the
   scene same-turn). Template uses `((BARPURPLE))` + `((DANGER))` status
   badge. The original rulebook text lives in `gameSystems[].description` as
   designer reference; the operative prompt is a rewritten, framework-voiced
   version.
3. **Subsystem sheet — "PSYKER_POWERS"**: a standalone custom field (no
   gameSystems bundle, no GM half) tracking a whole subsystem: warp charge
   `((BARPURPLE))`, perils risk `((PROGRESSPURPLE))`, sustained powers
   `((PILLS))`, dice pool `((ROLL))`. Shows that a custom field alone is
   often enough when the narrator needs no new rules.
4. **Replacing stock progression — "ADVANCEMENT"**: W&G disables the stock
   `xp` module (`modules.xp: false`, XP removed from meaning) and adds an
   ADVANCEMENT field with `((XPBAR))` lifetime XP, `((TEXT))` spendable,
   `((PILLS))` tier/rank, `((BADGE))` ascension. Pattern: disable the stock
   block, add a themed replacement, put the new tag in `blockOrder` where XP
   was.
5. **Reformatting stock blocks**: every stock prompt (`character`, `party`,
   `combat`, `inventory`, `time`…) is rewritten to W&G's stat line format
   (Wounds/Shock instead of HP, Imperial Dates, Wealth instead of GP) while
   keeping the framework's structural contracts: entity anchor lines, the
   `[E]`/rarity/worth inventory grammar, `[TIME]` Last Rest tracking, party
   ADD/REMOVE trigger annotations, `END_COMBAT`. Keep those contracts — the
   renderer and engine depend on them.
6. **Quest toggles as system flavor**: W&G turns on `questsDeadlines` and
   `questsDifficulty` but leaves `questsFrustration` off.

## Checklist for a new system

1. Does the mechanic need persistent numbers? → tracker half (custom field).
2. Does the narrator need new rules/annotations? → GM half (library section).
3. Both? → full gameSystems bundle with FK links + `lib:` order key +
   blockOrder slot for the field tag.
4. Choose drivers honestly; write the magnitude guide in the GM half.
5. Choose effectOwner: gradual → tracker; instant → gm.
6. Pick markers from marker-catalog.md; put at least one in the template.
7. Run `scripts/validate.mjs` — FK integrity, tag rules, marker names, and
   macro hygiene are all checked.
