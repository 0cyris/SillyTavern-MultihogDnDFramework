---
name: game-cartridge
description: >-
  Design, create, modify, validate, and preview Multihog D&D Framework game
  cartridges (format multihog-game-cartridge) — portable JSON bundles that
  adapt the extension to a game system (D&D, Wrath & Glory, Cyberpunk, ...).
  Use when the user wants a new game-system cartridge, wants to convert
  tabletop rulebook rules into one, wants edits to an existing cartridge
  JSON, or asks to validate/lint or preview one.
---

# Game cartridge design skill

A cartridge is one complete game-system configuration: narrator sysprompt
sections, state-tracker modules and custom fields, game-system bundles, and
agent prompts. Format spec: `references/cartridge-format.md`. System design
patterns (drivers, effectOwner, GM-vs-tracker split, Wrath & Glory worked
examples): `references/game-systems-guide.md`. Widget markers:
`references/marker-catalog.md`.

All commands below run from the repo root with plain `node` (no deps). The
scripts execute the extension's REAL code via a loader shim, so results match
the extension exactly.

```bash
node .claude/skills/game-cartridge/scripts/validate.mjs <cartridge.json> [--fix] [--json]
node .claude/skills/game-cartridge/scripts/preview.mjs <cartridge.json> --memo <memo.txt> [--out x.html] [--theme hacker|native|fantasy|hologram|pacific|cherry]
node .claude/skills/game-cartridge/scripts/prompt-preview.mjs <cartridge.json> [--out x.md] [--narrator-only|--extractor-only]
node .claude/skills/game-cartridge/scripts/extract-framework-data.mjs --check|--update
node .claude/skills/game-cartridge/scripts/selftest.mjs
```

## Which workflow?

- **Create a new cartridge** → run the interview in
  `references/interview-guide.md` (AskUserQuestion rounds; skip questions
  already answered when the user pasted rulebook text, confirm the gaps).
  Then follow the build loop below.
- **Convert rulebook text** → same as create; the pasted rules pre-answer
  interview questions. Keep original rules text in
  `gameSystems[].description` as designer reference; the operative prompts
  are rewritten in framework voice.
- **Modify an existing cartridge** → validate it FIRST (`validate.mjs`),
  surface findings, then apply the requested edits and re-enter the build
  loop at step 3.
- **Validate only** → run `validate.mjs`, explain each finding in terms of
  what the extension would do (drop/backfill/self-heal), offer `--fix`.

## Build loop

1. **Start from the Default payload**: copy
   `references/default-cartridge.json` — never build a payload from scratch
   (missing keys are silently backfilled on import; unknown keys silently
   dropped).
2. **Apply the design**: toggle `modules`/`syspromptModules`, rewrite
   `stockPrompts` in-system voice, add `customFields` (+ `gameSystems`
   bundles + `customSyspromptLibrary` GM halves + `lib:` order keys +
   `blockOrder` slots), set dice/time flags, set wrapper name/icon/
   description. Respect the cross-reference rules in
   `references/cartridge-format.md`.
3. **Validate**: `validate.mjs <file>` — iterate until 0 errors and only
   intended warnings. Use `--fix` for mechanical repairs; fix content
   findings (macros, wraps, tags) by editing.
4. **Author a sample memo** per `references/sample-memo-guide.md` (in-genre
   state snapshot exercising every enabled block and marker).
5. **Render previews**: `preview.mjs` (visual HTML) and `prompt-preview.mjs`
   (assembled narrator + extractor prompts). Read the prompt preview —
   check section order, toggles took effect, and the GM/tracker halves
   landed where intended.
6. **Deliver**: write the cartridge (and previews) to the session scratch
   directory and send all files to the user (cartridge JSON + HTML preview +
   prompt preview). Ask which theme they prefer only if they care about
   visuals.
7. **Iterate** on feedback: edit → validate → re-preview.

## Hard rules

- **Never commit authored cartridges or previews to the repo** — scratch
  directory + send to user. Only the skill's own files live in the repo.
- **Never invent marker names** — only `((MARKER))` tokens listed in
  `references/marker-catalog.md`; validate flags unknowns (GC-W020).
- **Preserve `{{user}}` literally** — no spacing/case variants; it is the
  player-character macro.
- **No asterisks in custom field templates** (breaks widget rendering).
- **Always validate before delivering** a cartridge, even for tiny edits.
- If any script prints a **FRAMEWORK DRIFT** warning, the extension source
  changed since the skill snapshot: tell the user, run
  `extract-framework-data.mjs --check` to see what moved, re-verify the
  reimplemented fragments it names, then `--update` to re-snapshot (and
  re-run `selftest.mjs`).
- If the loader itself fails (extension refactor), fall back to validating
  the JSON by hand against `references/cartridge-format.md` and warn the
  user that live-code checks were unavailable.

## Design quality bar (what "good" looks like)

- Stock prompts rewritten to the system's stat vocabulary but keeping the
  framework's structural contracts (entity anchor lines, inventory
  rarity/[E]/worth grammar, `[TIME]` Last Rest, party ADD/REMOVE triggers,
  `END_COMBAT`).
- Each tracked resource has: honest driver flags, a magnitude guide in the
  GM half, tier table in the tracker half (not both), one clear widget in
  the template.
- The narrator half never does arithmetic; the tracker half never invents
  events (two-agent split — see the guide).
