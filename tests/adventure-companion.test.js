import { beforeEach, describe, expect, it, vi } from 'vitest';
import { testExtensionSettings } from './setup.js';

let activeChatId = 'alpha';

beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    for (const key of Object.keys(testExtensionSettings)) delete testExtensionSettings[key];
    activeChatId = 'alpha';
    globalThis.SillyTavern.getContext = () => ({
        extensionSettings: testExtensionSettings,
        chatId: activeChatId,
        getCurrentChatId: () => activeChatId,
        saveSettingsDebounced: () => {},
    });
});

describe('Adventure Companion chat partitions', () => {
    it('starts an unseen chat with the default Companion session', async () => {
        const { runtimeState } = await import('../src/app/runtime-state.js');
        const companion = await import('../adventure-companion.js');

        runtimeState.currentChatId = 'alpha';
        companion.applyAdventureCompanionSnapshot({
            lookback: 5,
            lookbackAll: true,
            history: [{ role: 'user', content: 'Alpha-only conversation' }],
        });

        activeChatId = 'beta';
        runtimeState.currentChatId = 'beta';
        companion.loadAdventureCompanionForChat('beta');

        expect(companion.getAdventureCompanionSnapshot()).toEqual({
            lookback: 5,
            lookbackAll: false,
            history: [],
        });
    });

    it('migrates the selected legacy help conversation into Tutorial Mode', async () => {
        localStorage.setItem('rpg_tracker_chat_prefs_v1', JSON.stringify({
            mode: 'tutorial',
            tutorial: {
                lookback: 7,
                lookbackAll: false,
                history: [{ role: 'user', content: 'How does RNG work?' }],
            },
            companion: {
                lookback: 5,
                lookbackAll: true,
                history: [],
            },
        }));

        const companion = await import('../adventure-companion.js');

        expect(companion.isTutorialModeEnabled()).toBe(true);
        expect(companion.getAdventureCompanionSnapshot()).toEqual({
            lookback: 7,
            lookbackAll: false,
            history: [{ role: 'user', content: 'How does RNG work?' }],
        });
    });
});
