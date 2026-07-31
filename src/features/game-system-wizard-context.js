export const DEFAULT_GAME_SYSTEM_WIZARD_LOOKBACK = 10;
export const MAX_GAME_SYSTEM_WIZARD_LOOKBACK = 200;

/** @param {any} settings */
export function normalizeGameSystemWizardContextPrefs(settings) {
    let lookback = parseInt(String(settings?.gameSystemWizardLookback ?? DEFAULT_GAME_SYSTEM_WIZARD_LOOKBACK), 10);
    if (!Number.isFinite(lookback) || lookback < 0) lookback = DEFAULT_GAME_SYSTEM_WIZARD_LOOKBACK;
    return {
        lookback: Math.min(MAX_GAME_SYSTEM_WIZARD_LOOKBACK, lookback),
        lookbackAll: !!settings?.gameSystemWizardLookbackAll,
        injectLore: !!settings?.gameSystemWizardInjectLore,
        injectMemo: !!settings?.gameSystemWizardInjectMemo,
    };
}

/**
 * Builds optional story context from ordinary user/assistant chat messages.
 * @param {any[]} chat
 * @param {any} settings
 */
export function buildGameSystemWizardStoryContext(chat, settings) {
    const { lookback, lookbackAll } = normalizeGameSystemWizardContextPrefs(settings);
    if (!lookbackAll && lookback === 0) return '';

    const eligible = (Array.isArray(chat) ? chat : []).filter(message =>
        !message?.is_system && typeof message?.mes === 'string' && message.mes.trim(),
    );
    const selected = lookbackAll ? eligible : eligible.slice(-lookback);
    if (!selected.length) return '';

    return selected.map(message => {
        const role = message.is_user ? 'USER' : 'ASSISTANT';
        const name = String(message.name || '').trim();
        return `${role}${name ? ` (${name})` : ''}:\n${message.mes.trim()}`;
    }).join('\n\n');
}

/**
 * Loads the entries currently active through Lorebook Agent state.
 * @param {any} settings
 * @param {any} ctx
 */
export async function buildGameSystemWizardLoreContext(settings, ctx) {
    if (!settings?.gameSystemWizardInjectLore || typeof ctx?.loadWorldInfo !== 'function') return '';
    const ids = [...new Set([
        ...(settings.activeRouterKeys || []),
        ...(settings.keywordActivatedKeys || []),
        ...(settings.activeWorldKeys || []),
    ])];
    if (!ids.length) return '';

    const books = {};
    const blocks = [];
    for (const id of ids) {
        const [bookName, uid] = String(id).split('::');
        if (!bookName || !uid) continue;
        if (!(bookName in books)) {
            try {
                books[bookName] = await ctx.loadWorldInfo(bookName);
            } catch {
                books[bookName] = null;
            }
        }
        const entry = books[bookName]?.entries?.[uid];
        if (!entry?.content) continue;
        const title = String(entry.comment || uid).replace(/^\[.*?\]\s*/i, '').trim();
        blocks.push(`### ${title}\n${String(entry.content).trim()}`);
    }
    return blocks.join('\n\n');
}
