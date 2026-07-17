/**
 * lint-rules.mjs — semantic lint catalog for game cartridges.
 *
 * Every rule mirrors an actual behavior of the extension (silent drop,
 * self-heal, render breakage) — the message says what the extension will DO
 * with the offending data, not just that it is "invalid".
 *
 * Severities:
 *   error   — import loses data or produces broken prompts/renders
 *   warning — self-healed on import, or degraded behavior
 *   info    — cosmetic / metadata
 */
import { RESERVED_BLOCK_TAGS, ALLOWED_MACROS, sanitizeSnakeTag, sanitizeUpperTag } from './cartridge-io.mjs';

const SNAKE_TAG_RE = /^[a-z0-9_]+$/;
const UPPER_TAG_RE = /^[A-Z0-9_]+$/;
const MARKER_TOKEN_RE = /\(\(([^()]+?)\)\)/g;
const MACRO_TOKEN_RE = /\{\{([^{}]+)\}\}/g;

/** Map of stock module key → blockOrder tag (modules without a card slot omitted). */
const MODULE_BLOCK_TAGS = {
    character: 'CHARACTER',
    party: 'PARTY',
    combat: 'COMBAT',
    inventory: 'INVENTORY',
    abilities: 'ABILITIES',
    spells: 'SPELLS',
    xp: 'XP',
    time: 'TIME',
};

/** blockOrder tags that are always legitimate even without a custom field. */
const STOCK_BLOCK_TAGS = new Set([...RESERVED_BLOCK_TAGS, 'QUESTS', 'BENCHED PARTY']);

/** Prompt-bearing payload fields scanned for macros: [path, text] pairs. */
function promptFields(payload) {
    const out = [];
    const push = (path, text) => { if (typeof text === 'string' && text) out.push([path, text]); };
    for (const [k, v] of Object.entries(payload.stockPrompts || {})) push(`$.payload.stockPrompts.${k}`, v);
    push('$.payload.systemPromptTemplate', payload.systemPromptTemplate);
    push('$.payload.portraitNpcSystemPrompt', payload.portraitNpcSystemPrompt);
    push('$.payload.portraitCharacterSystemPrompt', payload.portraitCharacterSystemPrompt);
    push('$.payload.portraitLocationSystemPrompt', payload.portraitLocationSystemPrompt);
    push('$.payload.routerSystemPromptTemplate', payload.routerSystemPromptTemplate);
    push('$.payload.routerModularPromptTemplate', payload.routerModularPromptTemplate);
    push('$.payload.worldProgressionSystemPrompt', payload.worldProgressionSystemPrompt);
    for (const [k, m] of Object.entries(payload.routerModules || {})) push(`$.payload.routerModules.${k}.instruction`, m?.instruction);
    (payload.routerCustomTags || []).forEach((t, i) => push(`$.payload.routerCustomTags[${i}].instruction`, t?.instruction));
    (payload.customFields || []).forEach((f, i) => {
        push(`$.payload.customFields[${i}].prompt`, f?.prompt);
        push(`$.payload.customFields[${i}].template`, f?.template);
    });
    (payload.customSyspromptLibrary || []).forEach((e, i) => push(`$.payload.customSyspromptLibrary[${i}].content`, e?.content));
    return out;
}

/**
 * Run all lint rules.
 * @param {object} args
 * @param {object} args.wrapper       parsed cartridge file
 * @param {object} args.payload       wrapper.payload (or {})
 * @param {string[]} args.payloadKeys valid payload keys (from live factory payload)
 * @param {string[]} args.baseTags    top-level sysprompt.txt section tags (live)
 * @param {string[]} args.markerKeys  ALL marker keys incl. aliases (live MARKER_TYPE_MAP)
 * @returns {{id:string, severity:'error'|'warning'|'info', path:string, message:string, fixable:boolean}[]}
 */
