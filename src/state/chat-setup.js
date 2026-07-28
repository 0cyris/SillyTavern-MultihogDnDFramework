/**
 * Optional per-chat System Prompt Control Room and State Tracker setup snapshots.
 *
 * Definitions live in global catalogs. A chat snapshot stores only activation
 * state, ordering, and the stock setup. This keeps modules/snippets discoverable
 * outside the chat where they were created without activating them there.
 */

import { buildDefaultSettings } from './defaults.js';

export const CHAT_SETUP_KEYS = Object.freeze([
    // System Prompt Control Room (custom definitions live in the snippet catalog)
    'syspromptSectionOrder',
    'syspromptModules',
    'cyoaConfig',
    'narrativePacing',
    'npcRelationshipBars',
    'rngEnabled',
    'diceFunctionTool',
    'diceD100Mode',
    'rngToolD20',
    'rngToolD100',
    'rngQueueD20',
    'rngQueueD100',

    // State Tracker model and stock modules
    'systemPromptTemplate',
    'userPromptSuffix',
    'modules',
    'blockOrder',
    'stockPrompts',
    'modulePageSizes',
]);

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function customFieldKey(item) {
    return String(item?.tag || '').trim().toUpperCase();
}

function snippetKey(item) {
    return String(item?.id || '').trim();
}

function gameSystemKey(item) {
    return String(item?.id || '').trim();
}

function definitionOnly(item) {
    const copy = clone(item || {});
    delete copy.enabled;
    delete copy._chatSetupMember;
    return copy;
}

function mergeCatalog(existing, sources, keyOf, preferExisting = true) {
    const merged = new Map();
    if (!preferExisting) {
        for (const item of Array.isArray(existing) ? existing : []) {
            const key = keyOf(item);
            if (!key) continue;
            merged.set(key, definitionOnly(item));
        }
    }
    for (const source of sources) {
        for (const item of Array.isArray(source) ? source : []) {
            const key = keyOf(item);
            if (!key) continue;
            merged.set(key, { ...(merged.get(key) || {}), ...definitionOnly(item) });
        }
    }
    if (preferExisting) {
        // Existing catalog definitions are authoritative over legacy chat snapshots.
        for (const item of Array.isArray(existing) ? existing : []) {
            const key = keyOf(item);
            if (!key) continue;
            merged.set(key, { ...(merged.get(key) || {}), ...definitionOnly(item) });
        }
    }
    return [...merged.values()];
}

function stateMap(items, keyOf) {
    const states = {};
    for (const item of Array.isArray(items) ? items : []) {
        const key = keyOf(item);
        if (key && item._chatSetupMember !== false) states[key] = !!item.enabled;
    }
    return states;
}

function hydrateCatalog(catalog, states, keyOf) {
    return (Array.isArray(catalog) ? catalog : []).map(item => {
        const key = keyOf(item);
        const member = Object.prototype.hasOwnProperty.call(states || {}, key);
        return {
            ...clone(item),
            enabled: member ? !!states[key] : false,
            _chatSetupMember: member,
        };
    });
}

function collectLegacySetupArrays(settings, field) {
    const lists = [];
    for (const snapshot of Object.values(settings?.chatStates || {})) {
        if (Array.isArray(snapshot?.setup?.[field])) lists.push(snapshot.setup[field]);
    }
    return lists;
}

function upgradeLegacySetup(setup) {
    if (!setup || typeof setup !== 'object') return;
    if (!setup.customFieldStates) setup.customFieldStates = stateMap(setup.customFields, customFieldKey);
    if (!setup.syspromptSnippetStates) setup.syspromptSnippetStates = stateMap(setup.customSyspromptLibrary, snippetKey);
    if (!setup.gameSystemStates) setup.gameSystemStates = stateMap(setup.gameSystems, gameSystemKey);
    delete setup.customFields;
    delete setup.customSyspromptLibrary;
    delete setup.gameSystems;
    setup.version = 2;
}

