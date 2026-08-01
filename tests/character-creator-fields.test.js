import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const rendererSource = readFileSync(new URL('../renderer.js', import.meta.url), 'utf8');
const creatorSource = readFileSync(new URL('../character-creator.js', import.meta.url), 'utf8');

describe('Character Creator fields', () => {
    it('does not expose or inject an Orientation field', () => {
        expect(rendererSource).not.toContain('id="rt-cr-orientation"');
        expect(rendererSource).not.toContain('>Orientation</label>');
        expect(creatorSource).not.toContain('orientationVal');
        expect(creatorSource).not.toContain('Orientation:');
    });

    it('keeps the main creator boxes free of example placeholders', () => {
        const ids = [
            'rt-cr-name',
            'rt-cr-gender',
            'rt-cr-age',
            'rt-cr-species',
            'rt-cr-ethnicity',
            'rt-cr-background',
            'rt-cr-appearance',
        ];

        for (const id of ids) {
            const input = rendererSource.match(new RegExp(`<input id="${id}"[^>]*>`))?.[0];
            expect(input, `missing ${id}`).toBeTruthy();
            expect(input).not.toContain('placeholder=');
        }
    });
});
