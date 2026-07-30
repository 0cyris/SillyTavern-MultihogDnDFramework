/** Name-only identity used by SillyTavern's sender header. */
export function buildNameOnlyPersonaIdentity(name) {
    return {
        name: String(name || '').replace(/['"\\]/g, '').trim() || 'My Character',
        description: '',
    };
}

/** Preserve a source Persona description only for Persona-derived onboarding. */
export function resolveActivatedPersonaDescription(existingDescription, preserveExistingDescription = false) {
    return preserveExistingDescription ? String(existingDescription || '') : '';
}