/**
 * One-time migration from per-chat definition arrays into global catalogs.
 * The live arrays are then hydrated with every known definition while retaining
 * the current chat's enabled flags.
 */
export function migrateChatSetupCatalogs(settings) {
    if (!settings || settings.chatSetupCatalogVersion === 1) return false;

    const currentFieldStates = stateMap(settings.customFields, customFieldKey);
    const currentSnippetStates = stateMap(settings.customSyspromptLibrary, snippetKey);
    const currentGameStates = stateMap(settings.gameSystems, gameSystemKey);

    settings.trackerModuleDatabase = mergeCatalog(
        settings.trackerModuleDatabase,
        [...collectLegacySetupArrays(settings, 'customFields'), settings.customFields],
        customFieldKey,
    );
    settings.syspromptSnippetDatabase = mergeCatalog(
        settings.syspromptSnippetDatabase,
        [...collectLegacySetupArrays(settings, 'customSyspromptLibrary'), settings.customSyspromptLibrary],
        snippetKey,
    );
    settings.gameSystemDatabase = mergeCatalog(
        settings.gameSystemDatabase,
        [...collectLegacySetupArrays(settings, 'gameSystems'), settings.gameSystems],
        gameSystemKey,
    );

    for (const snapshot of Object.values(settings.chatStates || {})) upgradeLegacySetup(snapshot?.setup);

    settings.customFields = hydrateCatalog(settings.trackerModuleDatabase, currentFieldStates, customFieldKey);
    settings.customSyspromptLibrary = hydrateCatalog(settings.syspromptSnippetDatabase, currentSnippetStates, snippetKey);
    settings.gameSystems = hydrateCatalog(settings.gameSystemDatabase, currentGameStates, gameSystemKey);
    settings.chatSetupCatalogVersion = 1;
    return true;
}

/** Merge newly created or edited live definitions into their global catalogs. */
export function syncChatSetupCatalogs(settings) {
    if (!settings) return false;
    if (settings.chatSetupCatalogVersion !== 1) migrateChatSetupCatalogs(settings);
    const fieldStates = stateMap(settings.customFields, customFieldKey);
    const snippetStates = stateMap(settings.customSyspromptLibrary, snippetKey);
    const gameStates = stateMap(settings.gameSystems, gameSystemKey);
    settings.trackerModuleDatabase = mergeCatalog(settings.trackerModuleDatabase, [settings.customFields], customFieldKey, false);
    settings.syspromptSnippetDatabase = mergeCatalog(settings.syspromptSnippetDatabase, [settings.customSyspromptLibrary], snippetKey, false);
    settings.gameSystemDatabase = mergeCatalog(settings.gameSystemDatabase, [settings.gameSystems], gameSystemKey, false);
    settings.customFields = hydrateCatalog(settings.trackerModuleDatabase, fieldStates, customFieldKey);
    settings.customSyspromptLibrary = hydrateCatalog(settings.syspromptSnippetDatabase, snippetStates, snippetKey);
    settings.gameSystems = hydrateCatalog(settings.gameSystemDatabase, gameStates, gameSystemKey);
    return true;
}

/** Capture the complete chat-lockable setup from live settings. */
export function snapshotChatSetup(settings) {
    syncChatSetupCatalogs(settings);
    const setup = {
        version: 2,
        customFieldStates: stateMap(settings?.customFields, customFieldKey),
        syspromptSnippetStates: stateMap(settings?.customSyspromptLibrary, snippetKey),
        gameSystemStates: stateMap(settings?.gameSystems, gameSystemKey),
    };
    for (const key of CHAT_SETUP_KEYS) setup[key] = clone(settings?.[key]);
    return setup;
}

/**
 * Apply a saved setup. Missing fields are filled from factory defaults so old or
 * partial partitions cannot inherit stock configuration from the previous chat.
 * Catalog definitions absent from this chat remain visible but inactive.
 */
