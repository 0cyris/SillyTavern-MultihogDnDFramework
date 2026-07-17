# Authoring a sample state memo for previews

`scripts/preview.mjs` renders a cartridge against a **sample state memo** — a
plain-text snapshot of game state in `[TAG]…[/TAG]` blocks, exactly what the
state extractor would maintain mid-campaign. Claude writes one per cartridge
so the preview shows the actual system (its stats, its markers, its currency),
not generic D&D data.

## Rules

1. **Cover every enabled module** in the cartridge's `modules`, plus **every
   enabled custom field**, one block each, `[TAG]` uppercase, always closed.
2. **Follow the cartridge's own formats.** Each block must match the format
   its stock prompt / custom field `prompt` teaches — the preview is a lie
   detector for format drift. For custom fields, start from the `template`
   and flesh it out with plausible values.
3. **Exercise the markers.** Every `((MARKER))` the cartridge uses should
   appear at least once with a realistic `X/Y` value.
4. **2–4 entries for list blocks**: 2 party members, 4–6 inventory items
   (mix rarities, one `[E]` equipped, one bare currency line), 2–3 abilities,
   1–2 enemies in `[COMBAT]` with a `ROUND N` line.
5. **Show state richness**: one `(+)` buff and one `(-)` debuff with effect
   and duration, an entity below max HP/wounds, a partially-used resource.
6. **Quests**: if the quests module is on, include 1 active quest (with
   `OBJ_ACTIVE`, one `[cur/total]` counting objective, `REWARD:` lines, and
   `DEADLINE:`/`DIFFICULTY:` if those toggles are enabled) and 1 completed
   quest.
7. **Time**: match the cartridge's time format flags (24h? DD/MM/YYYY?) and
   any custom calendar the time stock prompt defines (e.g. Imperial Dates).
8. **Character block anchor**: unless the cartridge redefines it, the main
   character line should match `Name (Class): current/max HP` so the HP bar
   renders. Systems that redefine `[CHARACTER]` (like W&G's Wounds/Shock
   status bars) should use marker lines (`((BAR)) 5/7 (Wounds)`) instead.
9. Keep names/flavor in-genre — the preview doubles as a design pitch.

## Skeleton

```
[CHARACTER]
<main character sheet per the cartridge's character stock prompt>
[/CHARACTER]

[PARTY]
<1-2 companions per the party stock prompt>
[/PARTY]

[COMBAT]
ROUND 2
<1-2 enemies per the combat stock prompt>
[/COMBAT]

[INVENTORY]
<sections + emoji/rarity/[E]/worth grammar>
[/INVENTORY]

[ABILITIES]
- Name (uses/max, effect)
[/ABILITIES]

[<EACH CUSTOM FIELD TAG>]
<template fleshed out with plausible values>
[/<TAG>]

[TIME]
<per the time stock prompt / format flags>
[/TIME]

[QUESTS]
QUEST: ...
  ID: quest_1
  STATUS: active
  ...
[/QUESTS]
```

Then:

```bash
node .claude/skills/game-cartridge/scripts/preview.mjs <cartridge.json> \
  --memo <sample-memo.txt> --out <preview.html> [--theme hacker]
```
