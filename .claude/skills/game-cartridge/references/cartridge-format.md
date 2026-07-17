# Game cartridge format (`multihog-game-cartridge`, version 1)

A cartridge is a portable JSON bundle of one complete game-system
configuration for the Multihog D&D Framework. Source of truth:
`game-cartridges.js` (wrapper + import), `state-manager.js`
(`CARTRIDGE_PAYLOAD_KEYS`, factory defaults), and the group split in
`CARTRIDGE_PAYLOAD_GROUPS`.

## Wrapper

```json
{
  "format": "multihog-game-cartridge",   // REQUIRED, the only import check
  "version": 1,                           // ignored by import (stamped to 1)
  "name": "Wrath & Glory",
  "description": "...",
  "icon": "℧",                            // trimmed, max 4 chars, fallback 🎮
  "exportedAt": "2026-07-16T23:47:12.988Z",
  "payload": { ... }
}
```

## Import semantics (why the validator exists)

`importCartridgeFromJson()` checks ONLY `format`. Then for each of the 33
known payload keys: value taken from the file if present, else silently
backfilled from factory defaults. **Any unknown payload key is silently
dropped** — that is data loss, which is why the linter treats it as an error
(GC-E003). Cross-references are never checked on import; dangling ones are
pruned later by self-healing loaders (your intent silently disappears).

## The 33 payload keys, by selective-load group

### stateTracker (16 keys)
| Key | Type | Notes |
|-----|------|-------|
| `systemPromptTemplate` | string | State-extractor system prompt; must contain `{{modulesText}}` where module instructions are injected |
| `modules` | object | Block toggles, exactly: `character, party, "benched party" (NOTE THE SPACE), combat, inventory, abilities, spells, time, xp, quests` — all boolean |
| `blockOrder` | string[] | Card order, UPPERCASE tags: the 8 stock tags `COMBAT CHARACTER PARTY INVENTORY ABILITIES SPELLS XP TIME`, optional `QUESTS`, plus custom field tags |
| `stockPrompts` | object | Per-module extractor instructions; keys = the 10 module keys + time variants `time_24h`, `time_ddmmyy`, `time_ddmmyy_24h` (active variant picked from the two time flags) |
| `syspromptModules` | object | Narrator base-section toggles: `loot, random_events, resting, party_bench, quests, questsDeadlines, questsFrustration, questsDifficulty, questsShowArchive, CYOA_mode` |
| `syspromptSectionOrder` | string[] | `base:<tag>` / `lib:<id>` keys (see below); `[]` = "use default order" |
| `customSyspromptLibrary` | array | Custom narrator sections (see entry shape) |
| `rngEnabled`, `diceFunctionTool`, `diceD100Mode`, `rngToolD20`, `rngToolD100`, `rngQueueD20`, `rngQueueD100` | boolean | Dice/RNG configuration; `diceD100Mode` also rewrites d20→d100 text in base sections |
| `use24hTime`, `useDdMmYyFormat` | boolean | Time/date format; select the TIME stock-prompt variant and footer format |

### gameSystems (2 keys)
| Key | Type | Notes |
|-----|------|-------|
| `gameSystems` | array | System bundles linking a GM half + tracker half (see game-systems-guide.md) |
| `customFields` | array | Tracker modules: `{tag, label, icon, prompt, template, enabled, renderType?}` |

### characterSheets (5 keys)
`npcCoreSections`, `pcCoreSections` (arrays of `{id, name, description, icon,
color}`), `npcSectionPresets`, `pcSectionPresets` (objects), and
`npcRelationshipBars` (boolean — also gates the `relationship_tracking`
narrator section).

### portraits (5 keys)
`portraitNpcSystemPrompt`, `portraitCharacterSystemPrompt`,
`portraitLocationSystemPrompt` (strings; may use `{{wordtarget}}`, `{{name}}`,
`{{path}}`), `portraitPromptWordTarget` (number), `savedPortraitPromptPresets`
(object).

### lorebookAgent (4 keys)
`routerSystemPromptTemplate` (may use `{{campaignRoot}}`),
`routerModularPromptTemplate` (may use `{{formatLines}}`), `routerModules`
(object keyed `npc, loc, fac, quest, event, world`, each
`{enabled, tag, format, instruction}`), `routerCustomTags` (array of
`{tag, instruction, format}`).

