#!/usr/bin/env node
/**
 * extract-framework-data.mjs — snapshot & drift check for the game-cartridge skill.
 *
 *   --update   Regenerate references/default-cartridge.json (factory payload,
 *              deterministic wrapper) and data/framework-snapshot.json
 *              (hashes of the few reimplemented source fragments + the
 *              framework enum lists the validator relies on).
 *   --check    Recompute everything live and diff against the snapshot.
 *              Exit 1 on any drift — meaning the extension has changed in a
 *              way the skill's reimplemented bits or docs may not reflect.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootFramework, REPO_ROOT } from './lib/framework-loader.mjs';
import { CARTRIDGE_FORMAT, CARTRIDGE_VERSION } from './lib/cartridge-io.mjs';

const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT_PATH = path.join(SKILL_ROOT, 'data', 'framework-snapshot.json');
const DEFAULT_CARTRIDGE_PATH = path.join(SKILL_ROOT, 'references', 'default-cartridge.json');

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/** Extract a top-level `function name(...)` body (ends at the first `}` in column 0). */
function extractFunctionSource(source, name, file) {
    const re = new RegExp(`^(?:export\\s+)?(?:async\\s+)?function ${name}\\(`, 'm');
    const m = source.match(re);
    if (!m) throw new Error(`Cannot locate function ${name} in ${file}`);
    const start = m.index;
    const end = source.indexOf('\n}', start);
    if (end === -1) throw new Error(`Cannot find end of function ${name} in ${file}`);
    return source.slice(start, end + 2);
}

function extractLineMatching(source, regex, file) {
    const m = source.match(regex);
    if (!m) throw new Error(`Cannot locate pattern ${regex} in ${file}`);
    return m[0];
}

export async function computeLiveData() {
    const fw = await bootFramework();
    const read = (name) => readFileSync(path.join(REPO_ROOT, name), 'utf8');
    const indexSrc = read('index.js');
    const gameSystemsSrc = read('game-systems.js');
    const gameCartridgesSrc = read('game-cartridges.js');

    const factoryPayload = fw.stateManager.getFactoryCartridgePayload();
    const sections = fw.gameSystems.extractTopLevelSections(fw.sysPromptRaw);

    return {
        generatedFor: `Multihog D&D Framework v${JSON.parse(read('manifest.json')).version}`,
        cartridgeFormat: extractLineMatching(gameCartridgesSrc, /const CARTRIDGE_FORMAT = '[^']+';\nconst CARTRIDGE_VERSION = \d+;/, 'game-cartridges.js'),
        sourceHashes: {
            buildSysprompt: sha256(extractFunctionSource(indexSrc, 'buildSysprompt', 'index.js')),
            sanitizeSnakeTag: sha256(extractFunctionSource(gameSystemsSrc, 'sanitizeSnakeTag', 'game-systems.js')),
            sanitizeUpperTag: sha256(extractFunctionSource(gameSystemsSrc, 'sanitizeUpperTag', 'game-systems.js')),
            uniqueTag: sha256(extractFunctionSource(gameSystemsSrc, 'uniqueTag', 'game-systems.js')),
            sanitizeCartridgeIcon: sha256(extractFunctionSource(gameCartridgesSrc, 'sanitizeCartridgeIcon', 'game-cartridges.js')),
            reservedTagsLine: sha256(extractLineMatching(gameSystemsSrc, /\['COMBAT',\s*'CHARACTER'[^\]]*\]/, 'game-systems.js')),
        },
        lists: {
            payloadKeys: Object.keys(factoryPayload),
            baseSectionTags: sections.map((s) => s.tag),
            markerCanonicalKeys: fw.renderer.getMarkerLibraryKeys(),
            markerAllKeys: Object.keys(fw.renderer.MARKER_TYPE_MAP),
            stockPromptKeys: Object.keys(fw.constants.DEFAULT_STOCK_PROMPTS),
            moduleKeys: Object.keys(factoryPayload.modules),
            syspromptModuleKeys: Object.keys(factoryPayload.syspromptModules),
            routerModuleKeys: Object.keys(factoryPayload.routerModules),
            blockOrderDefault: factoryPayload.blockOrder,
        },
        factoryPayloadHash: sha256(JSON.stringify(factoryPayload)),
    };
}