export function runLintRules({ wrapper, payload, payloadKeys, baseTags, markerKeys }) {
    const F = [];
    const add = (id, severity, path, message, fixable = false) => F.push({ id, severity, path, message, fixable });

    const library = Array.isArray(payload.customSyspromptLibrary) ? payload.customSyspromptLibrary : [];
    const systems = Array.isArray(payload.gameSystems) ? payload.gameSystems : [];
    const fields = Array.isArray(payload.customFields) ? payload.customFields : [];
    const order = Array.isArray(payload.syspromptSectionOrder) ? payload.syspromptSectionOrder : [];
    const blockOrder = Array.isArray(payload.blockOrder) ? payload.blockOrder : [];
    const libraryIds = new Set(library.map((e) => String(e?.id)));
    const fieldTagsUpper = new Set(fields.map((f) => String(f?.tag || '').toUpperCase()));
    const baseTagSet = new Set(baseTags);
    const markerKeySet = new Set(markerKeys.map((k) => k.toUpperCase()));

    // ── Wrapper ──────────────────────────────────────────────────────────
    if (wrapper.format !== 'multihog-game-cartridge') {
        add('GC-E001', 'error', '$.format', `format must be "multihog-game-cartridge" — the extension rejects the import outright (got ${JSON.stringify(wrapper.format)})`);
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).length === 0) {
        add('GC-E002', 'error', '$.payload', 'payload is missing or empty — importing this produces a factory-default cartridge');
    }
    if (wrapper.version !== undefined && wrapper.version !== 1) {
        add('GC-I004', 'info', '$.version', `version is ${JSON.stringify(wrapper.version)}; the extension ignores it and stamps 1 on import`, true);
    }
    if (!wrapper.name || !String(wrapper.name).trim()) {
        add('GC-I001', 'info', '$.name', 'name is empty — import will call it "Imported Cartridge"');
    }
    if (!wrapper.description || !String(wrapper.description).trim()) {
        add('GC-I002', 'info', '$.description', 'description is empty');
    }
    if (wrapper.icon !== undefined && String(wrapper.icon).trim().length > 4) {
        add('GC-W050', 'warning', '$.icon', `icon "${wrapper.icon}" is longer than 4 characters — import truncates it to "${String(wrapper.icon).trim().slice(0, 4)}"`, true);
    }
    if (wrapper.exportedAt !== undefined && Number.isNaN(Date.parse(wrapper.exportedAt))) {
        add('GC-I003', 'info', '$.exportedAt', `exportedAt ${JSON.stringify(wrapper.exportedAt)} is not a parseable date`);
    }

    // ── Payload key whitelist ────────────────────────────────────────────
    const validKeys = new Set(payloadKeys);
    for (const key of Object.keys(payload)) {
        if (!validKeys.has(key)) {
            add('GC-E003', 'error', `$.payload.${key}`, `unknown payload key — the extension's import silently DROPS it (data loss)`, true);
        }
    }
    for (const key of payloadKeys) {
        if (payload[key] === undefined) {
            add('GC-W071', 'warning', `$.payload.${key}`, 'missing payload key — import silently backfills the factory default', true);
        }
    }

    // ── Cross-references ─────────────────────────────────────────────────
    systems.forEach((sys, i) => {
        const p = `$.payload.gameSystems[${i}]`;
        if (sys?.syspromptLibraryId != null && !libraryIds.has(String(sys.syspromptLibraryId))) {
            add('GC-E010', 'error', `${p}.syspromptLibraryId`, `references library id "${sys.syspromptLibraryId}" but no customSyspromptLibrary entry has that id — the system's GM section will never reach the narrator prompt`, true);
        }
        if (sys?.customFieldTag != null && !fieldTagsUpper.has(String(sys.customFieldTag).toUpperCase())) {
            add('GC-E011', 'error', `${p}.customFieldTag`, `references custom field tag "${sys.customFieldTag}" but no customFields entry matches (case-insensitive) — the system's tracker half is missing`, true);
        }
        if (sys?.needsTracker && !(sys.driverTime || sys.driverGmAnnotation || sys.driverStatedFact)) {
            add('GC-W030', 'warning', p, `needsTracker is true but all three driver flags are false — the wizard always guarantees at least one driver`);
        }
        if (sys?.effectOwner === 'tracker' && sys?.customFieldTag == null) {
            add('GC-W032', 'warning', `${p}.effectOwner`, `effectOwner "tracker" but no customFieldTag linked — no tracker exists to own the effect thresholds`);
        }
        if (sys?.enabled) {
            const field = fields.find((f) => String(f?.tag || '').toUpperCase() === String(sys.customFieldTag || '').toUpperCase());
            if (field && field.enabled === false) {
                add('GC-W031', 'warning', `${p}`, `game system "${sys.name}" is enabled but its linked custom field [${field.tag}] is disabled — the tracker half will not run`);
            }
            const lib = library.find((e) => String(e?.id) === String(sys.syspromptLibraryId));
            if (lib && lib.enabled === false) {
                add('GC-W033', 'warning', `${p}`, `game system "${sys.name}" is enabled but its linked sysprompt library section "${lib.tag}" is disabled — the GM half will not reach the narrator`);
            }
        }
    });

    // Duplicates
    const seenFieldTags = new Map();
    fields.forEach((f, i) => {
        const t = String(f?.tag || '').toUpperCase();
        if (seenFieldTags.has(t)) {
            add('GC-E021', 'error', `$.payload.customFields[${i}].tag`, `duplicate custom field tag "${f.tag}" (also at index ${seenFieldTags.get(t)}) — only one survives the extension's tag matching`);
        } else {
            seenFieldTags.set(t, i);
        }
        if (t && RESERVED_BLOCK_TAGS.includes(t)) {
            add('GC-E020', 'error', `$.payload.customFields[${i}].tag`, `tag "${f.tag}" collides with the reserved stock block [${t}] — the extension blocks this at creation time; behavior after import is undefined`);
        }
        if (f?.tag && !UPPER_TAG_RE.test(String(f.tag))) {
            add('GC-W052', 'warning', `$.payload.customFields[${i}].tag`, `tag "${f.tag}" is not UPPER_SNAKE (sanitized form would be "${sanitizeUpperTag(f.tag)}")`);
        }
    });
    const seenLibIds = new Map();
    library.forEach((e, i) => {
        const id = String(e?.id);
        if (seenLibIds.has(id)) {
            add('GC-E022', 'error', `$.payload.customSyspromptLibrary[${i}].id`, `duplicate library id "${e.id}" (also at index ${seenLibIds.get(id)})`);
        } else {
            seenLibIds.set(id, i);
        }
        if (e?.tag && !SNAKE_TAG_RE.test(String(e.tag))) {
            add('GC-W051', 'warning', `$.payload.customSyspromptLibrary[${i}].tag`, `tag "${e.tag}" is not snake_case (sanitized form would be "${sanitizeSnakeTag(e.tag)}")`);
        }
        // Content wrap
        if (typeof e?.content === 'string' && e.content.trim()) {
            const wrapTag = e?.origin === 'unlocked_base' ? (e.baseTag || e.tag) : e.tag;
            const trimmed = e.content.trim();
            if (wrapTag && !(trimmed.startsWith(`<${wrapTag}>`) && trimmed.endsWith(`</${wrapTag}>`))) {
                add('GC-E030', 'error', `$.payload.customSyspromptLibrary[${i}].content`, `content is not wrapped in <${wrapTag}>…</${wrapTag}> — library sections are emitted verbatim into the narrator prompt and must carry their own tag wrap`);
            }
        }
        if (e?.origin === 'unlocked_base') {
            if (!e.baseTag || !baseTagSet.has(e.baseTag)) {
                add('GC-E031', 'error', `$.payload.customSyspromptLibrary[${i}].baseTag`, `unlocked_base entry has baseTag ${JSON.stringify(e?.baseTag)} which is not a top-level sysprompt.txt section`);
            } else if ((payload.syspromptModules || {})[e.baseTag] !== false && e.baseTag !== 'relationship_tracking' && e.baseTag !== 'CYOA_mode') {
                add('GC-W040', 'warning', `$.payload.customSyspromptLibrary[${i}]`, `unlocked_base override for <${e.baseTag}> but syspromptModules.${e.baseTag} is not false — an unlock normally disables the stock section it replaces`);
            }
        }
    });
    const seenSysIds = new Map();
    systems.forEach((s, i) => {
        const id = String(s?.id);
        if (seenSysIds.has(id)) {
            add('GC-E023', 'error', `$.payload.gameSystems[${i}].id`, `duplicate game system id "${s.id}" (also at index ${seenSysIds.get(id)})`);
        } else {
            seenSysIds.set(id, i);
        }
    });

    // ── syspromptSectionOrder ────────────────────────────────────────────
    const orderableLibIds = new Set(library.filter((e) => e?.origin !== 'unlocked_base').map((e) => String(e?.id)));
    const seenOrderBase = new Set();
    order.forEach((key, i) => {
        const p = `$.payload.syspromptSectionOrder[${i}]`;
        if (typeof key !== 'string') return; // schema already flagged
        if (key === 'base:party_join_leave') {
            add('GC-W012', 'warning', p, 'legacy key base:party_join_leave — import auto-migrates it to base:[PARTY]_mechanics', true);
            return;
        }
        if (key.startsWith('base:')) {
            const tag = key.slice(5);
            if (!baseTagSet.has(tag)) {
                add('GC-W013', 'warning', p, `unknown base section "${tag}" — normalizeSectionOrder drops it on load`, true);
            } else if (seenOrderBase.has(tag)) {
                add('GC-W014', 'warning', p, `duplicate order key ${key} — only the first occurrence survives`, true);
            }
            seenOrderBase.add(tag);
        } else if (key.startsWith('lib:')) {
            const id = key.slice(4);
            if (!orderableLibIds.has(id)) {
                add('GC-W010', 'warning', p, `lib:${id} does not match any orderable customSyspromptLibrary entry — normalizeSectionOrder drops it on load`, true);
            }
        }
    });
    if (order.length > 0) {
        for (const tag of baseTags) {
            if (!seenOrderBase.has(tag) && !(tag === '[PARTY]_mechanics' && order.includes('base:party_join_leave'))) {
                add('GC-W011', 'warning', '$.payload.syspromptSectionOrder', `missing base:${tag} — normalizeSectionOrder re-inserts it at its default position on load`, true);
            }
        }
        for (const id of orderableLibIds) {
            if (!order.includes(`lib:${id}`)) {
                add('GC-W015', 'warning', '$.payload.syspromptSectionOrder', `library entry ${id} has no lib:${id} order key — it will be inserted just before base:constraints on load`, true);
            }
        }
    }

    // ── blockOrder consistency ───────────────────────────────────────────
    const seenBlocks = new Set();
    blockOrder.forEach((tag, i) => {
        if (typeof tag !== 'string') return;
        const p = `$.payload.blockOrder[${i}]`;
        if (seenBlocks.has(tag)) {
            add('GC-W063', 'warning', p, `duplicate blockOrder entry "${tag}"`, true);
        }
        seenBlocks.add(tag);
        if (!STOCK_BLOCK_TAGS.has(tag) && !fieldTagsUpper.has(tag.toUpperCase())) {
            add('GC-W060', 'warning', p, `blockOrder entry "${tag}" matches no stock block and no custom field — it never renders`, true);
        }
    });
    if (blockOrder.length > 0) {
        fields.forEach((f, i) => {
            const t = String(f?.tag || '').toUpperCase();
            if (t && f?.enabled !== false && !seenBlocks.has(t)) {
                add('GC-W061', 'warning', `$.payload.customFields[${i}]`, `enabled custom field [${t}] is not in blockOrder — its card renders after all ordered blocks, in alphabetical fallback order`, true);
            }
        });
        for (const [moduleKey, tag] of Object.entries(MODULE_BLOCK_TAGS)) {
            if ((payload.modules || {})[moduleKey] && !seenBlocks.has(tag)) {
                add('GC-W062', 'warning', '$.payload.blockOrder', `module "${moduleKey}" is enabled but ${tag} is missing from blockOrder — its card renders in alphabetical fallback order`, true);
            }
        }
    }

    // ── modules / stockPrompts / syspromptModules / routerModules keys ──
    const keyedMaps = [
        ['modules', payload.modules],
        ['stockPrompts', payload.stockPrompts],
        ['syspromptModules', payload.syspromptModules],
        ['routerModules', payload.routerModules],
    ];
    for (const [name, map] of keyedMaps) {
        if (!map || typeof map !== 'object') continue;
        // "valid" (accepted without complaint) vs "expected" (has a real factory
        // default, so its absence is an actual backfill event) differ only for
        // syspromptModules: isBaseSectionEnabled() reads ANY base tag as a valid
        // key generically (see setFactoryMapKeys), but only the ~10 canonical
        // toggle keys have a factory default to backfill — the rest are simply
        // absent by design (undefined base tags default to enabled).
        const validKeys = new Set(FACTORY_MAP_KEYS[name] || []);
        const expectedKeys = name === 'syspromptModules' ? new Set(FACTORY_MAP_KEYS.syspromptModulesExpected || []) : validKeys;
        if (!validKeys.size) continue;
        for (const k of Object.keys(map)) {
            if (!validKeys.has(k)) {
                add('GC-W070', 'warning', `$.payload.${name}.${k}`, `unknown ${name} key "${k}" — the extension never reads it`, true);
            }
        }
        for (const k of expectedKeys) {
            if (map[k] === undefined) {
                add('GC-W072', 'warning', `$.payload.${name}.${k}`, `missing ${name} key "${k}" — backfilled with its factory default on import`, true);
            }
        }
    }
    for (const [k, m] of Object.entries(payload.routerModules || {})) {
        if (m && typeof m === 'object') {
            for (const req of ['tag', 'format', 'instruction']) {
                if (typeof m[req] !== 'string' || !m[req]) {
                    add('GC-W080', 'warning', `$.payload.routerModules.${k}.${req}`, `routerModules.${k} is missing "${req}"`);
                }
            }
        }
    }

    // ── Markers in custom field templates/prompts ────────────────────────
    (payload.customFields || []).forEach((f, i) => {
        for (const [fieldName, text] of [['template', f?.template], ['prompt', f?.prompt]]) {
            if (typeof text !== 'string') continue;
            for (const m of text.matchAll(MARKER_TOKEN_RE)) {
                const token = m[1].split(/\s+-\s+#/)[0].trim().toUpperCase();
                if (!markerKeySet.has(token)) {
                    add('GC-W020', 'warning', `$.payload.customFields[${i}].${fieldName}`, `((` + m[1] + `)) is not a known rendering marker — it renders as literal text`);
                }
            }
            if (fieldName === 'template' && text.includes('*')) {
                add('GC-W021', 'warning', `$.payload.customFields[${i}].template`, 'template contains a literal "*" — asterisks are banned in templates (they break widget rendering)');
            }
        }
    });

    // ── Macros ───────────────────────────────────────────────────────────
    for (const [path, text] of promptFields(payload)) {
        for (const m of text.matchAll(MACRO_TOKEN_RE)) {
            const raw = m[1];
            const trimmed = raw.trim();
            if (ALLOWED_MACROS.has(trimmed) && raw !== trimmed) {
                add('GC-E040', 'error', path, `malformed macro {{${raw}}} — whitespace inside the braces breaks substitution; write {{${trimmed}}}`);
            } else if (ALLOWED_MACROS.has(trimmed.toLowerCase()) && !ALLOWED_MACROS.has(trimmed)) {
                add('GC-E040', 'error', path, `malformed macro {{${raw}}} — macros are case-sensitive; write {{${trimmed.toLowerCase()}}}`);
            } else if (!ALLOWED_MACROS.has(trimmed) && !trimmed.includes(':')) {
                add('GC-W041', 'warning', path, `unknown macro {{${raw}}} — not one of the framework macros (${[...ALLOWED_MACROS].join(', ')}); if this is not a SillyTavern macro it will pass through as literal text`);
            }
        }
    }

    return F;
}

