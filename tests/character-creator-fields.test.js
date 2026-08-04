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

    it('only requests an Abilities preference when the [ABILITIES] module is enabled', () => {
        expect(creatorSource).toMatch(/hasAbilities\s*\?\s*`Abilities:/);
        expect(creatorSource).not.toMatch(/^Abilities:\s/m);
    });

    it('instructs the model to defer entirely to the module instructions, never a generic D&D fallback', () => {
        expect(creatorSource).toContain('do not invent, omit, rename, or substitute fields');
        expect(creatorSource).toContain('do not fall back to a generic D&D template');
        expect(creatorSource).toContain('it is disabled — do NOT output that block or its concept');
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
