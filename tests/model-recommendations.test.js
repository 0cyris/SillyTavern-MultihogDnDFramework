import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const guidanceFiles = [
    'README.md',
    'docs/multihogDnDdoc.md',
    'index.js',
    'renderer.js',
    'adventure-companion.js',
    'CHANGELOG.md',
];

describe('model recommendation guidance', () => {
    it('recommends GPT-5.6 Luna and removes superseded Gemini model names', () => {
        const oldNames = [
            ['Gemini', ' 3.5 Flash', '-Lite'].join(''),
            ['Gemini', ' 3.6 Flash'].join(''),
            ['Gemini', ' 3.5 Flash'].join(''),
            ['Gemini', ' 3.1 Flash', '-Lite'].join(''),
            ['Gemini', ' 3 Flash'].join(''),
        ];

        for (const filename of guidanceFiles) {
            const text = readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8');
            for (const oldName of oldNames) expect(text).not.toContain(oldName);
        }

        expect(readFileSync(new URL('../README.md', import.meta.url), 'utf8')).toContain('GPT-5.6 Luna');
        expect(readFileSync(new URL('../docs/multihogDnDdoc.md', import.meta.url), 'utf8')).toContain('GPT-5.6 Luna');
    });
});
