import { describe, expect, it, vi } from 'vitest';
import {
    buildGameSystemWizardLoreContext,
    buildGameSystemWizardStoryContext,
    normalizeGameSystemWizardContextPrefs,
} from '../src/features/game-system-wizard-context.js';

const chat = [
    { is_user: true, name: 'Player', mes: 'We discovered a cursed winter.' },
    { is_user: false, name: 'GM', mes: 'The cold worsens every hour.' },
    { is_system: true, mes: 'Hidden system message' },
    { is_user: true, name: 'Player', mes: 'I light a fire.' },
];

describe('Game System Wizard context controls', () => {
    it('includes only the requested number of ordinary chat messages', () => {
        const context = buildGameSystemWizardStoryContext(chat, {
            gameSystemWizardLookback: 2,
            gameSystemWizardLookbackAll: false,
        });

        expect(context).not.toContain('cursed winter');
        expect(context).toContain('The cold worsens every hour.');
        expect(context).toContain('I light a fire.');
        expect(context).not.toContain('Hidden system message');
    });

    it('supports entire-chat lookback and a zero-message opt-out', () => {
        expect(buildGameSystemWizardStoryContext(chat, {
            gameSystemWizardLookback: 0,
            gameSystemWizardLookbackAll: false,
        })).toBe('');
        expect(buildGameSystemWizardStoryContext(chat, {
            gameSystemWizardLookback: 0,
            gameSystemWizardLookbackAll: true,
        })).toContain('We discovered a cursed winter.');
    });

    it('loads only active Lorebook Agent entries when lore injection is enabled', async () => {
        const loadWorldInfo = vi.fn(async () => ({
            entries: {
                7: { comment: '[Active] Frost Court', content: 'Winter spirits rule the valley.' },
            },
        }));
        const context = await buildGameSystemWizardLoreContext({
            gameSystemWizardInjectLore: true,
            activeRouterKeys: ['Campaign_NPCs::7'],
        }, { loadWorldInfo });

        expect(context).toContain('### Frost Court');
        expect(context).toContain('Winter spirits rule the valley.');
        expect(loadWorldInfo).toHaveBeenCalledWith('Campaign_NPCs');
        expect(await buildGameSystemWizardLoreContext({
            gameSystemWizardInjectLore: false,
            activeRouterKeys: ['Campaign_NPCs::7'],
        }, { loadWorldInfo })).toBe('');
    });

    it('normalizes all four persisted context preferences', () => {
        expect(normalizeGameSystemWizardContextPrefs({
            gameSystemWizardLookback: 999,
            gameSystemWizardLookbackAll: true,
            gameSystemWizardInjectLore: true,
            gameSystemWizardInjectMemo: true,
        })).toEqual({
            lookback: 200,
            lookbackAll: true,
            injectLore: true,
            injectMemo: true,
        });
    });
});
