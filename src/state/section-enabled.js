/** Whether a built-in (non-unlocked) base section is currently enabled. */
export function isBaseSectionEnabled(tag, settings) {
    if (tag === 'relationship_tracking') return !!settings.npcRelationshipBars;
    const mods = settings.syspromptModules || {};
    if (tag === 'CYOA_mode') return mods.CYOA_mode === true;
    return mods[tag] !== false;
}

/** Whether the section that actually occupies a base slot is currently enabled. */
export function isEffectiveSectionEnabled(tag, settings) {
    const override = (settings.customSyspromptLibrary || [])
        .find(p => p.origin === 'unlocked_base' && p.baseTag === tag);
    return override ? !!override.enabled : isBaseSectionEnabled(tag, settings);
}
