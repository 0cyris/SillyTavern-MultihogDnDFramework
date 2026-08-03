import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    replacePromptArray,
    stripSupersededChoicesFromChatPrompt,
    stripSupersededChoicesFromTextPromptMessages,
} from '../src/features/cyoa-prompt-history.js';
import { CYOA_VISUAL_CONFIG_KEYS } from '../src/state/chat-setup.js';

describe('CYOA prompt history filtering', () => {
    it('keeps T-1 through T-4 while stripping T-5 and preserving non-history examples', () => {
        const chat = [
            { role: 'system', content: 'Examples: <choices>system one</choices> and <choices>system two</choices>' },
            { role: 'assistant', content: 'T-5 scene\n<choices>T-5 choices</choices>' },
            { role: 'user', content: 'Earlier player action' },
            { role: 'assistant', content: 'T-4 scene\n<choices>T-4 choices</choices>' },
            { role: 'user', content: 'Quoted by user: <choices>leave this alone</choices>' },
            { role: 'assistant', content: 'T-3 scene\n<choices>T-3 choices</choices>' },
            { role: 'assistant', content: 'T-2 scene\n<choices>T-2 choices</choices>' },
            { role: 'assistant', content: 'T-1 scene\n<choices>T-1 choices</choices>' },
            { role: 'user', content: 'Current player action' },
        ];

        const filtered = stripSupersededChoicesFromChatPrompt(chat);

        expect(filtered[0].content).toContain('<choices>system one</choices>');
        expect(filtered[0].content).toContain('<choices>system two</choices>');
        expect(filtered[1].content).toBe('T-5 scene\n');
        expect(filtered[3].content).toContain('<choices>T-4 choices</choices>');
        expect(filtered[4].content).toContain('<choices>leave this alone</choices>');
        expect(filtered[5].content).toContain('<choices>T-3 choices</choices>');
        expect(filtered[6].content).toContain('<choices>T-2 choices</choices>');
        expect(filtered[7].content).toContain('<choices>T-1 choices</choices>');
        expect(filtered[8].content).toBe('Current player action');
        expect(chat[1].content).toContain('<choices>T-5 choices</choices>');
    });

    it('supports multimodal assistant content without touching image parts', () => {
        const imagePart = { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } };
        const chat = [
            { role: 'assistant', content: [{ type: 'text', text: '<choices>old</choices>' }, imagePart] },
            { role: 'assistant', content: [{ type: 'text', text: 'T-4 <choices>fourth</choices>' }] },
            { role: 'assistant', content: [{ type: 'text', text: 'T-3 <choices>third</choices>' }] },
            { role: 'assistant', content: [{ type: 'text', text: 'T-2 <choices>previous</choices>' }] },
            { role: 'assistant', content: [{ type: 'text', text: 'Latest <choices>new</choices>' }] },
        ];

        const filtered = stripSupersededChoicesFromChatPrompt(chat);
        expect(filtered[0].content[0].text).toBe('');
        expect(filtered[0].content[1]).toEqual(imagePart);
        expect(filtered[1].content[0].text).toContain('<choices>fourth</choices>');
        expect(filtered[2].content[0].text).toContain('<choices>third</choices>');
        expect(filtered[3].content[0].text).toContain('<choices>previous</choices>');
        expect(filtered[4].content[0].text).toContain('<choices>new</choices>');
        expect(chat[0].content[0].text).toContain('<choices>old</choices>');
    });

    it('filters the chat-only message copies used by text-completion APIs', () => {
        const messages = [
            { message: 'Assistant: T-5 scene\n<choices>old</choices>\n', extensionPrompts: ['prefix'] },
            { message: 'User: choice 1\n', extensionPrompts: [] },
            { message: 'Assistant: T-4 scene\n<choices>fourth</choices>\n', extensionPrompts: [] },
            { message: 'User: choice 2\n', extensionPrompts: [] },
            { message: 'Assistant: T-3 scene\n<choices>third</choices>\n', extensionPrompts: [] },
            { message: 'Assistant: T-2 scene\n<choices>previous</choices>\n', extensionPrompts: [] },
            { message: 'Assistant: T-1 scene\n<choices>latest</choices>\n', extensionPrompts: [] },
            { message: 'User: current action\n', extensionPrompts: [] },
        ];

        const filtered = stripSupersededChoicesFromTextPromptMessages(messages);
        expect(filtered[0].message).not.toContain('<choices>');
        expect(filtered[2].message).toContain('<choices>fourth</choices>');
        expect(filtered[4].message).toContain('<choices>third</choices>');
        expect(filtered[5].message).toContain('<choices>previous</choices>');
        expect(filtered[6].message).toContain('<choices>latest</choices>');
        expect(filtered[7].message).toBe('User: current action\n');
        expect(filtered[0].extensionPrompts).toEqual(['prefix']);
        expect(messages[0].message).toContain('<choices>old</choices>');
    });

    it('replaces disposable prompt arrays in place for SillyTavern event consumers', () => {
        const target = [{ content: 'old' }];
        const identity = target;
        expect(replacePromptArray(target, [{ content: 'new' }])).toBe(true);
        expect(target).toBe(identity);
        expect(target).toEqual([{ content: 'new' }]);
    });

    it('is enabled by default, exposed in CYOA settings, and remains a per-chat behavior setting', () => {
        const defaults = readFileSync(new URL('../src/state/defaults.js', import.meta.url), 'utf8');
        const index = readFileSync(new URL('../index.js', import.meta.url), 'utf8');

        expect(defaults).toContain('stripOldChoicesFromPrompt: true');
        expect(index).toContain('id="cyoa-strip-old-prompt"');
        expect(index).toContain('event_types.CHAT_COMPLETION_PROMPT_READY');
        expect(index).toContain('event_types.GENERATE_BEFORE_COMBINE_PROMPTS');
        expect(CYOA_VISUAL_CONFIG_KEYS).not.toContain('stripOldChoicesFromPrompt');
    });
});
