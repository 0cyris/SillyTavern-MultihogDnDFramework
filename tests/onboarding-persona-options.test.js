import { beforeEach, describe, expect, it, vi } from 'vitest';
import { testExtensionSettings } from './setup.js';

vi.mock('../portrait-storage.js', () => ({
    lookupCustomPortraitSrc: () => '',
}));

import { renderMemoAsCards } from '../renderer.js';

describe('onboarding Player Card and ST persona options', () => {
    beforeEach(() => {
        for (const key of Object.keys(testExtensionSettings)) delete testExtensionSettings[key];
    });

    it('renders separate controls in Other Ways to Begin and Character Creator', () => {
        const html = renderMemoAsCards('', null, {});

        expect(html).toContain('id="rt-onboarding-player-card-cb"');
        expect(html).toContain('id="rt-onboarding-st-persona-cb" checked');
        expect(html).toContain('id="rt-cr-player-card-cb"');
        expect(html).toContain('id="rt-cr-st-persona-cb" checked');
        expect(html.match(/Create Player Card in Lorebook Agent \(Recommended\)/g)).toHaveLength(2);
        expect(html.match(/Create ST Persona \(Recommended\)/g)).toHaveLength(2);
        expect(html).toContain('same player name');
        expect(html).not.toContain('Create Persona (Recommended)');
    });
});
