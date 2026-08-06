import { describe, expect, it } from 'vitest';
import { getCardAppearanceSynopsis } from '../src/ui/panel/card-synopsis.js';

describe('getCardAppearanceSynopsis', () => {
    it('joins Species + Body when Body content is on the following line', () => {
        const bio = [
            'Species: Human female.',
            'Body:',
            'Ianthe possesses a lithe, athletic build with pale skin and sharp emerald eyes.',
            'Equipment:',
            'Silver plate armor.',
            'Personality: Stoic.',
        ].join('\n');
        const desc = getCardAppearanceSynopsis(bio);
        expect(desc).toContain('Human female.');
        expect(desc).toContain('lithe, athletic build');
        expect(desc).not.toContain('Silver plate');
        expect(desc).not.toContain('Stoic');
    });

    it('joins Species + Body for NPC [CORE] blocks', () => {
        const bio = `[CORE]
Species: Fey / Wood Nymph
Body: Lithe and ethereal frame with long pink hair.
Equipment: Leaf-woven dress.
Personality: Kind.
[/CORE]`;
        expect(getCardAppearanceSynopsis(bio)).toBe('Fey / Wood Nymph — Lithe and ethereal frame with long pink hair.');
    });

    it('falls back to legacy Appearance/Species without matching Species inside it', () => {
        const bio = 'Appearance/Species: Tall human with a scar.\nPersonality: Stoic.\n';
        expect(getCardAppearanceSynopsis(bio)).toBe('Tall human with a scar.');
    });
});
