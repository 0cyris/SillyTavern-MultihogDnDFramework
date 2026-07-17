# Rendering marker catalog

Markers are `((NAME))` tokens placed in state-memo lines (and therefore in
custom field `template`s and taught via custom field `prompt`s). The tracker
panel replaces each marker with a visual widget. The authoritative registry is
`MARKER_TYPE_MAP` in `renderer.js` (~line 496); this table was generated from
it by the loader (`extract-framework-data.mjs --check` fails if the live list
drifts from `data/framework-snapshot.json`).

## Usage grammar

```
Label: ((MARKER)) current/max (description)
```

- Most numeric widgets parse the **first `X/Y`** fraction on the line; without
  one they fall back to plain text.
- **Color override**: `((BAR - #FF6600))` — single 6-digit hex. Bars/progress
  also accept a two-color gradient: `((BAR - #FF6600 #AA2200))`.
- **Multiple markers per line** render side-by-side in a multi-marker row.
- In `[CHARACTER]`/`[PARTY]`/`[COMBAT]` blocks, a line may *start* with a
  marker to restyle that sub-field (only the PILLS/BAR/XPBAR/TEXT/BADGE/
  HIGHLIGHT/HP families).
- **Never use `*` (asterisks) in templates** — they break widget rendering
  (lint GC-W021).

## Canonical markers

| Marker | Widget | Aliases | Example line |
|--------|--------|---------|--------------|
| `((PILLS))` | pills | PLS | `Status (Hover for details), Condition (Another detail)` |
| `((BAR))` | hp_bar | B, HPBAR, HPB, HP | `50/100 (Red HP/Standing)` |
| `((BARRED))` | hp_bar | — | `50/100 (Crimson Blood)` |
| `((BARBLUE))` | hp_bar | — | `50/100 (Blue Mana/Mana)` |
| `((BARGREEN))` | hp_bar | — | `50/100 (Green Stamina)` |
| `((BARYELLOW))` | hp_bar | — | `50/100 (Yellow Energy)` |
| `((BARPURPLE))` | hp_bar | — | `50/100 (Purple Void)` |
| `((BARORANGE))` | hp_bar | — | `50/100 (Orange Heat)` |
| `((XPBAR))` | xp_bar | XB | `450/1000 Level 3 (XP/Progress)` |
| `((TEXT))` | text | — | `Some text (Plain)` |
| `((BADGE))` | badge | BDG | `Neutral (Reputation badge)` |
| `((HIGHLIGHT))` | highlight | HGT | `Emphasis (Bright highlight text)` |
| `((OBJ))` | objective | — | `✓ Done (Checked quest bullet)` |
| `((REWARD))` | reward | — | `500 XP (Loot reward badge)` |
| `((DIFFICULTY))` | difficulty | — | `Hard (Difficulty star badge)` |
| `((PROGRESS))` | progress | — | `3/5 (Fraction progress)` |
| `((PROGRESSRED))` | progress | — | `3/5 (Red fraction progress)` |
| `((PROGRESSBLUE))` | progress | — | `3/5 (Blue fraction progress)` |
| `((PROGRESSGREEN))` | progress | — | `3/5 (Green fraction progress)` |
| `((PROGRESSYELLOW))` | progress | — | `3/5 (Yellow fraction progress)` |
| `((PROGRESSPURPLE))` | progress | — | `3/5 (Purple fraction progress)` |
| `((PROGRESSORANGE))` | progress | — | `3/5 (Orange fraction progress)` |
| `((PROGRESSCYAN))` | progress | — | `3/5 (Cyan fraction progress)` |
| `((PILLRED))` | pill_colored | — | `Stunned (Cannot take actions)` |
| `((PILLGREEN))` | pill_colored | — | `Focused (Clear minded, no distractions)` |
| `((PILLBLUE))` | pill_colored | — | `Shielded (Absorbs 10 damage)` |
| `((WARNING))` | badge_colored | — | `Caution (Amber badge)` |
| `((DANGER))` | badge_colored | — | `Hostile (Red badge)` |
| `((SUCCESS))` | badge_colored | — | `Active (Green badge)` |
| `((INFO))` | badge_colored | — | `Role (Blue badge)` |
| `((GOLD))` | coin | — | `150 (Gold coins)` |
| `((SILVER))` | coin | — | `45 (Silver coins)` |
| `((BRONZE))` | coin | — | `12 (Bronze coins)` |
| `((DOLLAR))` | coin | — | `500 (Paper cash)` |
| `((HEART))` | coin | — | `3 (Lives/Hearts)` |
| `((SKULL))` | coin | — | `12 (Kills/Deaths)` |
| `((SOUL))` | coin | — | `42 (Souls)` |
| `((ROLL))` | dice_roll | — | `1d20+5 = 18 (Dice roll badge)` |
| `((CLOCK))` | clock | — | `4/8 (Guard Alertness)` |
| `((STARS))` | stars | — | `3/5 (Merchant Favor)` |
| `((WEIGHT))` | weight | CAPACITY | `45/50 lbs (Encumbered)` |
| `((WEATHER))` | weather | — | `Heavy Rain (Poor Visibility)` |
| `((ORBS))` | orbs | AP | `3/5 (Ki Points)` |
| `((SLOTS))` | slots | — | `4/10 (Backpack)` |
| `((PHASE))` | phase | STEP | `2/4 (Ritual Summoning)` |
| `((GAUGE))` | gauge | METER | `75/100 (Party Morale)` |
| `((CHARGE))` | charge | BATTERY | `2/5 (Wand of Fireballs)` |

