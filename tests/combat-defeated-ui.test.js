import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../portrait-storage.js', () => ({
    lookupCustomPortraitSrc: () => '',
}));

import {
    buildCombatDisplayMemo,
    partitionResolvedCombatants,
} from '../src/state/combat-persistence.js';
import { getSettings } from '../state-manager.js';
import {
    buildModulesInstructionText,
    memoForGmContext,
    memoForTrackerContext,
    mergeMemo,
} from '../memo-processor.js';
import { blockToItems } from '../renderer.js';

const ACTIVE_COMBAT = `[COMBAT]
COMBAT ROUND 1
Ghoul: 6/24 HP
Att/def: Claws
Status: Healthy
Bandit: 8/18 HP
Att/def: Shortsword
Status: Healthy
[/COMBAT]`;

describe('UI-only defeated combatants', () => {
    beforeEach(() => {
        getSettings().combatDefeatedUi = [];
    });

    it('requires an explicit resolved status rather than zero HP alone', () => {
        const result = partitionResolvedCombatants(`COMBAT ROUND 2
Ghoul: 0/24 HP
Att/def: Claws
Status: Dying (Death Saves 1/3)
Bandit: 0/18 HP
Att/def: Shortsword
Status: Defeated`);

        expect(result.activeContent).toContain('Ghoul: 0/24 HP');
        expect(result.activeContent).toContain('Death Saves 1/3');
        expect(result.activeContent).not.toContain('Bandit:');
        expect(result.defeatedCombatants).toEqual([{
            name: 'Bandit',
            content: 'Bandit: 0/18 HP\nAtt/def: Shortsword\nStatus: Defeated',
        }]);

        const inline = partitionResolvedCombatants('Wight: 0/45 HP | Status: ((DEBUFF)) Dead');
        expect(inline.activeContent).toBe('');
        expect(inline.defeatedCombatants[0].name).toBe('Wight');
    });

    it('archives and renders explicitly defeated combatants with negative HP', () => {
        const content = `COMBAT ROUND 5
Novice Assassin C: -4/15 HP
Att/def: Shortsword (1 attack, +4 / 1d6+2 Piercing) | Leather Armor (AC: 14)
Saves: Fort +1, Ref +5, Will +0
Abilities: Sneak Attack (+1d6), Nimble Escape
Status: Defeated
Shadowblade Mentor: 45/45 HP
Status: Healthy`;

        const partitioned = partitionResolvedCombatants(content);
        expect(partitioned.activeContent).not.toContain('Novice Assassin C');
        expect(partitioned.activeContent).toContain('Shadowblade Mentor: 45/45 HP');
        expect(partitioned.defeatedCombatants).toEqual([{
            name: 'Novice Assassin C',
            content: `Novice Assassin C: -4/15 HP
Att/def: Shortsword (1 attack, +4 / 1d6+2 Piercing) | Leather Armor (AC: 14)
Saves: Fort +1, Ref +5, Will +0
Abilities: Sneak Attack (+1d6), Nimble Escape
Status: Defeated`,
        }]);

        const html = blockToItems('COMBAT', content).join('');
        expect(html).toContain('data-defeated-combatant="Novice Assassin C"');
        expect(html).toContain('<span class="rt-hp-label">-4/15</span>');
        expect(html).toContain('width:0.0%');
    });

    it('strips resolved enemies from model state while retaining them in the display memo', () => {
        const merged = mergeMemo(ACTIVE_COMBAT, `[COMBAT]
COMBAT ROUND 2
Ghoul: 0/24 HP
Att/def: Claws
Status: Dying (Death Saves 1/3)
Bandit: 0/18 HP
Att/def: Shortsword
Status: Dead
[/COMBAT]`);

        expect(merged).toContain('Ghoul: 0/24 HP');
        expect(merged).not.toContain('Bandit:');
        expect(memoForGmContext(merged)).not.toContain('Bandit');

        const displayMemo = buildCombatDisplayMemo(merged, getSettings().combatDefeatedUi);
        expect(displayMemo).toContain('Ghoul: 0/24 HP');
        expect(displayMemo).toContain('Bandit: 0/18 HP');
        expect(displayMemo).toContain('Status: Dead');
    });

    it('filters resolved entries from outgoing contexts even in legacy or manually edited memos', () => {
        const legacyMemo = `[COMBAT]
COMBAT ROUND 7
Ghoul: 0/24 HP
Status: Dying (Death Saves 1/3)
Bandit: 0/18 HP
Status: Dead
[/COMBAT]`;

        for (const outgoing of [
            memoForTrackerContext(legacyMemo),
            memoForGmContext(legacyMemo),
        ]) {
            expect(outgoing).toContain('Ghoul: 0/24 HP');
            expect(outgoing).toContain('Death Saves 1/3');
            expect(outgoing).not.toContain('Bandit:');
            expect(outgoing).not.toContain('Status: Dead');
        }
    });

    it('enforces explicit resolution semantics without overwriting custom combat prompts', () => {
        const customCombatPrompt = 'Render combat in a cyberpunk style.';
        const settings = {
            stockPrompts: { combat: customCombatPrompt },
            modules: { combat: true },
            syspromptModules: {},
            customFields: [],
            initialDate: '',
            currentMemo: '',
        };

        const instructions = buildModulesInstructionText(settings);
        expect(settings.stockPrompts.combat).toBe(customCombatPrompt);
        expect(instructions).toContain(customCombatPrompt);
        expect(instructions).toContain('DEFEATED COMBATANTS: Mark defeated enemies as Status: Defeated. Do not omit them from the memo.');
    });

    it('keeps the UI archive across rounds, removes revived names, and clears it at END_COMBAT', () => {
        mergeMemo(ACTIVE_COMBAT, `[COMBAT]
COMBAT ROUND 2
Bandit: 0/18 HP
Status: Defeated
[/COMBAT]`);
        expect(getSettings().combatDefeatedUi.map(entry => entry.name)).toEqual(['Bandit']);

        const revived = mergeMemo('[COMBAT]\nCOMBAT ROUND 2\n[/COMBAT]', `[COMBAT]
COMBAT ROUND 3
Bandit: 5/18 HP
Status: Prone
[/COMBAT]`);
        expect(revived).toContain('Bandit: 5/18 HP');
        expect(getSettings().combatDefeatedUi).toEqual([]);

        getSettings().combatDefeatedUi = [{ name: 'Bandit', content: 'Bandit: 0/18 HP\nStatus: Defeated' }];
        const ended = mergeMemo(revived, '[COMBAT]END_COMBAT[/COMBAT]');
        expect(ended).not.toContain('[COMBAT]');
        expect(getSettings().combatDefeatedUi).toEqual([]);
    });

    it('marks only explicitly resolved UI entries as defeated', () => {
        const html = blockToItems('COMBAT', `COMBAT ROUND 2
Ghoul: 0/24 HP
Status: Dying (Death Saves 1/3)
Bandit: 0/18 HP
Status: Defeated`).join('');

        expect(html).toContain('Ghoul');
        expect(html).toContain('Death Saves 1/3');
        expect(html).toContain('data-defeated-combatant="Bandit"');
        expect(html.match(/rt-combatant-defeated/g)).toHaveLength(1);
    });
});
