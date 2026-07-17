#!/usr/bin/env node
/**
 * validate.mjs — validate (and optionally normalize) a game cartridge file.
 *
 *   node validate.mjs <cartridge.json> [--fix] [--json] [--no-drift-check]
 *
 * Phases:
 *   1. Structural check against cartridge.schema.json  (findings id GC-S000, severity error)
 *   2. Semantic lint (lint-rules.mjs) against LIVE framework data
 *   3. Quick drift check (snapshot vs extension source) → warning banner only
 *
 * --fix writes a normalized copy to <input-basename>.fixed.json (never
 * overwrites the input): backfills missing payload keys from the live factory
 * defaults, drops unknown keys, runs the extension's real
 * normalizeSectionOrder, nulls dangling FK references, syncs blockOrder, and
 * repairs the wrapper. Conservative by design: it never renames tags. The fix
 * is idempotent — fixing a fixed file is a byte-identical no-op.
 *
 * Exit codes: 0 = clean or warnings only, 1 = errors remain, 2 = fatal.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootFramework, buildSettingsFromCartridge } from './lib/framework-loader.mjs';
import { readCartridge, sanitizeCartridgeIcon, CARTRIDGE_FORMAT, CARTRIDGE_VERSION, RESERVED_BLOCK_TAGS } from './lib/cartridge-io.mjs';
import { schemaCheck } from './lib/schema-check.mjs';
import { runLintRules, setFactoryMapKeys } from './lib/lint-rules.mjs';
import { computeLiveData, checkDrift } from './extract-framework-data.mjs';

const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };

const MODULE_BLOCK_TAGS = {
    character: 'CHARACTER', party: 'PARTY', combat: 'COMBAT', inventory: 'INVENTORY',
    abilities: 'ABILITIES', spells: 'SPELLS', xp: 'XP', time: 'TIME',
};

function collectFindings(fw, wrapper, payload, schema, liveData) {
    const findings = [];
    for (const s of schemaCheck(wrapper, schema)) {
        findings.push({ id: 'GC-S000', severity: 'error', path: s.path, message: `schema: ${s.message}`, fixable: false });
    }
    findings.push(...runLintRules({
        wrapper,
        payload,
        payloadKeys: liveData.lists.payloadKeys,
        baseTags: liveData.lists.baseSectionTags,
        markerKeys: liveData.lists.markerAllKeys,
    }));
    findings.sort((a, b) => (SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]) || a.path.localeCompare(b.path));
    return findings;
}

/** Build the normalized (fixed) cartridge object. Deterministic and idempotent. */
function buildFixed(fw, wrapper, payload, baseTags = []) {
    const factory = fw.stateManager.getFactoryCartridgePayload();
    const clone = (v) => JSON.parse(JSON.stringify(v));

    // 1. Payload: whitelist + backfill, preserving factory key order.
    const fixedPayload = {};
    for (const key of Object.keys(factory)) {
        fixedPayload[key] = payload[key] !== undefined ? clone(payload[key]) : clone(factory[key]);
    }

    // 2. Keyed maps: drop unknown subkeys, backfill missing ones. syspromptModules
    // is special: isBaseSectionEnabled(tag, settings) reads settings.syspromptModules[tag]
    // generically for ANY base section tag, not just the ~10 canonical toggle keys
    // (see lint-rules.mjs setFactoryMapKeys doc comment) — most commonly set to
    // `false` to pair an unlocked_base override with its base section. Restricting
    // this map to factory keys only would silently discard that pairing.
    for (const mapKey of ['modules', 'stockPrompts', 'syspromptModules', 'routerModules']) {
        const factoryMap = factory[mapKey];
        const inputMap = (fixedPayload[mapKey] && typeof fixedPayload[mapKey] === 'object' && !Array.isArray(fixedPayload[mapKey])) ? fixedPayload[mapKey] : {};
        const validExtraKeys = mapKey === 'syspromptModules' ? new Set(baseTags.filter((t) => t !== 'relationship_tracking')) : new Set();
        const merged = {};
        for (const k of Object.keys(factoryMap)) {
            merged[k] = inputMap[k] !== undefined ? inputMap[k] : clone(factoryMap[k]);
        }
        for (const [k, v] of Object.entries(inputMap)) {
            if (merged[k] === undefined && validExtraKeys.has(k)) merged[k] = v;
        }
        fixedPayload[mapKey] = merged;
    }

    // 3. FK pruning: null dangling references.
    const libraryIds = new Set((fixedPayload.customSyspromptLibrary || []).map((e) => String(e?.id)));
    const fieldTagsUpper = new Set((fixedPayload.customFields || []).map((f) => String(f?.tag || '').toUpperCase()));
    for (const sys of fixedPayload.gameSystems || []) {
        if (sys?.syspromptLibraryId != null && !libraryIds.has(String(sys.syspromptLibraryId))) sys.syspromptLibraryId = null;
        if (sys?.customFieldTag != null && !fieldTagsUpper.has(String(sys.customFieldTag).toUpperCase())) sys.customFieldTag = null;
    }

    // 4. Section order via the extension's real self-heal. An EMPTY order is
    //    canonical factory state ("use default order on load") — leave it be.
    if ((fixedPayload.syspromptSectionOrder || []).length > 0) {
        const settings = buildSettingsFromCartridge(fw, fixedPayload);
        const baseSections = fw.gameSystems.extractTopLevelSections(fw.sysPromptRaw);
        fixedPayload.syspromptSectionOrder = clone(fw.gameSystems.normalizeSectionOrder(settings, baseSections));
        // normalizeSectionOrder may migrate library baseTags (party_join_leave) in-place.
        fixedPayload.customSyspromptLibrary = clone(settings.customSyspromptLibrary || []);
    }

    // 5. blockOrder: keep valid entries (dedup), then append missing module
    //    tags and missing enabled custom-field tags in deterministic order.
    const validBlockTags = new Set([...RESERVED_BLOCK_TAGS, 'QUESTS', 'BENCHED PARTY', ...fieldTagsUpper]);
    const seen = new Set();
    const blockOrder = [];
    for (const tag of Array.isArray(fixedPayload.blockOrder) ? fixedPayload.blockOrder : []) {
        if (typeof tag === 'string' && validBlockTags.has(tag) && !seen.has(tag)) {
            seen.add(tag);
            blockOrder.push(tag);
        }
    }
    for (const [moduleKey, tag] of Object.entries(MODULE_BLOCK_TAGS)) {
        if (fixedPayload.modules[moduleKey] && !seen.has(tag)) {
            seen.add(tag);
            blockOrder.push(tag);
        }
    }
    for (const f of fixedPayload.customFields || []) {
        const t = String(f?.tag || '').toUpperCase();
        if (t && f?.enabled !== false && !seen.has(t)) {
            seen.add(t);
            blockOrder.push(t);
        }
    }
    fixedPayload.blockOrder = blockOrder;

    // 6. Wrapper repair.
    return {
        format: CARTRIDGE_FORMAT,
        version: CARTRIDGE_VERSION,
        name: String(wrapper.name ?? '').trim() || 'Imported Cartridge',
        description: String(wrapper.description ?? '').trim(),
        icon: sanitizeCartridgeIcon(wrapper.icon),
        ...(wrapper.exportedAt !== undefined ? { exportedAt: wrapper.exportedAt } : {}),
        payload: fixedPayload,
    };
}

