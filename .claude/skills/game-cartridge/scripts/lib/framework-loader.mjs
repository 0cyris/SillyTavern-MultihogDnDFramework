/**
 * framework-loader.mjs — boots the real Multihog D&D Framework extension
 * modules under plain Node so skill tools (validate / preview / prompt-preview)
 * run the extension's actual logic instead of a reimplementation.
 *
 * "Real" modules are computed dynamically, not hardcoded: starting from 5 entry
 * points (constants.js, state-manager.js, memo-processor.js, renderer.js,
 * game-systems.js), we follow every relative import/re-export (`import ... from`
 * AND `export * from`) transitively, loading each target as real source —
 * UNLESS its basename is in BOUNDARY_NAMES (known browser/SillyTavern-only
 * files) or the specifier resolves outside the repo root (SillyTavern core,
 * e.g. `../../../popup.js`), in which case it's stubbed instead and recursion
 * stops there. This survives internal refactors (e.g. state-manager.js
 * shrinking to a barrel over 25+ files under src/state/) without needing this
 * file edited every time the extension's module boundaries shift — only
 * BOUNDARY_NAMES needs a new entry if a genuinely browser-only file gets
 * pulled transitively into the closure by name collision (unlikely: entries
 * here are specific filenames known to need live SillyTavern/DOM context).
 *
 * Run `node extract-framework-data.mjs --check` after any extension update —
 * it fails loudly if a file that should stay stubbed becomes load-bearing, or
 * vice versa (e.g. a newly real module throwing at import time).
 */
import { register } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
// lib -> scripts -> game-cartridge -> skills -> .claude -> repo root
export const REPO_ROOT = path.resolve(LIB_DIR, '..', '..', '..', '..', '..');

const ENTRY_POINTS = [
    'constants.js',
    'state-manager.js',
    'memo-processor.js',
    'renderer.js',
    'game-systems.js',
];

/**
 * Filenames known to require a live browser/SillyTavern-core context (DOM,
 * jQuery, ST's own `getContext()` surface beyond what installGlobals() stubs,
 * slash-command registration, etc). Recursion stops here — these load as
 * auto-generated no-op stubs, and so does anything only reachable through them.
 */
const BOUNDARY_NAMES = new Set([
    'llm-client.js', 'ui-editors.js', 'ui-geometry.js', 'debug-viewer.js',
    'game-cartridges.js', 'portrait-storage.js', 'index.js', 'theme-manager.js',
    'character-creator.js', 'immersion.js', 'router.js', 'narrative-hooks.js',
    'quests.js', 'portraits.js', 'swipe-scheduler-debug.js',
]);

const IMPORT_RE = /(?:import|export)\s+([\s\S]*?)\s+from\s*['"]([^'"]+)['"]/g;

/** Parse an import/re-export clause into the export names the source module must provide. */
function importedNames(clause) {
    const names = [];
    const braceMatch = clause.match(/\{([\s\S]*?)\}/);
    if (braceMatch) {
        for (const part of braceMatch[1].split(',')) {
            const name = part.trim().split(/\s+as\s+/)[0].trim();
            if (name) names.push(name);
        }
    }
    const outside = clause.replace(/\{[\s\S]*?\}/, '').trim();
    if (outside && !outside.startsWith('*')) names.push('default');
    return names;
}

/**
 * Compute the transitive closure of real (non-stubbed) repo files reachable
 * from ENTRY_POINTS, plus the export-name map needed to synthesize stubs for
 * everything at the boundary.
 * @returns {{ realPaths: Set<string>, stubExports: Record<string,string[]> }}
 *   realPaths holds repo-relative paths (e.g. "src/state/settings.js").
 */
