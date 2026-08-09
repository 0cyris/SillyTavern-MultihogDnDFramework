import { describe, expect, it, afterEach } from 'vitest';
import { sendStateRequest } from '../llm-client.js';

const originalGetContext = globalThis.SillyTavern.getContext;

afterEach(() => {
    globalThis.SillyTavern.getContext = originalGetContext;
});

describe('sendStateRequest default (generateRaw) mode disables trimNames', () => {
    it('passes trimNames: false to generateRaw so ST never silently deletes a structured response', async () => {
        let capturedOptions = null;
        globalThis.SillyTavern.getContext = () => ({
            ...originalGetContext(),
            generateRaw: async (opts) => {
                capturedOptions = opts;
                // Simulate a character-sheet response that happens to start with the
                // persona's own name followed by a colon — exactly the shape ST's
                // cleanUpMessage(trimWrongNames: true) would otherwise wipe entirely.
                return 'Hyperion Blackwood: a grim mercenary...';
            },
        });

        const result = await sendStateRequest(
            { connectionSource: 'default' },
            'system prompt',
            'user prompt',
        );

        expect(capturedOptions).toBeTruthy();
        expect(capturedOptions.trimNames).toBe(false);
        expect(result).toBe('Hyperion Blackwood: a grim mercenary...');
    });
});
