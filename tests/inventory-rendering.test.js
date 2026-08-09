import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../portrait-storage.js', () => ({
    lookupCustomPortraitSrc: () => '',
}));

import { blockToItems } from '../renderer.js';

describe('inventory item rendering', () => {
    it('preserves commas inside bullet-delimited D&D item names', () => {
        const items = blockToItems('INVENTORY', `
Gear:
- 🪄 [Rare] [E] Runekind, Quarterstaff +2 (1d6+2 Bludgeoning, +2 to hit; arcane focus) (~4,500 GP)
- 🔪 [Uncommon] Rune-Tooth, Dagger +1 (1d4+1 Piercing, +1 to hit; finesse; thrown 20/60) (~330 GP)
`);
        const html = items.join('');

        expect(html.match(/class="rt-card-item rt-inventory-item/g)).toHaveLength(2);
        expect(html).toContain('Runekind, Quarterstaff +2');
        expect(html).toContain('Rune-Tooth, Dagger +1');
    });

    it('still supports legacy non-bulleted comma-separated inventory lines', () => {
        const items = blockToItems('INVENTORY', `
Gear:
Rope, Torch, Rations
`);
        const html = items.join('');

        expect(html.match(/class="rt-card-item rt-inventory-item/g)).toHaveLength(3);
        expect(html).toContain('Rope');
        expect(html).toContain('Torch');
        expect(html).toContain('Rations');
    });

    it('keeps category text and bullet color controls independent', () => {
        const styles = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

        expect(styles).toMatch(/\.rt-card-item::before\s*\{[^}]*color:\s*var\(--rt-cat-bullet-color,\s*var\(--rt-text-muted\)\);/s);
        expect(styles).toMatch(/\.rt-section-body\[style\*="--rt-cat-text-color"\] \.rt-inventory-item > span:not\(\.rt-coin-badge\)\s*\{[^}]*color:\s*var\(--rt-cat-text-color\)\s*!important;/s);
    });
});
