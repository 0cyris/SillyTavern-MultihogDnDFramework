/**
 * cartridge-io.mjs — shared cartridge file I/O and the few framework
 * constants that are not exported by the extension modules. Everything in
 * REIMPLEMENTED below is hash-guarded by extract-framework-data.mjs --check:
 * if the extension source changes, the drift check fails loudly.
 */
import { readFileSync } from 'node:fs';

// ── REIMPLEMENTED (drift-guarded) ────────────────────────────────────────
// game-cartridges.js:23-24
export const CARTRIDGE_FORMAT = 'multihog-game-cartridge';
export const CARTRIDGE_VERSION = 1;

// game-systems.js:1841-1842 — stock block tags a custom field tag must not shadow
export const RESERVED_BLOCK_TAGS = ['COMBAT', 'CHARACTER', 'PARTY', 'INVENTORY', 'ABILITIES', 'SPELLS', 'XP', 'TIME'];

// game-systems.js:206-213
export function sanitizeSnakeTag(str) {
    return (str || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'custom_section';
}

export function sanitizeUpperTag(str) {
    return (str || '').toUpperCase().trim().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'CUSTOM';
}
// ── end REIMPLEMENTED ────────────────────────────────────────────────────

/** Macros that may legitimately appear in cartridge prompt content. */
export const ALLOWED_MACROS = new Set([
    'user', 'char', 'persona', 'modulesText', 'wordtarget', 'name', 'path', 'campaignRoot', 'formatLines',
]);

/**
 * Read and parse a cartridge file.
 * @returns {{ wrapper: object, payload: object }}
 * @throws {Error} with a user-facing message on unreadable/unparseable input
 */
export function readCartridge(filePath) {
    let text;
    try {
        text = readFileSync(filePath, 'utf8');
    } catch (err) {
        throw new Error(`Cannot read file: ${filePath} (${err.message})`);
    }
    let wrapper;
    try {
        wrapper = JSON.parse(text.trim());
    } catch (err) {
        throw new Error(`Not valid JSON: ${filePath} (${err.message})`);
    }
    if (!wrapper || typeof wrapper !== 'object' || Array.isArray(wrapper)) {
        throw new Error(`Cartridge root must be a JSON object: ${filePath}`);
    }
    const payload = (wrapper.payload && typeof wrapper.payload === 'object' && !Array.isArray(wrapper.payload))
        ? wrapper.payload
        : {};
    return { wrapper, payload };
}

/** True when a value is a plain object (not array/null). */
export function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// game-cartridges.js:32-35 — trim, max 4 UTF-16 units, fallback (drift-guarded)
export function sanitizeCartridgeIcon(icon) {
    const trimmed = (icon || '').trim();
    return trimmed ? trimmed.slice(0, 4) : '🎮';
}
