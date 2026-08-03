import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const settingsMarkup = readFileSync(new URL('../settings.html', import.meta.url), 'utf8');

function divDepthAt(marker) {
    const beforeMarker = settingsMarkup.slice(0, settingsMarkup.indexOf(marker));
    const tags = beforeMarker.match(/<\/?div(?:\s[^>]*)?>/g) || [];
    return tags.reduce((depth, tag) => depth + (tag.startsWith('</') ? -1 : 1), 0);
}

describe('General & Visuals settings', () => {
    it('keeps every primary section inside the framework drawer', () => {
        const primaryHeaders = [
            '<b>General & Visuals</b>',
            '<b>Game Systems & Customization</b>',
            '<b>State Tracker & Modules</b>',
            '<b>Lorebook Agent</b>',
            '<b>World Progression</b>',
            '<b>Adventure Companion</b>',
        ];
        const expectedDepth = divDepthAt(primaryHeaders[0]);

        expect(primaryHeaders.map(divDepthAt)).toEqual(primaryHeaders.map(() => expectedDepth));
        expect((settingsMarkup.match(/<div(?:\s|>)/g) || []).length)
            .toBe((settingsMarkup.match(/<\/div>/g) || []).length);
    });

    it('organizes settings into Core, UI Appearance, and Portraits drawers', () => {
        expect(settingsMarkup).toContain('<b>Core</b>');
        expect(settingsMarkup).toContain('<b>UI Appearance</b>');
        expect(settingsMarkup).toContain('<b>Portraits</b>');
    });

    it('keeps portrait-specific drawers and the emergency purge within Portraits', () => {
        const portraitsStart = settingsMarkup.indexOf('<b>Portraits</b>');
        const developerStart = settingsMarkup.indexOf('Developer &amp; Reset');
        const portraitsMarkup = settingsMarkup.slice(portraitsStart, developerStart);

        expect(portraitsMarkup).toContain('<b>Portraits LLM Connection</b>');
        expect(portraitsMarkup).toContain('<b>Portrait Prompt Templates</b>');
        expect(portraitsMarkup).toContain('id="rpg_tracker_purge_all_portraits"');
    });

    it('mirrors every Adventure Companion option and gives it a dedicated connection', () => {
        const companionStart = settingsMarkup.indexOf('<b>Adventure Companion</b>');
        const companionMarkup = settingsMarkup.slice(companionStart);

        expect(companionMarkup).toContain('Open Adventure Companion with the <b>CHAT</b> button at the top of the State Tracker. It can help with your adventure when <b>TUTORIAL MODE</b> is enabled, getting you to grips with the extension.');
        expect(companionMarkup).toContain('Otherwise, it\'s there if you just feel like chatting about your adventure or brainstorm, etc.');

        [
            'rpg_adventure_companion_tutorial_mode',
            'rpg_adventure_companion_lookback',
            'rpg_adventure_companion_lookback_all',
            'rpg_adventure_companion_inject_lore',
            'rpg_adventure_companion_inject_memo',
            'rpg_adventure_companion_connection_source',
            'rpg_adventure_companion_connection_profile',
            'rpg_adventure_companion_ollama_url',
            'rpg_adventure_companion_ollama_model',
            'rpg_adventure_companion_openai_url',
            'rpg_adventure_companion_openai_key',
            'rpg_adventure_companion_openai_model',
            'rpg_adventure_companion_openai_model_manual',
            'rpg_adventure_companion_completion_preset',
        ].forEach((id) => expect(companionMarkup).toContain(`id="${id}"`));
    });

    it('places Adventure Companion directly below World Progression', () => {
        const worldStart = settingsMarkup.indexOf('<b>World Progression</b>');
        const companionStart = settingsMarkup.indexOf('<b>Adventure Companion</b>');

        expect(worldStart).toBeGreaterThanOrEqual(0);
        expect(companionStart).toBeGreaterThan(worldStart);
        expect(settingsMarkup.indexOf('<b>Lorebook Agent</b>')).toBeLessThan(worldStart);
    });

    it('places the global custom-bar animation toggle beside the Rendering Tags Library', () => {
        const library = settingsMarkup.indexOf('id="rt_btn_tag_library"');
        const animation = settingsMarkup.indexOf('id="rpg_tracker_animate_all_custom_bars"');
        const moduleExport = settingsMarkup.indexOf('id="rpg_tracker_export_all_modules"');

        expect(library).toBeGreaterThanOrEqual(0);
        expect(animation).toBeGreaterThan(library);
        expect(animation).toBeLessThan(moduleExport);
        expect(settingsMarkup).not.toContain('âˆ’value');
    });
});
