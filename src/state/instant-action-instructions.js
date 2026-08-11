export const MAX_INSTANT_ACTION_INSTRUCTION_LENGTH = 1000;

/** Normalize one-time Instant Action guidance without persisting it into later turns. */
export function normalizeInstantActionInstructions(value) {
    return String(value || '').trim().slice(0, MAX_INSTANT_ACTION_INSTRUCTION_LENGTH);
}

/** Prompt section shared with Instant Action character generation. */
export function buildInstantActionPromptSection(value) {
    const instructions = normalizeInstantActionInstructions(value);
    if (!instructions) return '';
    return `

--- INSTANT ACTION INSTRUCTIONS (HIGHEST PRIORITY) ---
${instructions}
Follow these instructions for the character, starting setting, premise, tone, or any other requested details. Where they conflict with randomly rolled defaults, these instructions win. Preserve all required output formatting.`;
}

/** Opening user message that grounds the narrator in the same one-time guidance. */
export function buildInstantActionOpeningMessage(value) {
    const instructions = normalizeInstantActionInstructions(value);
    if (!instructions) return 'Begin the adventure';
    return `Begin the adventure.\n\nInstant Action instructions:\n${instructions}`;
}
