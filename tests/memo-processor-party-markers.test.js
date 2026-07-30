import { describe, expect, it } from 'vitest';
import { hydratePartyRelocationStats, mergeMemo } from '../memo-processor.js';

// Regression coverage for a bug where custom [PARTY] templates using inline rendering
// markers (e.g. "Name: ((BAR)) 100/100 HP") were not recognized as member header lines.
// hydratePartyRelocationStats (called at the end of every mergeMemo) would then parse
// zero members from a non-empty block and silently rewrite it as empty, deleting the
// entire party roster.

const ALICE_MARKER_ENTRY = [
    'Alice: ((BAR)) 100/100 HP',
    '📏 Size: Tier 2 (1.65m) 💪 STR: 8',
    '🚩 Long-term goal: Master the ancient frost arts',
    '🚩 Short-term goal: Find a way out of the forest with Vedra',
    '((BARYELLOW)) 🍖 Food: 100/100 - ((BARBLUE)) 💧 Water: 100/100',
    '⚔️ ATK: 15 (10-20 damage range), - 🛡️ DEF: 10 (5% reduction) 🎯 ACC: 95 - ⚡ SPD: 110',
    '((PILLBLUE)) Spells🔮 : ❄️ Ice Bolt (🌀 15, Ready), 🧊 Frost Nova (🌀 30, Ready)',
    '👕 Appearance: Wearing light mage robes that allow for easy movement and spellcasting.',
    '🧍 Pose: Walking beside Vedra through the forest.',
].join('\n');

const VEDRA_MARKER_ENTRY = [
    'Vedra: ((BAR)) 100/100 HP',
    '📏 Size: Tier 2 (1.75m) 💪 STR: 14',
    '🚩 Long-term goal: Protect her dragon at all costs',
    '🚩 Short-term goal: Find a way out of the forest with Alice',
    '((BARYELLOW)) 🍖 Food: 100/100 - ((BARBLUE)) 💧 Water: 100/100',
    '⚔️ ATK: 25 (15-35 damage range), - 🛡️ DEF: 18 (10% reduction) 🎯 ACC: 105 - ⚡ SPD: 120',
    '👕 Appearance: Wearing practical dragon-rider leathers with reinforced padding.',
    '🧍 Pose: Walking beside Alice through the forest.',
].join('\n');

describe('mergeMemo + hydratePartyRelocationStats — custom marker [PARTY] headers', () => {
    it('does not empty a [PARTY] block whose headers use ((BAR)) markers', () => {
        const priorMemo = `[CHARACTER]\n${ALICE_MARKER_ENTRY}\n[/CHARACTER]`;
        const aiOutput = `[PARTY]\n${ALICE_MARKER_ENTRY}\n${VEDRA_MARKER_ENTRY}\n[/PARTY]`;

        const merged = mergeMemo(priorMemo, aiOutput);

        expect(merged).toContain('[PARTY]');
        expect(merged).toContain('Alice: ((BAR)) 100/100 HP');
        expect(merged).toContain('Vedra: ((BAR)) 100/100 HP');
        expect(merged).not.toMatch(/\[PARTY\]\s*\[\/PARTY\]/);
    });

    it('hydratePartyRelocationStats leaves a marker-based [PARTY] block untouched rather than emptying it', () => {
        const priorMemo = `[PARTY]\n${ALICE_MARKER_ENTRY}\n${VEDRA_MARKER_ENTRY}\n[/PARTY]`;
        const mergedMemo = `[PARTY]\n${VEDRA_MARKER_ENTRY}\n[/PARTY]`;

        const result = hydratePartyRelocationStats(priorMemo, mergedMemo);

        expect(result).toContain('[PARTY]');
        expect(result).toContain('Vedra: ((BAR)) 100/100 HP');
        expect(result).not.toMatch(/\[PARTY\]\s*\[\/PARTY\]/);
    });

    it('still recognizes plain (non-marker) HP headers as before', () => {
        const priorMemo = '[PARTY]\nElara (Ranger): 26/45 HP\nStatus: Healthy\n[/PARTY]';
        const mergedMemo = '[PARTY]\nElara (Ranger): 30/45 HP\nStatus: Healthy\n[/PARTY]';

        const result = hydratePartyRelocationStats(priorMemo, mergedMemo);

        expect(result).toContain('Elara (Ranger): 30/45 HP');
    });

    it('recognizes a party member whose current HP is negative', () => {
        const priorMemo = '[PARTY]\nElara (Ranger): 2/45 HP\nStatus: Bloodied\n[/PARTY]';
        const mergedMemo = '[PARTY]\nElara (Ranger): -6/45 HP\nStatus: Dying (Death Saves 0/3)\n[/PARTY]';

        const result = hydratePartyRelocationStats(priorMemo, mergedMemo);

        expect(result).toContain('Elara (Ranger): -6/45 HP');
        expect(result).toContain('Status: Dying (Death Saves 0/3)');
        expect(result).not.toMatch(/\[PARTY\]\s*\[\/PARTY\]/);
    });
});
