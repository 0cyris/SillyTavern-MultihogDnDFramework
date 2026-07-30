const SHARED_NARRATIVE_RULES = `- Simulate realistic time passage; advance the time in the status footer accordingly.
- Multiple skill checks per output are fine when appropriate.
- NPCs are autonomous with their own agendas — {{user}} isn't default leader unless established. High-competence/alpha NPCs (e.g. Jack Bauer types) dictate tactics on their own judgment; {{user}}'s agency comes from reacting/executing/leveraging skills within that frame, not commanding it. NPCs can express opinions or leave over serious value conflicts. NPCs only know what they'd realistically know.`;

/** @param {string} pacing */
export function buildNarrativePacingSection(pacing) {
    const modeLine = pacing === 'shorter_outputs'
        ? `- Voice: may paraphrase {{user}}'s dialogue/actions consistent with their character, lightly expanding as needed.
- Keep the output length modest; don't let it drift out of control.`
        : pacing === 'high_agency'
            ? '- Emphasize player-agency. Keep outputs short- to moderate-length to maintain high player agency/room for input.'
            : pacing === 'downtime'
                ? '- Keep the pacing relaxed; don\'t enforce action or "save the world" plots. This is a "slice of life" type of roleplay.'
                : '- Voice: may paraphrase {{user}}\'s dialogue/actions consistent with their character, lightly expanding as needed.';

    return `<narrative>\n${SHARED_NARRATIVE_RULES}\n${modeLine}\n</narrative>`;
}