function resolveModuleGraph() {
    const realPaths = new Set();
    const stubExports = {};
    const queue = [...ENTRY_POINTS];
    const entrySet = new Set(ENTRY_POINTS);

    while (queue.length) {
        const rel = queue.shift();
        if (realPaths.has(rel)) continue;
        realPaths.add(rel);
        const abs = path.join(REPO_ROOT, rel);
        if (!existsSync(abs)) {
            throw new Error(`framework-loader: expected file missing after upstream update: ${rel}`);
        }
        const isBoundary = !entrySet.has(rel) && BOUNDARY_NAMES.has(path.basename(rel));
        const source = readFileSync(abs, 'utf8');
        const parentUrl = pathToFileURL(abs).href;
        for (const match of source.matchAll(IMPORT_RE)) {
            const [, clause, specifier] = match;
            if (!specifier.startsWith('./') && !specifier.startsWith('../')) continue;
            const resolvedUrl = new URL(specifier, parentUrl).href;
            const resolvedRel = path.relative(REPO_ROOT, fileURLToPath(resolvedUrl)).split(path.sep).join('/');
            const isExternal = resolvedRel.startsWith('..');
            const targetIsBoundary = !isExternal && BOUNDARY_NAMES.has(path.basename(resolvedRel));

            if (isBoundary) continue; // boundary files' own imports are never followed
            if (isExternal || targetIsBoundary) {
                const bucket = (stubExports[resolvedUrl] ??= []);
                for (const n of importedNames(clause)) {
                    if (!bucket.includes(n)) bucket.push(n);
                }
                continue;
            }
            if (!realPaths.has(resolvedRel)) queue.push(resolvedRel);
        }
    }
    return { realPaths, stubExports };
}

function installGlobals() {
    if (!globalThis.__mhLocalStorage) {
        const store = new Map();
        globalThis.__mhLocalStorage = {
            getItem: (k) => (store.has(String(k)) ? store.get(String(k)) : null),
            setItem: (k, v) => void store.set(String(k), String(v)),
            removeItem: (k) => void store.delete(String(k)),
            clear: () => void store.clear(),
            key: (i) => [...store.keys()][i] ?? null,
            get length() { return store.size; },
        };
        try {
            Object.defineProperty(globalThis, 'localStorage', {
                value: globalThis.__mhLocalStorage,
                configurable: true,
                writable: true,
            });
        } catch {
            globalThis.localStorage = globalThis.__mhLocalStorage;
        }
    }
    globalThis.__mhExtensionSettings ??= {};
    globalThis.SillyTavern ??= {};
    globalThis.SillyTavern.getContext = () => ({ extensionSettings: globalThis.__mhExtensionSettings });
    globalThis.toastr ??= { success() {}, error() {}, info() {}, warning() {} };
}

let bootPromise = null;

/**
 * Boot the framework once per process.
 * @returns {Promise<{constants, stateManager, memoProcessor, renderer, gameSystems, repoRoot, sysPromptRaw, styleCss}>}
 */
export function bootFramework() {
    bootPromise ??= (async () => {
        installGlobals();
        const { realPaths, stubExports } = resolveModuleGraph();
        register('./loader-hooks.mjs', {
            parentURL: import.meta.url,
            data: {
                repoRootUrl: pathToFileURL(REPO_ROOT + path.sep).href,
                realPaths: [...realPaths],
                stubExports,
            },
        });
        const mod = (name) => import(pathToFileURL(path.join(REPO_ROOT, name)).href);
        const [constants, stateManager, memoProcessor, renderer, gameSystems] = await Promise.all([
            mod('constants.js'),
            mod('state-manager.js'),
            mod('memo-processor.js'),
            mod('renderer.js'),
            mod('game-systems.js'),
        ]);
        return {
            constants,
            stateManager,
            memoProcessor,
            renderer,
            gameSystems,
            repoRoot: REPO_ROOT,
            get sysPromptRaw() { return readFileSync(path.join(REPO_ROOT, 'sysprompt.txt'), 'utf8'); },
            get styleCss() { return readFileSync(path.join(REPO_ROOT, 'style.css'), 'utf8'); },
        };
    })();
    return bootPromise;
}

/**
 * Seed live extension settings from a cartridge payload: full factory
 * defaults, then payload keys overlaid, then the extension's own
 * getSettings() merge/migration pass (short-circuited by the current
 * settingsVersion). Falls back to the plain merged object if getSettings
 * throws under Node.
 */
export function buildSettingsFromCartridge(fw, payload = {}) {
    const extensionSettings = globalThis.__mhExtensionSettings;
    const { MODULE_NAME, FACTORY_SETTINGS_VERSION, applyFactoryReset, getFactoryCartridgePayload, getSettings } = fw.stateManager;
    applyFactoryReset(extensionSettings);
    const s = extensionSettings[MODULE_NAME];
    const factory = getFactoryCartridgePayload();
    for (const key of Object.keys(factory)) {
        if (payload[key] !== undefined) {
            s[key] = JSON.parse(JSON.stringify(payload[key]));
        }
    }
    s.settingsVersion = FACTORY_SETTINGS_VERSION;
    try {
        return getSettings();
    } catch (err) {
        process.emitWarning(`getSettings() failed under Node (${err.message}); using plain factory+payload merge.`);
        return s;
    }
}
