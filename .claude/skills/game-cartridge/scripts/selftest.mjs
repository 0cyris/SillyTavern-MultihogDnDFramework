#!/usr/bin/env node
/**
 * selftest.mjs — final gate for the game-cartridge skill tooling.
 *
 * Covers: loader boot invariants, every lint rule firing on a targeted
 * fixture, --fix round-trip idempotence, prompt-preview toggle invariants,
 * and preview HTML widget assertions. Zero dependencies; run with plain node.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootFramework, buildSettingsFromCartridge } from './lib/framework-loader.mjs';
import { runLintRules, setFactoryMapKeys } from './lib/lint-rules.mjs';
import { schemaCheck } from './lib/schema-check.mjs';
import { computeLiveData, checkDrift } from './extract-framework-data.mjs';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.resolve(SCRIPTS_DIR, '..');
const DEFAULT_CARTRIDGE = path.join(SKILL_ROOT, 'references', 'default-cartridge.json');

let passed = 0;
const failures = [];
function t(name, fn) {
    try {
        fn();
        passed++;
    } catch (err) {
        failures.push(`✗ ${name}\n    ${err.message}`);
    }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

const clone = (v) => JSON.parse(JSON.stringify(v));
const run = (script, args) => execFileSync(process.execPath, [path.join(SCRIPTS_DIR, script), ...args], { encoding: 'utf8' });

const fw = await bootFramework();
const live = await computeLiveData();
const factory = fw.stateManager.getFactoryCartridgePayload();
setFactoryMapKeys(factory, live.lists.baseSectionTags);
const schema = JSON.parse(readFileSync(path.join(SKILL_ROOT, 'cartridge.schema.json'), 'utf8'));
const defaultCartridge = JSON.parse(readFileSync(DEFAULT_CARTRIDGE, 'utf8'));
const tmp = mkdtempSync(path.join(os.tmpdir(), 'gc-selftest-'));

// ── Loader invariants ────────────────────────────────────────────────────
// Counts are intentionally NOT hardcoded — upstream adds payload keys/base
// sections over time (that's exactly what extract-framework-data.mjs --check
// exists to surface as drift). These assert known-required members are
// present and the shape is sane, not an exact frozen count.
t('factory payload has known core keys', () => {
    const keys = Object.keys(factory);
    for (const k of ['modules', 'blockOrder', 'stockPrompts', 'customFields', 'gameSystems', 'syspromptModules', 'syspromptSectionOrder']) {
        assert(keys.includes(k), `missing core payload key ${k}`);
    }
    assert(keys.length >= 33, `expected at least 33 payload keys, got ${keys.length}`);
});
t('sysprompt.txt has the known base tags (superset tolerant)', () => {
    const tags = live.lists.baseSectionTags;
    for (const required of ['role', 'rng_system', 'combat', 'saving_throws', 'loot', 'level_up_protocol', '[PARTY]_mechanics', 'constraints']) {
        assert(tags.includes(required), `missing required base tag ${required}`);
    }
    for (const nested of ['rng_queue_instructions', 'leaving_vs_benching', 'bench_ETA_system', 'resolution_constraints']) {
        assert(!tags.includes(nested), `nested tag ${nested} leaked to top level`);
    }
});
t('marker map exposes ORBS/BAR/GAUGE/PILLS', () => {
    for (const k of ['ORBS', 'BAR', 'GAUGE', 'PILLS', 'XPBAR', 'CHARGE']) {
        assert(live.lists.markerAllKeys.includes(k), `missing marker ${k}`);
    }
});
t('drift check is green', () => {
    const problems = checkDrift(live);
    assert(problems.length === 0, problems.join('; '));
});

// ── Lint fixtures ────────────────────────────────────────────────────────
/** A minimal, fully-consistent game-system bundle payload for FK fixtures. */
function bundlePayload() {
    const p = clone(factory);
    p.customFields = [{ tag: 'FOO', label: 'Foo', icon: '⭐', prompt: 'Track Foo for {{user}}. Output [FOO]...[/FOO].', template: 'Foo: ((BAR)) 2/6 (Steady)', enabled: true }];
    p.customSyspromptLibrary = [{ id: 'L1', tag: 'foo_rules', content: '<foo_rules>\nGrant Foo when {{user}} acts boldly.\n</foo_rules>', enabled: true, icon: 'fa-hat-wizard', description: 'Game System: Foo', origin: 'wizard' }];
    p.gameSystems = [{ id: 'G1', name: 'Foo', icon: '⭐', enabled: true, needsTracker: true, driverTime: false, driverGmAnnotation: true, driverStatedFact: false, effectOwner: 'tracker', syspromptLibraryId: 'L1', customFieldTag: 'FOO', description: 'Foo system', createdAt: 1 }];
    p.syspromptSectionOrder = [...clone(defaultCartridge.payload.syspromptSectionOrder || [])];
    if (!p.syspromptSectionOrder.length) {
        p.syspromptSectionOrder = live.lists.baseSectionTags.map((t2) => `base:${t2}`);
    }
    // Mirror the real normalizeSectionOrder rule: new library keys insert just
    // before base:constraints specifically — NOT "before whatever is array-last"
    // (constraints is no longer necessarily the last base tag; upstream has
    // appended tags after it before, e.g. dungeon_reality_and_hidden_mapping).
    const constraintsIdx = p.syspromptSectionOrder.indexOf('base:constraints');
    p.syspromptSectionOrder.splice(constraintsIdx === -1 ? p.syspromptSectionOrder.length : constraintsIdx, 0, 'lib:L1');
    p.blockOrder = [...p.blockOrder, 'FOO'];
    return p;
}

