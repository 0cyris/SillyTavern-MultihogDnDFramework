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
    it('starts an unseen chat with empty history while keeping global lookback prefs', async () => {
        localStorage.setItem('rpg_tracker_chat_prefs_v1', JSON.stringify({
            tutorialMode: false,
            injectLore: false,
            injectMemo: false,
            companion: { lookback: 5, lookbackAll: true, history: [] },
        }));

        const { runtimeState } = await import('../src/app/runtime-state.js');
        const companion = await import('../adventure-companion.js');

        runtimeState.currentChatId = 'alpha';
        companion.applyAdventureCompanionSnapshot({
            lookback: 99,
            lookbackAll: false,
            history: [{ role: 'user', content: 'Alpha-only conversation' }],
        });

        // Chat-linked snaps must not clobber the global All toggle.
        expect(companion.getAdventureCompanionSnapshot()).toEqual({
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

    it('defaults lookbackAll to false for a fresh install', async () => {
        const companion = await import('../adventure-companion.js');
        expect(companion.getAdventureCompanionSnapshot()).toEqual({
            lookback: 5,
            lookbackAll: false,
            history: [],
        });
    });

    it('keeps lookbackAll=true across reload even when a chat-linked snap omits it', async () => {
        localStorage.setItem('rpg_tracker_chat_prefs_v1', JSON.stringify({
            tutorialMode: false,
            injectLore: false,
            injectMemo: false,
            companion: { lookback: 5, lookbackAll: true, history: [] },
        }));
        localStorage.setItem('rpg_tracker_companion_by_chat_v1', JSON.stringify({
            alpha: { lookback: 5, lookbackAll: true, history: [{ role: 'user', content: 'hi' }] },
        }));

        const { runtimeState } = await import('../src/app/runtime-state.js');
        runtimeState.currentChatId = 'alpha';
        testExtensionSettings.rpg_tracker = {
            chatLinkEnabled: true,
            chatStates: {
                alpha: {
                    currentMemo: '',
                    // Stale / incomplete snap — missing lookbackAll used to force All off.
                    adventureCompanion: { lookback: 5, history: [{ role: 'user', content: 'hi' }] },
                },
            },
        };

        const companion = await import('../adventure-companion.js');
        expect(companion.getAdventureCompanionSnapshot().lookbackAll).toBe(true);
        expect(companion.getAdventureCompanionSnapshot().history).toEqual([
            { role: 'user', content: 'hi' },
        ]);

        companion.applyAdventureCompanionSnapshot({ lookback: 5, history: [{ role: 'user', content: 'hi' }] });
        expect(companion.getAdventureCompanionSnapshot().lookbackAll).toBe(true);
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