### worldProgression (1 key)
`worldProgressionSystemPrompt` (string; `{periodLabel}` single-brace token is
substituted by the engine, not a macro).

## Entry shapes

### customFields[]
```json
{
  "tag": "RUIN",              // UPPER_SNAKE; must NOT be COMBAT/CHARACTER/PARTY/INVENTORY/ABILITIES/SPELLS/XP/TIME
  "label": "Ruin",
  "icon": "💀",
  "prompt": "...",            // EXTRACTOR-FACING instructions: when/how to update, output format, tiers
  "template": "Ruin: ((BARPURPLE)) 2/8 (Latent)",  // UI sample only — never sent to any LLM
  "enabled": true,
  "renderType": "..."         // optional: borrow a stock block renderer (e.g. "INVENTORY")
}
```
The `prompt` is injected into the extractor's `{{modulesText}}` as
`- [TAG]: <prompt>`. The `template` is what previews render.

### customSyspromptLibrary[]
```json
{
  "id": "1784217987985",       // unique; referenced by gameSystems.syspromptLibraryId and lib:<id> order keys
  "tag": "ruin",               // snake_case
  "content": "<ruin>\n...\n</ruin>",  // MUST be wrapped in <tag>…</tag> — emitted verbatim into the narrator prompt
  "enabled": true,
  "icon": "fa-hat-wizard",
  "description": "Game System: Ruin",
  "origin": "wizard"           // absent = manual section; "wizard" = game-system GM half;
                               // "unlocked_base" = override of a base section (needs baseTag,
                               //   rides the base:<baseTag> slot, gets NO lib: order key,
                               //   pairs with syspromptModules[baseTag] === false)
}
```

### gameSystems[]
```json
{
  "id": "1784217987985", "name": "Ruin", "icon": "💀", "enabled": true,
  "needsTracker": true,
  "driverTime": false, "driverGmAnnotation": true, "driverStatedFact": false,  // ≥1 true when needsTracker
  "effectOwner": "gm",                  // "tracker" (default) or "gm"
  "syspromptLibraryId": "1784217987985", // FK → customSyspromptLibrary[].id (or null)
  "customFieldTag": "RUIN",              // FK → customFields[].tag, case-insensitive (or null)
  "description": "...",                  // designer notes / original rules text
  "createdAt": 1784217987985
}
```

## syspromptSectionOrder

Keys are `base:<tag>` for the 20 top-level sections of `sysprompt.txt`:

```
role, rng_system, combat, end_of_output_footer, homebrew_and_custom_classes,
weapon_proficiencies, saving_throws, loot, random_events, xp_system, quests,
level_up_protocol, narrative, world_progression, [PARTY]_mechanics, resting,
relationship_tracking, state_memo, CYOA_mode, constraints
```

or `lib:<id>` for orderable library entries. Rules:
- `base:party_join_leave` is legacy → auto-migrates to `base:[PARTY]_mechanics`.
- Nested tags (`rng_queue_instructions`, `leaving_vs_benching`,
  `bench_ETA_system`, the `*_constraints` children) are NOT orderable keys.
- The order self-heals on load: unknown keys dropped, missing base keys
  re-inserted in file order, new library sections inserted just before
  `base:constraints`, `base:CYOA_mode` pinned directly above `base:constraints`.
- Section enablement: most base tags obey `syspromptModules[tag] !== false`;
  `CYOA_mode` is opt-in (`=== true`); `relationship_tracking` obeys
  `npcRelationshipBars`.
- 8 base sections are transformed at build time (RNG strips, quest
  deadline/frustration/difficulty strips, party-bench strips, time-format
  swap, d100 swaps) — to fully own one's text, use an `unlocked_base` override.

## Pitfall checklist

- `"benched party"` module key contains a SPACE.
- `base:[PARTY]_mechanics` contains literal brackets.
- Custom field tags are compared UPPERCASED everywhere.
- `{{user}}` must appear exactly as `{{user}}` — no spaces, no case changes.
- The extension never validates cross-references on import: run
  `scripts/validate.mjs` before shipping a cartridge.
