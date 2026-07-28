import { describe, expect, it } from 'vitest';
import {
    applyChatSetup,
    buildDefaultSettings,
    migrateChatSetupCatalogs,
    removeChatSetupCatalogEntries,
    resetChatSetupToStock,
    snapshotChatSetup,
    syncChatSetupCatalogs,
} from '../state-manager.js';

describe('per-chat Control Room and tracker setup', () => {
    it('keeps definitions global while activation remains per chat', () => {
        const settings = buildDefaultSettings();
        migrateChatSetupCatalogs(settings);
        settings.customSyspromptLibrary = [{ id: 'grim', tag: 'tone', content: 'Grim', enabled: true }];
        settings.syspromptSectionOrder = ['lib:grim', 'narrative'];
        settings.customFields = [{ tag: 'SANITY', label: 'Sanity', enabled: true }];
        settings.modules.combat = false;
        settings.stockPrompts.combat = 'Custom combat';
        const chatA = snapshotChatSetup(settings);

        settings.customSyspromptLibrary[0].enabled = false;
        settings.customFields[0].enabled = false;
        const chatB = snapshotChatSetup(settings);

        expect(applyChatSetup(settings, chatA)).toBe(true);
        expect(settings.customSyspromptLibrary[0].content).toBe('Grim');
        expect(settings.customSyspromptLibrary[0].enabled).toBe(true);
        expect(settings.customFields[0].enabled).toBe(true);
        expect(settings.modules.combat).toBe(false);
        expect(settings.stockPrompts.combat).toBe('Custom combat');

        expect(applyChatSetup(settings, chatB)).toBe(true);
        expect(settings.customSyspromptLibrary[0].content).toBe('Grim');
        expect(settings.customSyspromptLibrary[0].enabled).toBe(false);
        expect(settings.customFields[0].enabled).toBe(false);
    });

    it('resets setup fields to stock while keeping catalog items inactive', () => {
        const settings = buildDefaultSettings();
        migrateChatSetupCatalogs(settings);
        settings.currentMemo = '[CHARACTER]Keep me[/CHARACTER]';
        settings.customFields = [{ tag: 'SANITY', label: 'Sanity', enabled: true }];
        settings.customSyspromptLibrary = [{ id: 'grim', tag: 'tone', content: 'Grim', enabled: true }];
        settings.modules.combat = false;
        snapshotChatSetup(settings);

        resetChatSetupToStock(settings);

        const defaults = buildDefaultSettings();
        expect(settings.currentMemo).toBe('[CHARACTER]Keep me[/CHARACTER]');
        expect(settings.customFields.map(field => [field.tag, field.enabled])).toEqual([['SANITY', false]]);
        expect(settings.customSyspromptLibrary.map(item => [item.id, item.enabled])).toEqual([['grim', false]]);
        expect(settings.modules).toEqual(defaults.modules);
    });

    it('migrates legacy chat definitions into catalogs and removes them only explicitly', () => {
        const settings = buildDefaultSettings();
        settings.chatStates = {
            alpha: {
                setup: {
                    customFields: [{ tag: 'SANITY', label: 'Sanity', enabled: true }],
                    customSyspromptLibrary: [{ id: 'grim', tag: 'tone', content: 'Grim', enabled: true }],
                    gameSystems: [{ id: 'system-1', name: 'Sanity', enabled: true }],
                },
            },
        };

        expect(migrateChatSetupCatalogs(settings)).toBe(true);
        expect(settings.trackerModuleDatabase.map(item => item.tag)).toEqual(['SANITY']);
        expect(settings.syspromptSnippetDatabase.map(item => item.id)).toEqual(['grim']);
        expect(settings.gameSystemDatabase.map(item => item.id)).toEqual(['system-1']);
        expect(settings.chatStates.alpha.setup.customFieldStates.SANITY).toBe(true);
        expect(settings.chatStates.alpha.setup.customFields).toBeUndefined();

        removeChatSetupCatalogEntries(settings, {
            customFieldTags: ['SANITY'],
            syspromptIds: ['grim'],
            gameSystemIds: ['system-1'],
        });
        expect(settings.trackerModuleDatabase).toEqual([]);
        expect(settings.syspromptSnippetDatabase).toEqual([]);
        expect(settings.gameSystemDatabase).toEqual([]);
        expect(settings.chatStates.alpha.setup.customFieldStates.SANITY).toBeUndefined();
    });

    it('updates catalog definitions when an existing live item is edited', () => {
        const settings = buildDefaultSettings();
        migrateChatSetupCatalogs(settings);
        settings.customFields = [{ tag: 'SANITY', label: 'Sanity', prompt: 'Old tracker prompt', enabled: true }];
        settings.customSyspromptLibrary = [{ id: 'grim', tag: 'tone', content: 'Old snippet', enabled: true }];
        syncChatSetupCatalogs(settings);

        settings.customFields[0].prompt = 'Revised tracker prompt';
        settings.customSyspromptLibrary[0].content = 'Revised snippet';
        syncChatSetupCatalogs(settings);

        expect(settings.trackerModuleDatabase[0].prompt).toBe('Revised tracker prompt');
        expect(settings.syspromptSnippetDatabase[0].content).toBe('Revised snippet');
    });
});
