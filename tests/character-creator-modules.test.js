import { describe, expect, it } from 'vitest';
import {
    buildOnboardingActiveBlocks,
    buildOnboardingCustomModuleInstructions,
} from '../constants.js';

describe('Character Creator custom tracker modules', () => {
    const settings = {
        modules: {},
        customFields: [
            {
                tag: 'REPUTATION',
                label: 'Reputation',
                enabled: true,
                prompt: 'Track standing with each faction.',
                template: 'Faction: Name | Standing: 0/100',
            },
            {
                tag: 'INACTIVE_RULE',
                label: 'Inactive Rule',
                enabled: false,
                prompt: 'This must remain invisible.',
                template: 'Never include this.',
            },
        ],
    };

    it('includes enabled custom module tags in the requested character blocks', () => {
        expect(buildOnboardingActiveBlocks(settings)).toContain('REPUTATION');
        expect(buildOnboardingActiveBlocks(settings)).not.toContain('INACTIVE_RULE');
    });

    it('never requests an active combat block during character creation', () => {
        expect(buildOnboardingActiveBlocks({
            modules: { combat: true },
            customFields: [{ tag: 'COMBAT', enabled: true }],
        })).not.toContain('COMBAT');
    });

    it('includes CHARACTER only when the CHARACTER module is enabled', () => {
        expect(buildOnboardingActiveBlocks({ modules: { character: true } })).toContain('CHARACTER');
        expect(buildOnboardingActiveBlocks({ modules: {} })).not.toContain('CHARACTER');
        expect(buildOnboardingActiveBlocks({ modules: { character: false, inventory: true } })).toEqual(['INVENTORY']);
    });

    it('injects enabled custom module prompts and templates', () => {
        const text = buildOnboardingCustomModuleInstructions(settings);

        expect(text).toContain('[REPUTATION] — Reputation');
        expect(text).toContain('Track standing with each faction.');
        expect(text).toContain('Faction: Name | Standing: 0/100');
        expect(text).not.toContain('INACTIVE_RULE');
        expect(text).not.toContain('This must remain invisible.');
    });

    it('returns no extra prompt section when no custom modules are enabled', () => {
        expect(buildOnboardingCustomModuleInstructions({
            customFields: settings.customFields.map(field => ({ ...field, enabled: false })),
        })).toBe('');
    });
});
