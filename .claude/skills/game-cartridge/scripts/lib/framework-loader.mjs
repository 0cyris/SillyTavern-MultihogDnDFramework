/**
 * framework-loader.mjs — boots the real Multihog D&D Framework extension
 * modules under plain Node so skill tools (validate / preview / prompt-preview)
 * run the extension's actual logic instead of a reimplementation.
 *
 * Allowlisted real modules: constants.js, state-manager.js, memo-processor.js,
 * renderer.js, game-systems.js. Everything else they import (browser-only
 * modules, SillyTavern core) is stubbed by loader-hooks.mjs; the stub export
 * names are auto-collected here from the allowlisted files' import statements,
 * so new imports in future extension versions keep working without edits.
 */
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
// lib -> scripts -> game-cartridge -> skills -> .claude -> repo root
export const REPO_ROOT = path.resolve(LIB_DIR, '..', '..', '..', '..', '..');

const ALLOW_NAMES = [
    'constants.js',
    'state-manager.js',
    'memo-processor.js',
    'renderer.js',
    'game-systems.js',
];

const IMPORT_RE = /import\s+([\s\S]*?)\s+from\s*['"]([^'"]+)['"]/g;

/** Parse an import clause into the export names the source module must provide. */
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

/** Scan allowlisted files for imports of non-allowlisted modules → stub export map. */
function buildStubExports() {
    const stubExports = {};
    for (const name of ALLOW_NAMES) {
        const filePath = path.join(REPO_ROOT, name);
        const source = readFileSync(filePath, 'utf8');
        const parentUrl = pathToFileURL(filePath).href;
        for (const match of source.matchAll(IMPORT_RE)) {
            const [, clause, specifier] = match;
            if (!specifier.startsWith('./') && !specifier.startsWith('../')) continue;
            const resolved = new URL(specifier, parentUrl).href;
            if (ALLOW_NAMES.includes(resolved.split('/').pop())) continue;
            const bucket = (stubExports[resolved] ??= []);
            for (const n of importedNames(clause)) {
                if (!bucket.includes(n)) bucket.push(n);
            }
        }
    }
    return stubExports;
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
        register('./loader-hooks.mjs', {
            parentURL: import.meta.url,
            data: {
                repoRootUrl: pathToFileURL(REPO_ROOT + path.sep).href,
                allowNames: ALLOW_NAMES,
                stubExports: buildStubExports(),
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