function printFindings(findings) {
    const counts = { error: 0, warning: 0, info: 0 };
    for (const f of findings) counts[f.severity]++;
    const label = { error: 'ERROR', warning: 'WARN ', info: 'INFO ' };
    for (const f of findings) {
        console.log(`${f.id} ${label[f.severity]} ${f.path}\n      ${f.message}`);
    }
    console.log(`\n${counts.error} error(s), ${counts.warning} warning(s), ${counts.info} info(s)`);
    return counts;
}

async function main() {
    const args = process.argv.slice(2);
    const flags = new Set(args.filter((a) => a.startsWith('--')));
    const files = args.filter((a) => !a.startsWith('--'));
    if (files.length !== 1) {
        console.error('Usage: validate.mjs <cartridge.json> [--fix] [--json] [--no-drift-check]');
        process.exit(2);
    }
    const inputPath = path.resolve(files[0]);
    const fw = await bootFramework();
    const liveData = await computeLiveData();
    setFactoryMapKeys(fw.stateManager.getFactoryCartridgePayload(), liveData.lists.baseSectionTags);
    const schema = JSON.parse((await import('node:fs')).readFileSync(path.join(SKILL_ROOT, 'cartridge.schema.json'), 'utf8'));

    let wrapper, payload;
    try {
        ({ wrapper, payload } = readCartridge(inputPath));
    } catch (err) {
        console.error(String(err.message));
        process.exit(2);
    }

    const driftProblems = flags.has('--no-drift-check') ? [] : checkDrift(liveData);

    let findings = collectFindings(fw, wrapper, payload, schema, liveData);
    let fixedPath = null;
    let appliedFixes = 0;

    if (flags.has('--fix')) {
        appliedFixes = findings.filter((f) => f.fixable).length;
        const fixed = buildFixed(fw, wrapper, payload, liveData.lists.baseSectionTags);
        fixedPath = inputPath.replace(/\.json$/i, '') + '.fixed.json';
        writeFileSync(fixedPath, JSON.stringify(fixed, null, 2) + '\n');
        // Re-lint the fixed document; exit code reflects what REMAINS.
        findings = collectFindings(fw, fixed, fixed.payload, schema, liveData);
    }

    if (flags.has('--json')) {
        const counts = { error: 0, warning: 0, info: 0 };
        for (const f of findings) counts[f.severity]++;
        console.log(JSON.stringify({
            file: inputPath,
            fixedFile: fixedPath,
            drift: driftProblems.length > 0,
            counts,
            findings,
        }, null, 2));
    } else {
        if (driftProblems.length) {
            console.log(`⚠ FRAMEWORK DRIFT: the extension source no longer matches the skill snapshot (${driftProblems.length} item(s)).`);
            console.log('  Findings below may be based on stale data. Run extract-framework-data.mjs --check for details.\n');
        }
        if (fixedPath) {
            console.log(`Applied fixes for ${appliedFixes} fixable finding(s) → ${fixedPath}`);
            console.log('Remaining findings on the fixed file:\n');
        }
        if (findings.length === 0) {
            console.log('✓ Cartridge is valid — no findings.');
        } else {
            printFindings(findings);
        }
    }
    process.exit(findings.some((f) => f.severity === 'error') ? 1 : 0);
}

main().catch((err) => { console.error(err.stack || String(err)); process.exit(2); });