/**
 * Factory key sets for keyed maps — injected by validate.mjs from the live
 * factory payload so they never go stale. Populated via setFactoryMapKeys().
 */
const FACTORY_MAP_KEYS = {};

/**
 * @param {object} factoryPayload live getFactoryCartridgePayload() result
 * @param {string[]} [baseTags] live top-level sysprompt.txt section tags. Needed
 *   because isBaseSectionEnabled(tag, settings) reads settings.syspromptModules[tag]
 *   generically for ANY base tag, not just the ~10 with dedicated Narrator
 *   Configuration checkboxes (loot, resting, etc). Setting e.g.
 *   syspromptModules.rng_system = false is the documented, correct way to pair
 *   an unlocked_base override with its base section (see game-systems-guide.md)
 *   — without baseTags here, GC-W070 would wrongly flag every such key as unknown.
 *   'relationship_tracking' is excluded: isBaseSectionEnabled special-cases that
 *   tag to read npcRelationshipBars instead, so a syspromptModules key for it is
 *   genuinely never read.
 */
export function setFactoryMapKeys(factoryPayload, baseTags = []) {
    FACTORY_MAP_KEYS.modules = Object.keys(factoryPayload.modules || {});
    FACTORY_MAP_KEYS.stockPrompts = Object.keys(factoryPayload.stockPrompts || {});
    // "Expected" = the canonical toggle keys with a real factory default value
    // (their absence is an actual backfill event on import).
    FACTORY_MAP_KEYS.syspromptModulesExpected = Object.keys(factoryPayload.syspromptModules || {});
    // "Valid" = expected ∪ every base tag (isBaseSectionEnabled reads
    // syspromptModules[tag] generically for any of them — see setFactoryMapKeys
    // doc comment above for why 'relationship_tracking' is excluded).
    FACTORY_MAP_KEYS.syspromptModules = [
        ...new Set([
            ...FACTORY_MAP_KEYS.syspromptModulesExpected,
            ...baseTags.filter((t) => t !== 'relationship_tracking'),
        ]),
    ];
    FACTORY_MAP_KEYS.routerModules = Object.keys(factoryPayload.routerModules || {});
}
