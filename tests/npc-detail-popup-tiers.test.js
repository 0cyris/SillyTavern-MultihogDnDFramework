import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const panelBuilderSource = readFileSync(new URL('../src/ui/panel/panel-builder.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../index.js', import.meta.url), 'utf8');

describe('Full NPC Card popup relationship-tier helper wiring', () => {
    it('index.js defines and passes renderRelTierDetailed into createPanel', () => {
        expect(indexSource).toContain('function renderRelTierDetailed(type, value, max)');
        expect(indexSource).toContain('renderRelTierDetailed,');
    });

    it('panel-builder.js destructures the same name it calls (no Tier/Tiers typo)', () => {
        // The destructure and both call sites must agree with index.js.
        // A prior bug renamed only the destructure to renderRelTiersDetailed,
        // which left openNpcDetailPopup throwing ReferenceError on click.
        expect(panelBuilderSource).toMatch(/^\s+renderRelTierDetailed,/m);
        expect(panelBuilderSource).not.toMatch(/renderRelTiersDetailed/);
        expect(panelBuilderSource).toContain('${renderRelTierDetailed(type, clamped, relMax)}');
        expect(panelBuilderSource).toContain('tierEl.innerHTML = renderRelTierDetailed(type, val, relMax)');
    });
});
