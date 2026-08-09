import { beforeEach, describe, expect, it, vi } from 'vitest';

// branch-campaign.js imports SillyTavern host modules (bookmarks.js); stub the
// local-map helpers rename migration needs so the suite can load under vitest.
vi.mock('../src/features/chat/branch-campaign.js', () => ({
    COMPANION_BY_CHAT_KEY: 'rpg_tracker_companion_by_chat_v1',
    MEMO_RECOVERY_KEY: 'rpg_tracker_memo_recovery_v1',
    moveLocalChatMapEntry: () => {},
}));

import { getSettings } from '../state-manager.js';
import { runtimeState } from '../src/app/runtime-state.js';
import {
    onChatRenamedMigrate,
    partitionLooksEmpty,
    partitionSubstanceScore,
    stripChatFileExtension,
} from '../src/features/chat/chat-rename-migrate.js';
import { testExtensionSettings } from './setup.js';

describe('chat rename migration helpers', () => {
    it('strips .jsonl from ST rename filenames', () => {
        expect(stripChatFileExtension('My Chat.jsonl')).toBe('My Chat');
        expect(stripChatFileExtension('plain')).toBe('plain');
    });

    it('treats setup-only shells as empty campaign partitions', () => {
        const setupOnly = {
            currentMemo: '',
            quests: [],
            memoHistory: [],
            campaignBooks: [],
            customPortraits: {},
            customLocationImages: {},
            setup: {
                version: 3,
                syspromptModules: { loot: true },
                customFieldStates: {},
            },
        };
        expect(partitionLooksEmpty(setupOnly)).toBe(true);
        expect(partitionSubstanceScore(setupOnly)).toBe(0);
    });

    it('scores memo/PC/quests as real substance', () => {
        const rich = {
            currentMemo: '[CHARACTER]Hero[/CHARACTER]',
            playerCharacter: { name: 'Hero', bio: 'Body: Tall.' },
            quests: [{ id: 'q1', title: 'Find the key' }],
            memoHistory: [{ memo: 'older' }],
            campaignBooks: ['HeroCampaign'],
            setup: { version: 3 },
        };
        expect(partitionLooksEmpty(rich)).toBe(false);
        expect(partitionSubstanceScore(rich)).toBeGreaterThan(10);
    });
});

describe('onChatRenamedMigrate', () => {
    beforeEach(() => {
        for (const key of Object.keys(testExtensionSettings)) {
            delete testExtensionSettings[key];
        }
        runtimeState.currentChatId = null;
        globalThis.toastr = { warning: vi.fn(), info: vi.fn(), success: vi.fn(), error: vi.fn() };
        const base = SillyTavern.getContext();
        SillyTavern.getContext = () => ({
            ...base,
            chatId: 'Renamed Chat',
            getCurrentChatId: () => 'Renamed Chat',
        });
    });

    it('moves a rich partition when the new key is missing', async () => {
        const s = getSettings();
        s.chatStates = {
            'Old Chat': {
                currentMemo: 'alive',
                quests: [{ id: '1' }],
                playerCharacter: { name: 'Ada' },
            },
        };
        runtimeState.currentChatId = 'Old Chat';

        const loadChatState = vi.fn(() => true);
        await onChatRenamedMigrate(
            { oldFileName: 'Old Chat.jsonl', newFileName: 'Renamed Chat.jsonl' },
            { saveSettings: vi.fn(), loadChatState },
        );

        expect(s.chatStates['Renamed Chat']?.currentMemo).toBe('alive');
        expect(s.chatStates['Old Chat']).toBeUndefined();
        expect(loadChatState).toHaveBeenCalledWith('Renamed Chat');
        expect(runtimeState.currentChatId).toBe('Renamed Chat');
    });

    it('prefers the rich old partition over a setup-only shell seeded after CHAT_CHANGED', async () => {
        const s = getSettings();
        s.chatStates = {
            'Old Chat': {
                currentMemo: '[CHARACTER]Keeper[/CHARACTER]',
                quests: [{ id: 'quest-a', title: 'Escort' }],
                memoHistory: [{ memo: 'prior' }],
                campaignBooks: ['Old_Chat', 'Old_Chat_Events'],
                playerCharacter: { name: 'Keeper', bio: 'Equipment: Cloak.' },
                activeRouterKeys: ['Old_Chat::1'],
                setup: { version: 3, narrativePacing: 'high_agency' },
            },
            // Mimics resetUnseenChatState + saveChatState after deferred campaign sync:
            // empty story fields but a full Control Room setup snapshot (default on).
            'Renamed Chat': {
                currentMemo: '',
                quests: [],
                memoHistory: [],
                campaignBooks: [],
                customPortraits: {},
                customLocationImages: {},
                routerCampaignPrefix: 'Renamed_Chat',
                setup: {
                    version: 3,
                    syspromptModules: { loot: true, CYOA_mode: false },
                    customFieldStates: {},
                    syspromptSnippetStates: {},
                    gameSystemStates: {},
                    narrativePacing: 'high_agency',
                },
            },
        };
        runtimeState.currentChatId = 'Renamed Chat';

        const loadChatState = vi.fn(() => true);
        await onChatRenamedMigrate(
            { oldFileName: 'Old Chat.jsonl', newFileName: 'Renamed Chat.jsonl' },
            { saveSettings: vi.fn(), loadChatState },
        );

        expect(s.chatStates['Renamed Chat']?.currentMemo).toBe('[CHARACTER]Keeper[/CHARACTER]');
        expect(s.chatStates['Renamed Chat']?.playerCharacter?.name).toBe('Keeper');
        expect(s.chatStates['Renamed Chat']?.campaignBooks).toEqual(['Old_Chat', 'Old_Chat_Events']);
        expect(s.chatStates['Old Chat']).toBeUndefined();
        expect(loadChatState).toHaveBeenCalledWith('Renamed Chat');
        expect(globalThis.toastr.warning).not.toHaveBeenCalled();
    });

    it('keeps an equally-rich new partition on true name collision', async () => {
        const s = getSettings();
        s.chatStates = {
            'Old Chat': { currentMemo: 'from-old', quests: [{ id: '1' }] },
            'Renamed Chat': { currentMemo: 'already-here', quests: [{ id: '2' }] },
        };

        await onChatRenamedMigrate(
            { oldFileName: 'Old Chat.jsonl', newFileName: 'Renamed Chat.jsonl' },
            { saveSettings: vi.fn(), loadChatState: vi.fn() },
        );

        expect(s.chatStates['Renamed Chat']?.currentMemo).toBe('already-here');
        expect(s.chatStates['Old Chat']?.currentMemo).toBe('from-old');
        expect(globalThis.toastr.warning).toHaveBeenCalled();
    });
});
