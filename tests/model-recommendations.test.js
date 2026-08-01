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
    it('keeps model guidance tentative across all active recommendation surfaces', () => {
        const onboarding = readFileSync(new URL('../renderer.js', import.meta.url), 'utf8');
        const lorebookHelp = readFileSync(new URL('../index.js', import.meta.url), 'utf8');

        expect(onboarding).toContain("For the narrator, I'd recommend trying at least the following:");
        expect(onboarding).toContain('Deepseek V4 Pro and latest Flash');
        expect(onboarding).toContain('GPT-5.6 Luna, for its great cost-efficiency. Seems to be a decent model overall.');
        expect(onboarding).toContain("I've been recommending the Gemini Flash-Lite and Flash models. However, now I'm not sure at all anymore.");
        expect(onboarding).toContain('Deepseek V4 Flash 0731 recently came out and is very promising');
        expect(onboarding).toContain('the same goes for GPT-5.6 Luna');
        expect(onboarding).toContain('This way you can have a faster model, so combat is faster.');
        expect(lorebookHelp).toContain("I've been recommending Gemini Flash-Lite and Flash, but Deepseek V4 Flash 0731 and GPT-5.6 Luna are also very promising");

        for (const filename of guidanceFiles) {
            const text = readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8');
            expect(text).not.toContain('GPT-5.6 Luna is now the primary recommendation');
            expect(text).not.toContain('Gemini 3.5 Flash-Lite is probably still the best choice');
            expect(text).not.toContain('recommended tracker model Gemini 3.5 Flash-Lite');
        }

        const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
        const documentation = readFileSync(new URL('../docs/multihogDnDdoc.md', import.meta.url), 'utf8');
        for (const text of [readme, documentation]) {
            expect(text).toContain("For the narrator, I'd recommend trying at least the following:");
            expect(text).toContain('- MiMo 2.5 Pro');
            expect(text).toContain('- Deepseek V4 Pro and latest Flash');
            expect(text).toContain('- GPT-5.6 Luna, for its great cost-efficiency. Seems to be a decent model overall.');
        }
        expect(readme).toContain('the same goes for GPT-5.6 Luna');
        expect(documentation).toContain('there is no firm recommendation yet');
    });
});