export function applyChatSetup(settings, setup) {
    if (!settings || !setup || typeof setup !== 'object') return false;
    if (settings.chatSetupCatalogVersion !== 1) migrateChatSetupCatalogs(settings);
    upgradeLegacySetup(setup);

    const defaults = buildDefaultSettings();
    for (const key of CHAT_SETUP_KEYS) {
        const value = Object.prototype.hasOwnProperty.call(setup, key) ? setup[key] : defaults[key];
        settings[key] = clone(value);
    }

    settings.customFields = hydrateCatalog(settings.trackerModuleDatabase, setup.customFieldStates, customFieldKey);
    settings.customSyspromptLibrary = hydrateCatalog(settings.syspromptSnippetDatabase, setup.syspromptSnippetStates, snippetKey);
    settings.gameSystems = hydrateCatalog(settings.gameSystemDatabase, setup.gameSystemStates, gameSystemKey);
    return true;
}

/** Reset only the Control Room / tracker setup; catalog items stay visible and inactive. */
export function resetChatSetupToStock(settings) {
    const defaults = buildDefaultSettings();
    const setup = { version: 2, customFieldStates: {}, syspromptSnippetStates: {}, gameSystemStates: {} };
    for (const key of CHAT_SETUP_KEYS) setup[key] = clone(defaults[key]);
    return applyChatSetup(settings, setup);
}

/**
 * Permanently remove definitions from the global catalogs and every chat's
 * activation map. Ordinary per-chat deactivation must not call this.
 */
export function removeChatSetupCatalogEntries(settings, {
    customFieldTags = [],
    syspromptIds = [],
    gameSystemIds = [],
} = {}) {
    if (!settings) return;
    const fieldKeys = new Set(customFieldTags.map(tag => String(tag || '').toUpperCase()).filter(Boolean));
    const snippetKeys = new Set(syspromptIds.map(id => String(id || '')).filter(Boolean));
    const systemKeys = new Set(gameSystemIds.map(id => String(id || '')).filter(Boolean));

    settings.trackerModuleDatabase = (settings.trackerModuleDatabase || []).filter(item => !fieldKeys.has(customFieldKey(item)));
    settings.syspromptSnippetDatabase = (settings.syspromptSnippetDatabase || []).filter(item => !snippetKeys.has(snippetKey(item)));
    settings.gameSystemDatabase = (settings.gameSystemDatabase || []).filter(item => !systemKeys.has(gameSystemKey(item)));
    settings.customFields = (settings.customFields || []).filter(item => !fieldKeys.has(customFieldKey(item)));
    settings.customSyspromptLibrary = (settings.customSyspromptLibrary || []).filter(item => !snippetKeys.has(snippetKey(item)));
    settings.gameSystems = (settings.gameSystems || []).filter(item => !systemKeys.has(gameSystemKey(item)));

    for (const snapshot of Object.values(settings.chatStates || {})) {
        const setup = snapshot?.setup;
        if (!setup) continue;
        upgradeLegacySetup(setup);
        for (const key of fieldKeys) delete setup.customFieldStates[key];
        for (const key of snippetKeys) delete setup.syspromptSnippetStates[key];
        for (const key of systemKeys) delete setup.gameSystemStates[key];
        if (Array.isArray(setup.blockOrder)) setup.blockOrder = setup.blockOrder.filter(tag => !fieldKeys.has(String(tag).toUpperCase()));
        if (Array.isArray(setup.syspromptSectionOrder)) {
            setup.syspromptSectionOrder = setup.syspromptSectionOrder.filter(key => !snippetKeys.has(String(key).replace(/^lib:/, '')));
        }
    }
}

/** Stable comparison used by the Chat Link conflict dialog. */
export function chatSetupsMatch(left, right) {
    return JSON.stringify(snapshotChatSetup(left)) === JSON.stringify(right || null);
}
