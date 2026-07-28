/** Name-only identity used by SillyTavern's sender header. */
export function buildNameOnlyPersonaIdentity(name) {
    return {
        name: String(name || '').replace(/['"\\]/g, '').trim() || 'My Character',
        description: '',
    };
}
