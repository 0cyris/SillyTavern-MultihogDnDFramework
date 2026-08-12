export const MAX_INSTANT_ACTION_INSTRUCTION_LENGTH = 1000;
export const DEFAULT_INSTANT_ACTION_PLAYER_CARD_WORDS = 150;

/** Normalize one-time Instant Action guidance without persisting it into later turns. */
export function normalizeInstantActionInstructions(value) {
    return String(value || '').trim().slice(0, MAX_INSTANT_ACTION_INSTRUCTION_LENGTH);
}

/** Resolve the Instant Action Player Card length, including the custom option. */
export function resolveInstantActionPlayerCardWords(selection, customValue) {
    const rawValue = selection === 'other' ? customValue : selection;
    const parsed = Number.parseInt(String(rawValue || ''), 10);
    if (!Number.isFinite(parsed)) return DEFAULT_INSTANT_ACTION_PLAYER_CARD_WORDS;
    return Math.max(50, Math.min(5000, parsed));
}

/** Prompt section shared with Instant Action character generation. */
export function buildInstantActionPromptSection(value) {
    const instructions = normalizeInstantActionInstructions(value);
    if (!instructions) return '';
    return `

--- INITIAL SETUP: ---
${instructions}
Follow these instructions for the character, starting setting, premise, tone, or any other requested details. Where they conflict with randomly rolled defaults, these instructions win. Preserve all required output formatting.`;
}

/** Opening user message that grounds the narrator in the same one-time guidance. */
export function buildInstantActionOpeningMessage(value) {
    const instructions = normalizeInstantActionInstructions(value);
    if (!instructions) return 'Begin the adventure';
    return `Begin the adventure.\n\nInitial Setup:\n${instructions}`;
}
