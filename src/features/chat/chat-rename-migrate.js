import { getSettings, saveChatState } from '../../../state-manager.js';
import { runtimeState } from '../../app/runtime-state.js';
import {
    COMPANION_BY_CHAT_KEY,
    MEMO_RECOVERY_KEY,
    moveLocalChatMapEntry,
} from './branch-campaign.js';

/**
 * Strip .jsonl from ST CHAT_RENAMED filenames.
 * @param {string} name
 */
export function stripChatFileExtension(name) {
    return String(name || '').replace(/\.jsonl$/i, '');
}

/**
 * Migrate Multihog per-chat stores when SillyTavern renames a chat file.
 * Moves (not copies) chatStates + local maps so the new name keeps the campaign.
 *
 * @param {{ oldFileName?: string, newFileName?: string }} detail
 * @param {{
 *   saveSettings: (force?: boolean) => Promise<void>|void,
 *   loadChatState: (chatId: string) => boolean,
 * }} deps
 */
export async function onChatRenamedMigrate(detail, deps) {
    const { saveSettings, loadChatState } = deps;
    const oldId = stripChatFileExtension(detail?.oldFileName);
    let newId = stripChatFileExtension(detail?.newFileName);
    // ST may emit the pre-sanitize name in CHAT_RENAMED while getCurrentChatId()
    // already reflects the server-sanitized file after reloadCurrentChat().
    const ctx = SillyTavern.getContext();
    const liveId = ctx.getCurrentChatId?.() || ctx.chatId || null;
    if (liveId && oldId && liveId !== oldId) {
        newId = String(liveId);
    }
    if (!oldId || !newId || oldId === newId) return;

    const s = getSettings();
    if (!s.chatStates) s.chatStates = {};

    const hasOld = Object.prototype.hasOwnProperty.call(s.chatStates, oldId);
    const hasNew = Object.prototype.hasOwnProperty.call(s.chatStates, newId);

    const partitionLooksEmpty = (p) => {
        if (!p || typeof p !== 'object') return true;
        return !p.currentMemo
            && !(p.quests?.length)
            && !(p.memoHistory?.length)
            && !(p.campaignBooks?.length)
            && !p.playerCharacter
            && !(p.setup && Object.keys(p.setup).length);
    };

    let migratedPartition = false;
    if (hasOld && !hasNew) {
        s.chatStates[newId] = s.chatStates[oldId];
        delete s.chatStates[oldId];
        migratedPartition = true;
    } else if (hasOld && hasNew) {
        // CHAT_CHANGED often runs before CHAT_RENAMED and may seed an empty new partition
        // after resetUnseenChatState. Prefer the rich old partition in that case.
        if (partitionLooksEmpty(s.chatStates[newId]) && !partitionLooksEmpty(s.chatStates[oldId])) {
            s.chatStates[newId] = s.chatStates[oldId];
            delete s.chatStates[oldId];
            migratedPartition = true;
        } else {
            console.warn(
                `[RPG Tracker] CHAT_RENAMED: both chatStates["${oldId}"] and chatStates["${newId}"] exist; keeping new, leaving old orphaned.`,
            );
            toastr['warning'](
                `Chat renamed to "${newId}", but Multihog already had data under that name. Keeping the new partition; old key "${oldId}" left orphaned.`,
                'Chat Rename',
                { timeOut: 10000 },
            );
        }
    } else if (!hasOld && hasNew) {
        // Already under new key (e.g. Branch Campaign seeded then renamed) — nothing to do for partition.
    }

    moveLocalChatMapEntry(COMPANION_BY_CHAT_KEY, oldId, newId);
    moveLocalChatMapEntry(MEMO_RECOVERY_KEY, oldId, newId);

    if (s.routerCampaignPrefixOverrideAnchorChatId === oldId) {
        s.routerCampaignPrefixOverrideAnchorChatId = newId;
    }

    if (runtimeState.currentChatId === oldId) {
        runtimeState.currentChatId = newId;
    }

    // If we are on the renamed chat, ensure live state matches the migrated partition.
    const activeId = ctx.getCurrentChatId?.() || ctx.chatId || runtimeState.currentChatId;
    if (activeId === newId && migratedPartition && typeof loadChatState === 'function') {
        loadChatState(newId);
    } else if (activeId === newId && migratedPartition && s.chatLinkEnabled) {
        saveChatState(newId, { skipDiskWrite: true });
    }

    if (migratedPartition || hasOld || hasNew) {
        try {
            await Promise.resolve(saveSettings(true));
        } catch (err) {
            console.warn('[RPG Tracker] CHAT_RENAMED save failed:', err);
        }
    }

    if (migratedPartition) {
        toastr['info'](
            `Multihog campaign data followed the rename: "${oldId}" → "${newId}".`,
            'Chat Rename',
            { timeOut: 6000 },
        );
    }
}
