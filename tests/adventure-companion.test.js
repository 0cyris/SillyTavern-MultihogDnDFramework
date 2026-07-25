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
        const companion = await import('../tutorial-bot.js');

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
            lookbackAll: true,
            history: [],
        });
    });
});
