import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    buildInstantActionOpeningMessage,
    buildInstantActionPromptSection,
    MAX_INSTANT_ACTION_INSTRUCTION_LENGTH,
    normalizeInstantActionInstructions,
} from '../src/state/instant-action-instructions.js';

const quickStartSource = readFileSync(new URL('../quickstart.js', import.meta.url), 'utf8');
const creatorSource = readFileSync(new URL('../character-creator.js', import.meta.url), 'utf8');
const rendererSource = readFileSync(new URL('../renderer.js', import.meta.url), 'utf8');

describe('Instant Action instructions', () => {
    it('preserves the original opening message when the optional box is empty', () => {
        expect(buildInstantActionOpeningMessage('   ')).toBe('Begin the adventure');
    });

    it('sends the same guidance with the opening adventure message', () => {
        expect(buildInstantActionOpeningMessage('A storm-battered frontier town')).toBe(
            'Begin the adventure.\n\nInitial Setup:\nA storm-battered frontier town',
        );
    });

    it('marks guidance as higher priority than randomized character defaults', () => {
        const section = buildInstantActionPromptSection('A 28-year-old female ranger with a crossbow');
        expect(section).toContain('INITIAL SETUP:');
        expect(section).toContain('A 28-year-old female ranger with a crossbow');
        expect(section).toContain('these instructions win');
    });

    it('trims and bounds one-time guidance', () => {
        const oversized = `  ${'x'.repeat(MAX_INSTANT_ACTION_INSTRUCTION_LENGTH + 50)}  `;
        expect(normalizeInstantActionInstructions(oversized)).toHaveLength(MAX_INSTANT_ACTION_INSTRUCTION_LENGTH);
    });

    it('wires the optional box into both character generation and the narrator opening', () => {
        expect(rendererSource).toContain('id="rt-quickstart-instructions"');
        expect(quickStartSource).toMatch(/instructionsInput\?\.value \|\| ''/);
        expect(quickStartSource).toMatch(/generateQuickStartCharacter\(\{[\s\S]*?instantActionInstructions,/);
        expect(quickStartSource).toContain('buildInstantActionOpeningMessage(instantActionInstructions)');
        expect(creatorSource).toContain('instantActionInstructions: opts.instantActionInstructions');
        expect(creatorSource).toContain('If the Initial Setup specifies');
    });
});