function buildDefaultCartridge(factoryPayload) {
    return {
        format: CARTRIDGE_FORMAT,
        version: CARTRIDGE_VERSION,
        name: 'Default',
        description: 'Factory default (D&D-style) cartridge generated from the extension factory payload by extract-framework-data.mjs --update. Do not edit by hand.',
        icon: '🎮',
        exportedAt: '1970-01-01T00:00:00.000Z',
        payload: factoryPayload,
    };
}

function diffValues(label, snapVal, liveVal, problems) {
    const a = JSON.stringify(snapVal);
    const b = JSON.stringify(liveVal);
    if (a !== b) problems.push(`DRIFT ${label}:\n  snapshot: ${a}\n  live:     ${b}`);
}

/**
 * Compare live data against the stored snapshot.
 * @returns {string[]} drift descriptions (empty = no drift)
 */
export function checkDrift(live) {
    let snapshot;
    try {
        snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
    } catch (err) {
        return [`snapshot unreadable (${err.message}) — run extract-framework-data.mjs --update`];
    }
    const problems = [];
    for (const [k, v] of Object.entries(live.sourceHashes)) diffValues(`sourceHashes.${k}`, snapshot.sourceHashes?.[k], v, problems);
    for (const [k, v] of Object.entries(live.lists)) diffValues(`lists.${k}`, snapshot.lists?.[k], v, problems);
    diffValues('cartridgeFormat', snapshot.cartridgeFormat, live.cartridgeFormat, problems);
    diffValues('factoryPayloadHash', snapshot.factoryPayloadHash, live.factoryPayloadHash, problems);
    try {
        const ref = JSON.parse(readFileSync(DEFAULT_CARTRIDGE_PATH, 'utf8'));
        diffValues('default-cartridge.payload', sha256(JSON.stringify(ref.payload)), live.factoryPayloadHash, problems);
    } catch (err) {
        problems.push(`DRIFT default-cartridge.json unreadable: ${err.message}`);
    }
    return problems;
}

async function main() {
    const mode = process.argv[2];
    if (mode !== '--update' && mode !== '--check') {
        console.error('Usage: extract-framework-data.mjs --update | --check');
        process.exit(2);
    }
    const live = await computeLiveData();

    if (mode === '--update') {
        const fw = await bootFramework();
        mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
        mkdirSync(path.dirname(DEFAULT_CARTRIDGE_PATH), { recursive: true });
        writeFileSync(SNAPSHOT_PATH, JSON.stringify(live, null, 2) + '\n');
        writeFileSync(DEFAULT_CARTRIDGE_PATH, JSON.stringify(buildDefaultCartridge(fw.stateManager.getFactoryCartridgePayload()), null, 2) + '\n');
        console.log(`Wrote ${path.relative(REPO_ROOT, SNAPSHOT_PATH)}`);
        console.log(`Wrote ${path.relative(REPO_ROOT, DEFAULT_CARTRIDGE_PATH)}`);
        return;
    }

    const problems = checkDrift(live);
    if (problems.length) {
        console.error(`Framework drift detected (${problems.length} item(s)) — the extension source has changed since the skill snapshot.`);
        console.error('The skill\'s reimplemented fragments/docs may be stale. Re-verify them, then run --update.\n');
        for (const p of problems) console.error(p + '\n');
        process.exit(1);
    }
    console.log('Drift check OK — snapshot matches live extension source.');
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
    main().catch((err) => { console.error(err.stack || String(err)); process.exit(2); });
}