function lint(wrapper) {
    return runLintRules({
        wrapper,
        payload: wrapper.payload || {},
        payloadKeys: live.lists.payloadKeys,
        baseTags: live.lists.baseSectionTags,
        markerKeys: live.lists.markerAllKeys,
    });
}
const wrap = (payload, extra = {}) => ({ format: 'multihog-game-cartridge', version: 1, name: 'T', description: 'd', icon: '🎮', payload, ...extra });
const hasRule = (findings, id) => findings.some((f) => f.id === id);
const expectRule = (name, wrapper, id) => t(name, () => {
    const F = lint(wrapper);
    assert(hasRule(F, id), `${id} did not fire; got: ${[...new Set(F.map((f) => f.id))].join(',') || '(none)'}`);
});

t('default cartridge lints clean', () => {
    const F = lint(defaultCartridge);
    assert(F.length === 0, F.map((f) => `${f.id} ${f.path}`).join('; '));
});
t('bundle fixture lints clean', () => {
    const F = lint(wrap(bundlePayload()));
    assert(F.length === 0, F.map((f) => `${f.id} ${f.path}`).join('; '));
});

expectRule('E001 bad format', { format: 'nope', payload: clone(factory) }, 'GC-E001');
expectRule('E002 empty payload', wrap({}), 'GC-E002');
expectRule('E003 unknown payload key', wrap({ ...clone(factory), bogus: 1 }), 'GC-E003');
{
    const p = bundlePayload(); p.gameSystems[0].syspromptLibraryId = 'NOPE';
    expectRule('E010 dangling library id', wrap(p), 'GC-E010');
}
{
    const p = bundlePayload(); p.gameSystems[0].customFieldTag = 'NOPE';
    expectRule('E011 dangling field tag', wrap(p), 'GC-E011');
}
{
    const p = bundlePayload(); p.customFields.push({ ...clone(p.customFields[0]), tag: 'COMBAT' });
    expectRule('E020 reserved tag collision', wrap(p), 'GC-E020');
}
{
    const p = bundlePayload(); p.customFields.push(clone(p.customFields[0])); p.blockOrder = p.blockOrder.slice();
    expectRule('E021 duplicate field tag', wrap(p), 'GC-E021');
}
{
    const p = bundlePayload(); p.customSyspromptLibrary.push(clone(p.customSyspromptLibrary[0]));
    expectRule('E022 duplicate library id', wrap(p), 'GC-E022');
}
{
    const p = bundlePayload(); p.gameSystems.push(clone(p.gameSystems[0]));
    expectRule('E023 duplicate system id', wrap(p), 'GC-E023');
}
{
    const p = bundlePayload(); p.customSyspromptLibrary[0].content = 'not wrapped';
    expectRule('E030 unwrapped library content', wrap(p), 'GC-E030');
}
{
    const p = bundlePayload(); p.customSyspromptLibrary[0].origin = 'unlocked_base'; p.customSyspromptLibrary[0].baseTag = 'nope';
    expectRule('E031 unlocked_base bad baseTag', wrap(p), 'GC-E031');
}
{
    const p = clone(factory); p.stockPrompts.character = 'Track {{ user }} stats';
    expectRule('E040 malformed macro whitespace', wrap(p), 'GC-E040');
}
{
    const p = clone(factory); p.stockPrompts.character = 'Track {{User}} stats';
    expectRule('E040 malformed macro case', wrap(p), 'GC-E040');
}
{
    const p = clone(factory); p.stockPrompts.character = 'Track {{bogusmacro}} stats';
    expectRule('W041 unknown macro', wrap(p), 'GC-W041');
}
{
    const p = clone(factory); p.syspromptSectionOrder = [...bundlePayload().syspromptSectionOrder.filter((k) => k !== 'lib:L1'), 'lib:DANGLING'];
    expectRule('W010 dangling lib order key', wrap(p), 'GC-W010');
}
{
    const p = bundlePayload(); p.syspromptSectionOrder = p.syspromptSectionOrder.filter((k) => k !== 'base:loot');
    expectRule('W011 missing base order key', wrap(p), 'GC-W011');
}
{
    const p = bundlePayload();
    p.syspromptSectionOrder = p.syspromptSectionOrder.map((k) => (k === 'base:[PARTY]_mechanics' ? 'base:party_join_leave' : k));
    expectRule('W012 legacy party_join_leave', wrap(p), 'GC-W012');
}
{
    const p = bundlePayload(); p.syspromptSectionOrder.unshift('base:not_a_section');
    expectRule('W013 unknown base order key', wrap(p), 'GC-W013');
}
{
    const p = bundlePayload(); p.syspromptSectionOrder.push('base:role');
    expectRule('W014 duplicate order key', wrap(p), 'GC-W014');
}
{
    const p = bundlePayload(); p.syspromptSectionOrder = p.syspromptSectionOrder.filter((k) => k !== 'lib:L1');
    expectRule('W015 library entry missing order key', wrap(p), 'GC-W015');
}
{
    const p = bundlePayload(); p.customFields[0].template = 'Foo: ((NOTREAL)) 2/6';
    expectRule('W020 unknown marker', wrap(p), 'GC-W020');
}
t('W020 does not false-positive on universal color-override syntax', () => {
    const p = bundlePayload();
    p.customFields[0].template = 'Foo: ((BAR - purple)) 2/6, ((PROGRESS - #ff0000)) 1/5, ((BAR - #ff0000 #0000ff)) 3/6';
    const F = lint(wrap(p));
    assert(!F.some((f) => f.id === 'GC-W020'), F.filter((f) => f.id === 'GC-W020').map((f) => f.message).join('; '));
});
{
    const p = bundlePayload(); p.customFields[0].template = 'Foo: ((BAR)) 2/6 *emphasis*';
    expectRule('W021 asterisk in template', wrap(p), 'GC-W021');
}
{
    const p = bundlePayload(); p.gameSystems[0].driverGmAnnotation = false;
    expectRule('W030 needsTracker without driver', wrap(p), 'GC-W030');
}
{
    const p = bundlePayload(); p.customFields[0].enabled = false; p.blockOrder = p.blockOrder.filter((t2) => t2 !== 'FOO');
    expectRule('W031 enabled system, disabled field', wrap(p), 'GC-W031');
}
{
    const p = bundlePayload(); p.gameSystems[0].customFieldTag = null;
    expectRule('W032 tracker owner without field', wrap(p), 'GC-W032');
}
{
    const p = bundlePayload(); p.customSyspromptLibrary[0].enabled = false;
    expectRule('W033 enabled system, disabled library section', wrap(p), 'GC-W033');
}
{
    const p = bundlePayload();
    p.customSyspromptLibrary[0] = { id: 'L1', tag: 'loot', content: '<loot>\ncustom loot rules\n</loot>', enabled: true, origin: 'unlocked_base', baseTag: 'loot' };
    p.syspromptSectionOrder = p.syspromptSectionOrder.filter((k) => k !== 'lib:L1');
    expectRule('W040 unlocked_base without disabled module', wrap(p), 'GC-W040');
}
expectRule('W050 long icon', wrap(clone(factory), { icon: 'TOOLONG' }), 'GC-W050');
{
    const p = bundlePayload(); p.customSyspromptLibrary[0].tag = 'Bad Tag'; p.customSyspromptLibrary[0].content = '<Bad Tag>x</Bad Tag>';
    expectRule('W051 library tag not snake_case', wrap(p), 'GC-W051');
}
{
    const p = bundlePayload(); p.customFields[0].tag = 'foo'; p.gameSystems[0].customFieldTag = 'foo'; p.blockOrder = [...clone(factory).blockOrder, 'FOO'];
    expectRule('W052 field tag not UPPER_SNAKE', wrap(p), 'GC-W052');
}
{
    const p = clone(factory); p.blockOrder = [...p.blockOrder, 'ORPHAN'];
    expectRule('W060 orphan blockOrder entry', wrap(p), 'GC-W060');
}
{
    const p = bundlePayload(); p.blockOrder = p.blockOrder.filter((t2) => t2 !== 'FOO');
    expectRule('W061 enabled field missing from blockOrder', wrap(p), 'GC-W061');
}
{
    const p = clone(factory); p.blockOrder = p.blockOrder.filter((t2) => t2 !== 'CHARACTER');
    expectRule('W062 enabled module missing from blockOrder', wrap(p), 'GC-W062');
}
{
    const p = clone(factory); p.blockOrder = [...p.blockOrder, 'TIME'];
    expectRule('W063 duplicate blockOrder entry', wrap(p), 'GC-W063');
}
{
    const p = clone(factory); p.modules.mystery = true;
    expectRule('W070 unknown modules key', wrap(p), 'GC-W070');
}
{
    const p = clone(factory); delete p.gameSystems;
    expectRule('W071 missing payload key', wrap(p), 'GC-W071');
}
{
    const p = clone(factory); delete p.modules.quests;
    expectRule('W072 missing modules key', wrap(p), 'GC-W072');
}
{
    const p = clone(factory); p.routerModules.npc.instruction = '';
    expectRule('W080 routerModules missing instruction', wrap(p), 'GC-W080');
}
expectRule('I001 empty name', { format: 'multihog-game-cartridge', name: ' ', description: 'd', payload: clone(factory) }, 'GC-I001');
expectRule('I002 empty description', wrap(clone(factory), { description: '' }), 'GC-I002');
expectRule('I003 bad exportedAt', wrap(clone(factory), { exportedAt: 'not-a-date' }), 'GC-I003');
expectRule('I004 wrong version', wrap(clone(factory), { version: 99 }), 'GC-I004');

