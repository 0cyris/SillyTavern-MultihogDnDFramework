import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const guidanceFiles = [
    'README.md',
    'docs/multihogDnDdoc.md',
    'index.js',
    'renderer.js',
    'adventure-companion.js',
];

describe('model recommendation guidance', () => {
    it('recommends Gemini 3.5 Flash-Lite while keeping alternatives tentative', () => {
        const onboarding = readFileSync(new URL('../renderer.js', import.meta.url), 'utf8');
        const lorebookHelp = readFileSync(new URL('../index.js', import.meta.url), 'utf8');

        expect(onboarding).toContain('Gemini 3.5 Flash-Lite is probably still the best choice.');
        expect(onboarding).toContain('Deepseek V4 Flash 0731 is probably also worth a try');
        expect(onboarding).toContain('GPT-5.6 Luna, but from my experience it\'s not quite as reliable with instruction/formatting following.');
        expect(onboarding).toContain('Faster models such as Gemini 3.5 Flash, Deepseek Flash, etc, are great for this.');
        expect(lorebookHelp).toContain('Gemini 3.5 Flash-Lite is probably still the best choice');

        for (const filename of guidanceFiles) {
            const text = readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8');
            expect(text).not.toContain('GPT-5.6 Luna is now the primary recommendation');
        }

        expect(readFileSync(new URL('../README.md', import.meta.url), 'utf8')).toContain('Gemini 3.5 Flash-Lite is probably still the best choice.');
        expect(readFileSync(new URL('../docs/multihogDnDdoc.md', import.meta.url), 'utf8')).toContain('Gemini 3.5 Flash-Lite is probably still the best choice.');
    });
});
