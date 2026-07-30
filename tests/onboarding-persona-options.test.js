import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
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

    it('requires a rolled name for the Other Ways Custom path', () => {
        const html = renderMemoAsCards('', null, {});

        expect(html).toContain('id="rt-onboarding-rolled-name" placeholder="Roll or enter a name"');
        expect(html).toContain('id="rt-onboarding-roll-name"');
        expect(html).toMatch(/data-archetype="custom" data-name-required="true" disabled/);
        expect(html).toMatch(/data-archetype="persona">/);
        expect(html).toMatch(/data-archetype="pc_import">/);
    });

    it('preserves the active Persona when deriving a character from it', () => {
        const cardEventsSource = readFileSync(new URL('../src/ui/panel/card-events.js', import.meta.url), 'utf8');
        const indexSource = readFileSync(new URL('../index.js', import.meta.url), 'utf8');

        expect(cardEventsSource).toContain("const requiresRolledName = archetype !== 'persona';");
        expect(cardEventsSource).toContain('preferredName: personaName');
        expect(indexSource).toContain(
            'preserveExistingDescription: !!options.preserveActivePersona',
        );
        expect(indexSource).toContain(
            "const charName = preferredName || extractCharNameFromMemo(s.currentMemo) || 'My Character';",
        );
    });

    it('includes the Discord Extensions subforum in the onboarding help', () => {
        const html = renderMemoAsCards('', null, {});

        expect(html).toContain('Or head to the Discord, under the Extensions subforum:');
        expect(html).toContain('href="https://discord.gg/sillytavern"');
        expect(html).toContain('Hell, head there anyway!');
    });

    it('links the startup welcome note to the GitHub releases page', () => {
        const html = renderMemoAsCards('', null, {});

        expect(html).toContain('Welcome to Multihog D&D Framework!');
        expect(html).toContain('href="https://github.com/MultihogAurelius/SillyTavern-MultihogDnDFramework/releases"');
        expect(html).toContain('Releases section of the GitHub page');
    });
});
