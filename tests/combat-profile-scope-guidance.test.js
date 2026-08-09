import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const routerSource = readFileSync(new URL('../router.js', import.meta.url), 'utf8');

describe('Combat Profile router guidance scopes to a single combatant', () => {
    it('explicitly forbids copying the COMBAT ROUND header, side headers, or other combatants into a Combat Profile', () => {
        expect(routerSource).toContain('CRITICAL — ONE COMBATANT PER PROFILE');
        expect(routerSource).toContain('NEVER copy the "COMBAT ROUND N" header, the ENEMIES:/NON-PARTY ALLIES: section headers, or any *other* combatant\'s block into it');
    });

    it('applies the same scope rule to both the agent (tool-call) and basic (text-format) guidance variants', () => {
        // buildCombatProfileRouterGuidance interpolates one shared scopeRule into both branches —
        // this locks in that both rendered variants actually contain it.
        const occurrences = routerSource.match(/CRITICAL — ONE COMBATANT PER PROFILE/g) || [];
        expect(occurrences.length).toBeGreaterThanOrEqual(1);
        expect(routerSource).toContain('const scopeRule = `- CRITICAL — ONE COMBATANT PER PROFILE');
        expect(routerSource).toMatch(/\$\{scopeRule\}[\s\S]*?Example \(updating only "Schwarzenegev"/);
        expect(routerSource).toMatch(/\$\{scopeRule\}[\s\S]*?Example: \\`\[\[UPDATE_CORE: Marcus Thorne/);
    });

    it('replaces the old malformed comma-flattened example with one matching the real per-entity [COMBAT] stat block shape', () => {
        expect(routerSource).not.toContain('HP: 12, AC: 11, Fort +1, Ref +0, Will +4, weapons: ...');
        expect(routerSource).toContain('Marcus Thorne: 12/12 HP');
        expect(routerSource).toContain('Att/def: Longsword (1 attack, +5 / 1d8+2 Slashing) | Chainmail (AC: 15)');
    });
});