Widget picking guide: **BAR family** for depleting vitals (HP, wounds, shock,
mana); **ORBS/SLOTS/CHARGE** for small discrete pools (≤ ~10); **GAUGE/STARS/
CLOCK** for 0–N meters read at a glance (morale, favor, alertness); **PROGRESS
family** for accumulating counters; **PILLS/PILLRED/PILLGREEN/PILLBLUE** for
named effects with hover descriptions; **BADGE/WARNING/DANGER/SUCCESS/INFO**
for one-word states/tiers; **coin badges** for currencies and kill/life
counters; **XPBAR** for progression.

## Non-marker line grammars the renderer also understands

These apply inside stock blocks (and custom blocks that set a `renderType`):

- **Entity anchor** (`[CHARACTER]`/`[PARTY]`/`[COMBAT]`):
  `Name (Class): current/max HP` → name + HP bar row. HP percent picks the
  bar color (>60% green, >30% amber, else red).
- **Keyword sub-fields** after an entity line route by their label:
  `Combat:`/`Saves:` → highlighted numbers; `Gear:`/`Attr:` → amber
  parenthesis chips; `Skills:`/`Status:`/`Traits:`/`Abilities:` → pills;
  `HD:` → pips; `Spells:` → spell rows.
- **Status effect prefixes**: `(+) Buff (effect, duration)` renders green,
  `(-) Debuff (effect, duration)` renders red.
- **Inventory**: every item needs an emoji prefix, a rarity tag `[Common]`
  `[Uncommon]` `[Rare]` `[Epic]` `[Legendary]` `[Artifact]` (also `[Poor]`,
  `[Heirloom]`), optional `[E]` (equipped), stats in parens, and a trailing
  worth `(~X GP)`. Rarity colors follow the WoW palette. Bare currency lines
  (`💰 1,200 GP`) become coin badges.
- **Spells**: `Level N (avail/max): Spell1, Spell2` and `Cantrips: ...` →
  slot pips.
- **XP**: `Level: X | XP: current/max` (legacy) or
  `Total: current/max XP (Level N)`.
- **Quests** (`[QUESTS]` block, rendered by the dedicated quest log):
  `QUEST: Title` then indented `ID:`, `STATUS: active|completed|failed`,
  `GIVER: Name @ Place`, `ACCEPTED:`, `DEADLINE:`, `DIFFICULTY:`, `REWARD:`
  (repeatable), `OBJ_ACTIVE:`/`OBJ_COMPLETED:`/`OBJ_FAILED:` (repeatable,
  `[cur/total]` progress suffix, `(optional)` suffix), `OBJ_TOTAL:`.