t('schema catches wrong types', () => {
    const bad = wrap(clone(factory));
    bad.payload.rngEnabled = 'yes';
    bad.payload.gameSystems = [{ id: 1 }];
    const F = schemaCheck(bad, schema);
    assert(F.length >= 2, `expected >=2 schema findings, got ${F.length}`);
});
t('schema passes default cartridge', () => {
    const F = schemaCheck(defaultCartridge, schema);
    assert(F.length === 0, F.map((f) => `${f.path}: ${f.message}`).join('; '));
});

// ── validate CLI + fix idempotence ───────────────────────────────────────
t('validate CLI: default cartridge exits 0 with no findings', () => {
    const out = run('validate.mjs', [DEFAULT_CARTRIDGE]);
    assert(out.includes('no findings'), out);
});
t('validate --fix on default cartridge is a byte-identical no-op', () => {
    const copy = path.join(tmp, 'default.json');
    writeFileSync(copy, readFileSync(DEFAULT_CARTRIDGE));
    run('validate.mjs', [copy, '--fix']);
    assert(readFileSync(copy, 'utf8') === readFileSync(path.join(tmp, 'default.fixed.json'), 'utf8'), 'fixed default differs from original');
});
t('validate --fix is idempotent on a broken cartridge', () => {
    const broken = wrap(bundlePayload(), { icon: 'WAYTOOLONG' });
    broken.payload.bogus = 1;
    delete broken.payload.modules.quests;
    broken.payload.syspromptSectionOrder.push('lib:DANGLING');
    broken.payload.gameSystems[0].syspromptLibraryId = 'MISSING';
    const p1 = path.join(tmp, 'broken.json');
    writeFileSync(p1, JSON.stringify(broken, null, 2));
    run('validate.mjs', [p1, '--fix']);
    run('validate.mjs', [path.join(tmp, 'broken.fixed.json'), '--fix']);
    const a = readFileSync(path.join(tmp, 'broken.fixed.json'), 'utf8');
    const b = readFileSync(path.join(tmp, 'broken.fixed.fixed.json'), 'utf8');
    assert(a === b, 'second fix changed bytes');
    const fixed = JSON.parse(a);
    assert(!('bogus' in fixed.payload), 'unknown key survived fix');
    assert(fixed.payload.modules.quests === true, 'modules.quests not backfilled');
    assert(fixed.icon === 'WAYT', 'icon not truncated');
    assert(fixed.payload.gameSystems[0].syspromptLibraryId === null, 'dangling FK not nulled');
    assert(!fixed.payload.syspromptSectionOrder.includes('lib:DANGLING'), 'dangling order key survived');
});

