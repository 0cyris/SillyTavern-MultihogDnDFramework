import { describe, expect, it } from 'vitest';
import {
    buildDirectPromptSystemPrompt,
    DIRECT_PROMPT_SYSTEM_MODES,
} from '../src/state/direct-prompt-system.js';

describe('direct prompt system modes', () => {
    const settings = {
        systemPromptTemplate: 'You are the State Extractor Model.\n<modules>{{modulesText}}</modules>\n<rules>diff rules</rules>',
    };
    const modulesText = '### CORE MODULES\n- [CHARACTER]: Character schema\n- [INVENTORY]: Inventory schema';

    it('uses only module instructions for character creation', () => {
        const prompt = buildDirectPromptSystemPrompt(
            settings,
            modulesText,
            DIRECT_PROMPT_SYSTEM_MODES.MODULES_ONLY,
        );

        expect(prompt).toBe(modulesText);
        expect(prompt).not.toContain('State Extractor');
        expect(prompt).not.toContain('diff rules');
    });

    it('preserves the full extractor prompt for ordinary direct tracker commands', () => {
        const prompt = buildDirectPromptSystemPrompt(
            settings,
            modulesText,
            DIRECT_PROMPT_SYSTEM_MODES.STATE_EXTRACTOR,
        );

        expect(prompt).toContain('You are the State Extractor Model.');
        expect(prompt).toContain(modulesText);
        expect(prompt).toContain('diff rules');
    });
});
