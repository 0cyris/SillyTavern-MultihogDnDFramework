import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../portrait-storage.js', () => ({
    lookupCustomPortraitSrc: () => '',
}));

import { renderCustomBlockLine } from '../renderer.js';

describe('custom module plain-text rendering', () => {
    it('softens only unlabelled fallback lines while retaining key/value rows', () => {
        const html = [
            renderCustomBlockLine('TIME', 'Last Rest: N/A'),
            renderCustomBlockLine('TIME', 'Current Time: 2:39 PM, Day 1'),
            renderCustomBlockLine('TIME', 'asd'),
        ].join('');

        expect(html.match(/class="rt-card-kv"/g)).toHaveLength(2);
        expect(html).toContain('<div class="rt-card-item rt-card-item--plain">asd</div>');
    });

    it('uses quieter typography for plain fallback rows and their bullets', () => {
        const styles = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

        expect(styles).toMatch(/\.rt-card-item--plain\s*\{[^}]*color:\s*var\(--rt-cat-text-color,\s*var\(--rt-text-muted\)\);[^}]*font-size:\s*0\.92em;/s);
        expect(styles).toMatch(/\.rt-card-item--plain::before\s*\{[^}]*font-family:\s*inherit;[^}]*font-weight:\s*400;/s);
    });
});