// ── prompt-preview invariants ────────────────────────────────────────────
t('prompt-preview: default shows all base sections', () => {
    const out = run('prompt-preview.mjs', [DEFAULT_CARTRIDGE, '--narrator-only']);
    for (const tag of live.lists.baseSectionTags) {
        assert(out.includes(`\`base:${tag}\``), `missing base:${tag} in section table`);
    }
    assert(out.includes('<role>'), 'assembled prompt missing <role>');
});
t('prompt-preview: CYOA_mode toggle is respected regardless of its factory default', () => {
    const on = clone(defaultCartridge);
    on.payload.syspromptModules.CYOA_mode = true;
    const off = clone(defaultCartridge);
    off.payload.syspromptModules.CYOA_mode = false;
    const fOn = path.join(tmp, 'cyoa-on.json');
    const fOff = path.join(tmp, 'cyoa-off.json');
    writeFileSync(fOn, JSON.stringify(on));
    writeFileSync(fOff, JSON.stringify(off));
    const outOn = run('prompt-preview.mjs', [fOn, '--narrator-only']);
    const outOff = run('prompt-preview.mjs', [fOff, '--narrator-only']);
    assert(/`base:CYOA_mode` \| base \| yes/.test(outOn), 'CYOA_mode=true should enable the section');
    assert(/`base:CYOA_mode` \| base \| NO/.test(outOff), 'CYOA_mode=false should disable the section');
});
t('prompt-preview: toggles change assembly (loot, relationships, wizard lib position)', () => {
    const c = clone(defaultCartridge);
    c.payload = bundlePayload();
    c.payload.syspromptModules.loot = false;
    c.payload.npcRelationshipBars = false;
    const file = path.join(tmp, 'toggles.json');
    writeFileSync(file, JSON.stringify(c));
    const out = run('prompt-preview.mjs', [file, '--narrator-only']);
    assert(!out.includes('<loot>'), '<loot> should be stripped');
    assert(/`base:loot` \| base \| NO/.test(out), 'loot row should be disabled');
    assert(/`base:relationship_tracking` \| base \| NO/.test(out), 'relationship row should be disabled');
    assert(out.includes('<foo_rules>'), 'wizard lib section content missing');
    const libIdx = out.indexOf('| `lib:L1` |');
    const constraintsIdx = out.indexOf('| `base:constraints` |');
    assert(libIdx !== -1 && libIdx < constraintsIdx, 'lib:L1 should be ordered before base:constraints');
});
t('prompt-preview: quest deadline toggle changes extractor prompt', () => {
    const on = clone(defaultCartridge);
    on.payload.syspromptModules.questsDeadlines = true;
    const off = clone(defaultCartridge);
    off.payload.syspromptModules.questsDeadlines = false;
    const fOn = path.join(tmp, 'qd-on.json');
    const fOff = path.join(tmp, 'qd-off.json');
    writeFileSync(fOn, JSON.stringify(on));
    writeFileSync(fOff, JSON.stringify(off));
    const outOn = run('prompt-preview.mjs', [fOn, '--extractor-only']);
    const outOff = run('prompt-preview.mjs', [fOff, '--extractor-only']);
    const count = (s) => (s.match(/DEADLINE/g) || []).length;
    assert(count(outOn) > count(outOff), `deadline mentions: on=${count(outOn)} off=${count(outOff)}`);
});

