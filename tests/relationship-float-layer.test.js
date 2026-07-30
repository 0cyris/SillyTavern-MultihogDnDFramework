import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/state/relationship-dom.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

function cssRule(selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return styles.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`))?.[1] || '';
}

describe('relationship float feedback overflow', () => {
    it('portals the transient layer to the body and aligns it with the tracker', () => {
        expect(source).toContain('document.body.appendChild(layer)');
        expect(source).toContain('host.getBoundingClientRect()');
        expect(source).toContain("layer.style.left = `${rect.left}px`");
        expect(source).toContain("layer.style.width = `${rect.width}px`");
    });

    it('allows the layer and long NPC names to extend beyond the tracker edge', () => {
        const layerRule = cssRule('.rt-rel-float-layer');
        const floatRule = cssRule('.rt-rel-float');
        const npcRule = cssRule('.rt-rel-float-npc');

        expect(layerRule).toContain('position: fixed');
        expect(layerRule).toContain('overflow: visible');
        expect(floatRule).toContain('max-width: none');
        expect(npcRule).toContain('overflow: visible');
        expect(npcRule).not.toContain('text-overflow: ellipsis');
    });
});