// ── preview HTML assertions ──────────────────────────────────────────────
t('preview: W&G-like fixture renders every block + expected widgets', () => {
    const c = clone(defaultCartridge);
    c.name = 'Fixture';
    c.payload = bundlePayload();
    c.payload.customFields = [
        { tag: 'GLORY', label: 'Glory', icon: '⚔️', prompt: 'p', template: 'Glory: ((ORBS)) 2/6', enabled: true },
        { tag: 'RUIN', label: 'Ruin', icon: '💀', prompt: 'p', template: 'Ruin: ((BARPURPLE)) 6/10', enabled: true },
        { tag: 'DOOM', label: 'Doom', icon: '☠️', prompt: 'p', template: 'Doom: ((GAUGE)) 3/10', enabled: true },
    ];
    c.payload.gameSystems = [];
    c.payload.customSyspromptLibrary = [];
    c.payload.syspromptSectionOrder = clone(defaultCartridge.payload.syspromptSectionOrder);
    c.payload.blockOrder = ['CHARACTER', 'INVENTORY', 'GLORY', 'RUIN', 'DOOM'];
    const cFile = path.join(tmp, 'fixture.json');
    writeFileSync(cFile, JSON.stringify(c));
    const memo = [
        '[CHARACTER]', 'Hero (Psyker): 20/30 HP', 'Attr: STR 10 (+0)', '[/CHARACTER]',
        '[INVENTORY]', '- 🗡️ [Rare] [E] Blade (1d8) (~10 GP)', '[/INVENTORY]',
        '[GLORY]', 'Glory: ((ORBS)) 2/6', '[/GLORY]',
        '[RUIN]', 'Ruin: ((BARPURPLE)) 6/10', '[/RUIN]',
        '[DOOM]', 'Doom: ((GAUGE)) 3/10', '[/DOOM]',
        '[QUESTS]', 'QUEST: Test', '  ID: q1', '  STATUS: active', '  OBJ_ACTIVE: Do it', '[/QUESTS]',
    ].join('\n');
    const mFile = path.join(tmp, 'fixture-memo.txt');
    writeFileSync(mFile, memo);
    const outFile = path.join(tmp, 'fixture.html');
    run('preview.mjs', [cFile, '--memo', mFile, '--out', outFile, '--theme', 'hacker']);
    const html = readFileSync(outFile, 'utf8');
    for (const [what, needle] of [
        ['orbs widget', 'rt-orb'],
        ['gauge widget', 'rt-gauge-wrap'],
        ['hp bar', 'rt-hp-bar'],
        ['quest card', 'rt-quest-card'],
        ['rarity color', '#0070dd'],
        ['theme class', 'rt-theme-hacker'],
    ]) {
        assert(html.includes(needle), `missing ${what} (${needle})`);
    }
    const cardCount = (html.match(/class="rt-section-card/g) || []).length;
    assert(cardCount >= 5, `expected >=5 section cards, got ${cardCount}`);
    assert(!/src="http|href="http|url\(http/.test(html), 'external URL found — preview must be self-contained');
});

// ── report ───────────────────────────────────────────────────────────────
rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length) {
    console.error('\n' + failures.join('\n'));
    process.exit(1);
}
