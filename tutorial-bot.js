/**
 * tutorial-bot.js — Multihog D&D Framework in-panel CHAT.
 * Modes: Tutorial Bot (docs help) and Adventure Companion (story brainstorming).
 * Morphs the State Tracker body into a multi-turn chat. LLM: State Tracker connection.
 */
import { sendAgentTurn } from './llm-client.js';
import { getSettings } from './state-manager.js';
import { cleanToolCallMessage, memoForGmContext } from './memo-processor.js';
import { runtimeState } from './src/app/runtime-state.js';

const FOLDER_NAME = (function () {
    try {
        const urlObj = new URL(import.meta.url);
        const parts = urlObj.pathname.split('/');
        const idx = parts.indexOf('third-party');
        if (idx !== -1 && idx + 1 < parts.length) {
            return decodeURIComponent(parts[idx + 1]);
        }
    } catch (_) { /* fall through */ }
    return 'SillyTavern-MultihogDnDFramework';
})();

const DOC_URL = `/scripts/extensions/third-party/${FOLDER_NAME}/docs/multihogDnDdoc.md`;
const PREFS_STORAGE_KEY = 'rpg_tracker_chat_prefs_v1';
/** Per-chat Adventure Companion sessions (always keyed by ST chat id). */
const COMPANION_BY_CHAT_KEY = 'rpg_tracker_companion_by_chat_v1';
/** Legacy keys migrated once into PREFS_STORAGE_KEY */
const LEGACY_HISTORY_KEY = 'rpg_tracker_tutorial_chat';
const LEGACY_LOOKBACK_KEY = 'rpg_tracker_tutorial_lookback';

const SHELL_VERSION = '4';

const TUTORIAL_PERSONA = `You are the Multihog D&D Framework Tutorial Bot — a concise in-app instructor for SillyTavern users.

Rules:
- Answer questions about Multihog D&D Framework (setup, State Tracker, RNG, Lorebook Agent, World Progression, quests, CYOA, cartridges, UI, slash commands, troubleshooting).
- When CURRENT STORY CONTEXT / STATE MEMO / ACTIVE LORE are provided, you may reference them to explain Multihog features in light of the player's game — but you are not a story companion by default.
- Treat the DOCUMENTATION block as your source of truth for how Multihog works. Prefer it over guesswork.
- Be brief and practical. Use short steps or bullet lists when explaining how-tos.
- If the docs do not cover something, say you are unsure rather than inventing settings, IDs, or behavior.
- Do not invent story facts beyond provided context. Do not narrate new scenes as the Game Master.
- Do not claim you can change the user's settings or run the tracker for them unless they ask how to do it themselves.`;

const COMPANION_PERSONA = `You are the Adventure Companion — a witty, imaginative friend sitting beside the player of a Multihog D&D Framework campaign in SillyTavern.

Rules:
- Help with entertainment, brainstorming, theories, roleplay ideas, jokes, and discussing what just happened in the story.
- Use CURRENT STORY CONTEXT, STATE MEMO, and ACTIVE LORE when provided. Stay consistent with those facts; do not contradict them.
- Do not invent major plot outcomes as if you were the Game Master running the live game — suggest possibilities and riff, rather than declaring canon.
- You are not the Multihog technical support bot. For deep framework/settings how-tos, briefly suggest switching to Tutorial Bot mode.
- Keep replies engaging but not endless. Match the player's energy.`;

/**
 * @typedef {'tutorial'|'companion'} ChatBotMode
 * @typedef {{ lookback: number, lookbackAll: boolean, history: Array<{role:'user'|'assistant', content:string}> }} ModePrefs
 * @typedef {{ mode: ChatBotMode, injectLore: boolean, injectMemo: boolean, tutorial: ModePrefs, companion: ModePrefs }} ChatPrefs
 */

/** @returns {ModePrefs} */
function defaultTutorialPrefs() {
    return { lookback: 0, lookbackAll: false, history: [] };
}

/** @returns {ModePrefs} */
function defaultCompanionPrefs() {
    return { lookback: 5, lookbackAll: false, history: [] };
}

/** @returns {ChatPrefs} */
function defaultPrefs() {
    return {
        mode: 'tutorial',
        injectLore: false,
        injectMemo: false,
        tutorial: defaultTutorialPrefs(),
        companion: defaultCompanionPrefs(),
    };
}

/**
 * @returns {ChatPrefs}
 */
function loadPrefs() {
    const base = defaultPrefs();
    try {
        const raw = localStorage.getItem(PREFS_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            return mergePrefs(base, parsed);
        }
    } catch (_) { /* migrate below */ }

    // One-time migrate legacy tutorial-only storage
    try {
        const legacyHist = localStorage.getItem(LEGACY_HISTORY_KEY);
        const legacyLook = localStorage.getItem(LEGACY_LOOKBACK_KEY);
        if (legacyHist || legacyLook != null) {
            if (legacyHist) {
                const parsed = JSON.parse(legacyHist);
                if (Array.isArray(parsed)) {
                    base.tutorial.history = parsed
                        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
                        .map((m) => ({ role: m.role, content: m.content }));
                }
            }
            if (legacyLook != null && legacyLook !== '') {
                const n = parseInt(legacyLook, 10);
                if (Number.isFinite(n) && n >= 0) base.tutorial.lookback = Math.min(100, n);
            }
            savePrefs(base);
            localStorage.removeItem(LEGACY_HISTORY_KEY);
            localStorage.removeItem(LEGACY_LOOKBACK_KEY);
        }
    } catch (_) { /* ignore */ }

    return base;
}

/**
 * @param {ChatPrefs} base
 * @param {any} parsed
 * @returns {ChatPrefs}
 */
function mergePrefs(base, parsed) {
    if (!parsed || typeof parsed !== 'object') return base;
    const mode = parsed.mode === 'companion' ? 'companion' : 'tutorial';
    return {
        mode,
        injectLore: !!parsed.injectLore,
        injectMemo: !!parsed.injectMemo,
        tutorial: mergeModePrefs(base.tutorial, parsed.tutorial),
        companion: mergeModePrefs(base.companion, parsed.companion),
    };
}

/**
 * @param {ModePrefs} base
 * @param {any} parsed
 * @returns {ModePrefs}
 */
function mergeModePrefs(base, parsed) {
    if (!parsed || typeof parsed !== 'object') return { ...base, history: [...base.history] };
    let lookback = parseInt(String(parsed.lookback), 10);
    if (!Number.isFinite(lookback) || lookback < 0) lookback = base.lookback;
    lookback = Math.min(100, lookback);
    const history = Array.isArray(parsed.history)
        ? parsed.history
            .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
            .map((m) => ({ role: m.role, content: m.content }))
        : [...base.history];
    return {
        lookback,
        lookbackAll: !!parsed.lookbackAll,
        history,
    };
}

/** @param {ChatPrefs} prefs */
function savePrefs(prefs) {
    try {
        // Companion history is per-chat — strip it from the global prefs blob.
        const toStore = {
            ...prefs,
            companion: {
                lookback: prefs.companion.lookback,
                lookbackAll: prefs.companion.lookbackAll,
                history: [],
            },
        };
        localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(toStore));
    } catch (err) {
        console.warn('[CHAT] Could not persist prefs:', err);
    }
    persistCompanionSnapshot(prefs.companion);
}

/**
 * @returns {string|null}
 */
function resolveActiveChatId() {
    return runtimeState.currentChatId
        || SillyTavern.getContext()?.chatId
        || SillyTavern.getContext()?.getCurrentChatId?.()
        || null;
}

/**
 * @returns {Record<string, any>}
 */
function readCompanionByChatMap() {
    try {
        const raw = localStorage.getItem(COMPANION_BY_CHAT_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
        return {};
    }
}

/**
 * @param {Record<string, any>} map
 */
function writeCompanionByChatMap(map) {
    try {
        localStorage.setItem(COMPANION_BY_CHAT_KEY, JSON.stringify(map));
    } catch (err) {
        console.warn('[CHAT] Could not persist companion-by-chat map:', err);
    }
}

/**
 * @param {ModePrefs} companion
 * @returns {{ lookback: number, lookbackAll: boolean, history: Array<{role:string, content:string}> }}
 */
function snapshotCompanion(companion) {
    return {
        lookback: companion?.lookback ?? 5,
        lookbackAll: !!companion?.lookbackAll,
        history: JSON.parse(JSON.stringify(companion?.history || [])),
    };
}

/**
 * Snapshot of Adventure Companion state for the active chat (Chat Link + local map).
 */
export function getAdventureCompanionSnapshot() {
    return snapshotCompanion(_prefs.companion);
}

/**
 * @param {any} snap
 * @param {{ resetIfMissing?: boolean }} [opts]
 */
export function applyAdventureCompanionSnapshot(snap, opts = {}) {
    if (snap && typeof snap === 'object') {
        _prefs.companion = mergeModePrefs(defaultCompanionPrefs(), snap);
    } else if (opts.resetIfMissing) {
        _prefs.companion = defaultCompanionPrefs();
    }
    const chatId = resolveActiveChatId();
    if (chatId) {
        const map = readCompanionByChatMap();
        map[chatId] = snapshotCompanion(_prefs.companion);
        writeCompanionByChatMap(map);
    }
    if (_chatOpen) {
        syncChromeFromPrefs();
        if (_prefs.mode === 'companion') renderTranscript();
    }
}

/**
 * @param {ModePrefs} companion
 */
function persistCompanionSnapshot(companion) {
    const chatId = resolveActiveChatId();
    if (!chatId) return;
    const snap = snapshotCompanion(companion);
    const map = readCompanionByChatMap();
    map[chatId] = snap;
    writeCompanionByChatMap(map);

    const s = getSettings();
    if (s.chatLinkEnabled) {
        if (!s.chatStates) s.chatStates = {};
        if (!s.chatStates[chatId]) s.chatStates[chatId] = {};
        s.chatStates[chatId].adventureCompanion = snap;
    }
}

/**
 * Load Adventure Companion session for a chat id (Chat Link partition first, then local map).
 * @param {string|null|undefined} chatId
 */
function loadCompanionForChat(chatId) {
    if (!chatId) {
        _prefs.companion = {
            ...defaultCompanionPrefs(),
            lookback: _prefs.companion?.lookback ?? 5,
            lookbackAll: !!_prefs.companion?.lookbackAll,
            history: [],
        };
        return;
    }
    const s = getSettings();
    const fromLink = s.chatLinkEnabled ? s.chatStates?.[chatId]?.adventureCompanion : null;
    if (fromLink && typeof fromLink === 'object') {
        _prefs.companion = mergeModePrefs(defaultCompanionPrefs(), fromLink);
        return;
    }
    const map = readCompanionByChatMap();
    if (map[chatId] && typeof map[chatId] === 'object') {
        _prefs.companion = mergeModePrefs(defaultCompanionPrefs(), map[chatId]);
        return;
    }
    // An unseen chat must always begin clean. At this point `_prefs.companion`
    // still holds the departing chat's live session, so using it as a "legacy"
    // seed here would copy that conversation into every newly visited ChatID.
    // The only legacy migration is handled by loadPrefs(), before any per-chat
    // Companion session has been loaded.
    _prefs.companion = {
        ...defaultCompanionPrefs(),
        lookback: _prefs.companion?.lookback ?? 5,
        lookbackAll: !!_prefs.companion?.lookbackAll,
        history: [],
    };
}

/**
 * Flush the in-memory Adventure Companion session under an explicit chat id.
 * Must run before the live companion is swapped on chat switch (currentChatId may already have flipped).
 * @param {string|null|undefined} chatId
 */
export function flushAdventureCompanionForChat(chatId) {
    if (!chatId) return;
    const snap = snapshotCompanion(_prefs.companion);
    const map = readCompanionByChatMap();
    map[chatId] = snap;
    writeCompanionByChatMap(map);
    const s = getSettings();
    if (s.chatLinkEnabled) {
        if (!s.chatStates) s.chatStates = {};
        if (!s.chatStates[chatId]) s.chatStates[chatId] = {};
        s.chatStates[chatId].adventureCompanion = snap;
    }
}

/**
 * Load Adventure Companion for the arriving chat and refresh CHAT UI if open.
 * @param {string|null|undefined} chatId
 */
export function loadAdventureCompanionForChat(chatId) {
    loadCompanionForChat(chatId || null);
    if (_chatOpen) {
        syncChromeFromPrefs();
        renderTranscript();
    }
}

/**
 * Called on SillyTavern chat switch so Adventure Companion follows the active chat.
 * @param {string|null|undefined} oldChatId
 * @param {string|null|undefined} newChatId
 */
export function onChatChangedForAdventureCompanion(oldChatId, newChatId) {
    flushAdventureCompanionForChat(oldChatId);
    loadAdventureCompanionForChat(newChatId);
}

// Bridges for chat-persistence / chat-state-loader / index without import cycles
globalThis._rpgGetAdventureCompanionSnapshot = getAdventureCompanionSnapshot;
globalThis._rpgApplyAdventureCompanionSnapshot = applyAdventureCompanionSnapshot;
globalThis._rpgFlushAdventureCompanionForChat = flushAdventureCompanionForChat;
globalThis._rpgLoadAdventureCompanionForChat = loadAdventureCompanionForChat;
globalThis._rpgOnChatChangedForAdventureCompanion = onChatChangedForAdventureCompanion;

/** @type {ChatPrefs} */
let _prefs = loadPrefs();
// Hydrate per-chat companion history (Chat Link partition or local map). Safe if settings not ready yet.
try {
    loadCompanionForChat(resolveActiveChatId());
} catch (_) { /* boot may not have settings yet */ }

/** @type {string|null} */
let _docCache = null;
/** @type {Promise<string>|null} */
let _docPromise = null;

/** Panel morph open (CHAT view showing) */
let _chatOpen = false;
let _busy = false;
/** @type {AbortController|null} */
let _abort = null;
/** @type {HTMLElement|null} */
let _panel = null;

function activeModePrefs() {
    return _prefs.mode === 'companion' ? _prefs.companion : _prefs.tutorial;
}

function botLabel() {
    return _prefs.mode === 'companion' ? 'Adventure Companion' : 'Tutorial Bot';
}

/**
 * @param {string} s
 * @returns {string}
 */
function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** @type {import('showdown').Converter|null} */
let _mdConverter = null;

/**
 * @param {string} text
 * @returns {string}
 */
function formatBotHtmlFallback(text) {
    const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let inList = false;
    const closeList = () => {
        if (inList) {
            out.push('</ul>');
            inList = false;
        }
    };
    const inline = (s) => {
        let t = escapeHtml(s);
        t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
        t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        t = t.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
        return t;
    };
    for (const raw of lines) {
        const line = raw.trimEnd();
        const heading = line.match(/^(#{1,4})\s+(.+)$/);
        if (heading) {
            closeList();
            const level = heading[1].length;
            out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
            continue;
        }
        const bullet = line.match(/^\s*[-*]\s+(.+)$/);
        if (bullet) {
            if (!inList) {
                out.push('<ul>');
                inList = true;
            }
            out.push(`<li>${inline(bullet[1])}</li>`);
            continue;
        }
        if (!line.trim()) {
            closeList();
            continue;
        }
        closeList();
        out.push(`<p>${inline(line.trim())}</p>`);
    }
    closeList();
    return out.join('') || '<p></p>';
}

/**
 * @param {string} text
 * @returns {string}
 */
function formatBotHtml(text) {
    const showdownLib = globalThis.showdown;
    if (showdownLib?.Converter) {
        if (!_mdConverter) {
            _mdConverter = new showdownLib.Converter({
                tables: true,
                strikethrough: true,
                simpleLineBreaks: true,
                disableForced4SpacesIndentedSublists: true,
                literalMidWordUnderscores: true,
            });
        }
        let html = _mdConverter.makeHtml(String(text ?? ''));
        const purify = globalThis.DOMPurify;
        if (purify?.sanitize) {
            html = purify.sanitize(html, { USE_PROFILES: { html: true } });
        }
        return html;
    }
    return formatBotHtmlFallback(text);
}

async function loadDocumentation() {
    if (_docCache != null) return _docCache;
    if (_docPromise) return _docPromise;
    _docPromise = (async () => {
        try {
            const res = await fetch(DOC_URL, { cache: 'no-cache' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            _docCache = await res.text();
        } catch (err) {
            console.warn('[CHAT] Failed to load docs:', err);
            _docCache = '(Documentation file could not be loaded. Answer from general Multihog knowledge and admit uncertainty.)';
        }
        return _docCache;
    })();
    return _docPromise;
}

/**
 * @param {boolean} lookbackAll
 * @param {number} n
 * @returns {string}
 */
function buildNarrativeContext(lookbackAll, n) {
    const chat = SillyTavern.getContext()?.chat;
    if (!Array.isArray(chat) || chat.length === 0) return '';

    let recent;
    if (lookbackAll) {
        recent = chat;
    } else {
        if (!(n > 0)) return '';
        recent = chat.slice(-n);
    }

    const lines = recent
        .map((m) => {
            const name = m.is_user ? 'Player' : (m.name || 'Narrator');
            const content = cleanToolCallMessage(m.mes || m.content || '');
            if (content === null) return null;
            const text = String(content).trim();
            if (!text) return null;
            return `${name}: ${text}`;
        })
        .filter(Boolean);

    if (!lines.length) return '';
    const scope = lookbackAll
        ? `All ${lines.length} messages`
        : `Last ${lines.length} of ${recent.length} requested messages`;
    return `## NARRATIVE HISTORY (${scope})\n${lines.join('\n\n')}`;
}

/**
 * @returns {string}
 */
function buildMemoContext() {
    const memo = getSettings()?.currentMemo || '';
    const cleaned = memoForGmContext(memo).trim();
    if (!cleaned) return '';
    return `## STATE MEMO (State Tracker)\n${cleaned}`;
}

/**
 * Active Lorebook Agent entries (and related active keys).
 * @returns {Promise<string>}
 */
async function buildLoreContext() {
    const settings = getSettings();
    const ids = [...new Set([
        ...(settings.activeRouterKeys || []),
        ...(settings.keywordActivatedKeys || []),
        ...(settings.activeWorldKeys || []),
    ])];
    if (!ids.length) return '';

    const ctx = SillyTavern.getContext();
    if (!ctx?.loadWorldInfo) return '';

    const bookCache = {};
    const blocks = [];
    for (const id of ids) {
        const [bookName, uid] = String(id).split('::');
        if (!bookName || !uid) continue;
        if (!bookCache[bookName]) {
            try {
                bookCache[bookName] = await ctx.loadWorldInfo(bookName);
            } catch (_) {
                bookCache[bookName] = null;
            }
        }
        const entry = bookCache[bookName]?.entries?.[uid];
        if (!entry?.content) continue;
        const title = (entry.comment || '').replace(/^\[.*?\]\s*/i, '').trim() || uid;
        blocks.push(`### ${title}\n${String(entry.content).trim()}`);
    }
    if (!blocks.length) return '';
    return `## ACTIVE LORE (Lorebook Agent)\n${blocks.join('\n\n')}`;
}

/**
 * @param {object} opts
 * @param {string} [opts.doc]
 * @param {string} [opts.narrative]
 * @param {string} [opts.memo]
 * @param {string} [opts.lore]
 */
function buildSystemPrompt({ doc = '', narrative = '', memo = '', lore = '' } = {}) {
    const isCompanion = _prefs.mode === 'companion';
    let prompt = isCompanion ? COMPANION_PERSONA : TUTORIAL_PERSONA;

    if (!isCompanion && doc) {
        prompt += `\n\n--- DOCUMENTATION ---\n${doc}\n--- END DOCUMENTATION ---`;
    }
    if (narrative) {
        prompt += `\n\n--- CURRENT STORY CONTEXT ---\n${narrative}\n--- END STORY CONTEXT ---`;
    }
    if (memo) {
        prompt += `\n\n--- STATE TRACKER ---\n${memo}\n--- END STATE TRACKER ---`;
    }
    if (lore) {
        prompt += `\n\n--- LOREBOOK ---\n${lore}\n--- END LOREBOOK ---`;
    }
    return prompt;
}

/** @returns {boolean} whether the CHAT panel morph is open */
export function isTutorialMode() {
    return _chatOpen;
}

function syncModeToggleUi() {
    if (!_panel) return;
    const tutBtn = _panel.querySelector('#rt-chat-mode-tutorial');
    const compBtn = _panel.querySelector('#rt-chat-mode-companion');
    const isCompanion = _prefs.mode === 'companion';
    tutBtn?.classList.toggle('rt-agent-view-mode-btn-active', !isCompanion);
    compBtn?.classList.toggle('rt-agent-view-mode-btn-active', isCompanion);
    tutBtn?.setAttribute('aria-selected', String(!isCompanion));
    compBtn?.setAttribute('aria-selected', String(isCompanion));

    const title = _panel.querySelector('#rt-tutorial-title');
    if (title) title.textContent = botLabel();

    const input = _panel.querySelector('#rt-tutorial-input');
    if (input instanceof HTMLTextAreaElement) {
        input.placeholder = isCompanion
            ? 'Brainstorm, joke, or talk about the adventure… (Enter to send)'
            : 'Ask about Multihog… (Enter to send, Shift+Enter for newline)';
    }
}

function syncLookbackUi() {
    if (!_panel) return;
    const mp = activeModePrefs();
    const lookbackInp = /** @type {HTMLInputElement|null} */ (_panel.querySelector('#rt-tutorial-lookback'));
    const allChk = /** @type {HTMLInputElement|null} */ (_panel.querySelector('#rt-tutorial-lookback-all'));
    if (allChk) allChk.checked = !!mp.lookbackAll;
    if (lookbackInp) {
        lookbackInp.value = String(mp.lookback);
        lookbackInp.disabled = !!mp.lookbackAll || _busy;
        lookbackInp.classList.toggle('rt-tutorial-lookback-disabled', !!mp.lookbackAll);
    }
}

function syncGearUi() {
    if (!_panel) return;
    const lore = /** @type {HTMLInputElement|null} */ (_panel.querySelector('#rt-chat-inject-lore'));
    const memo = /** @type {HTMLInputElement|null} */ (_panel.querySelector('#rt-chat-inject-memo'));
    if (lore) lore.checked = !!_prefs.injectLore;
    if (memo) memo.checked = !!_prefs.injectMemo;
}

function syncChromeFromPrefs() {
    syncModeToggleUi();
    syncLookbackUi();
    syncGearUi();
}

/**
 * @param {HTMLElement} panel
 */
function ensureChatShell(panel) {
    const host = panel.querySelector('#rt-tutorial-view');
    if (!(host instanceof HTMLElement)) return null;
    if (host.dataset.rtTutorialReady === SHELL_VERSION) return host;

    const mp = activeModePrefs();
    host.innerHTML = `
        <div class="rt-tutorial-header">
            <button type="button" class="rpg-tracker-nav-btn rt-tutorial-back" id="rt-tutorial-back" title="Back to State Tracker">← Back</button>
            <div class="rt-chat-mode-switch rt-agent-view-mode-switch" id="rt-chat-mode-switch" role="tablist" aria-label="Chat mode">
                <button type="button" id="rt-chat-mode-tutorial" class="rt-agent-view-mode-btn${_prefs.mode !== 'companion' ? ' rt-agent-view-mode-btn-active' : ''}" role="tab" aria-selected="${_prefs.mode !== 'companion'}">Tutorial Bot</button>
                <button type="button" id="rt-chat-mode-companion" class="rt-agent-view-mode-btn${_prefs.mode === 'companion' ? ' rt-agent-view-mode-btn-active' : ''}" role="tab" aria-selected="${_prefs.mode === 'companion'}">Adventure Companion</button>
            </div>
            <span class="rt-tutorial-title" id="rt-tutorial-title">${escapeHtml(botLabel())}</span>
            <div class="rt-tutorial-lookback" title="Include SillyTavern chat messages as story context. Tutorial Bot defaults off; Adventure Companion links to chat by default.">
                <span class="rt-tutorial-lookback-label">Story lookback</span>
                <input type="text" inputmode="numeric" pattern="[0-9]*" id="rt-tutorial-lookback" value="${mp.lookback}" min="0" max="100" aria-label="Story lookback message count">
                <span class="rt-tutorial-lookback-unit">msgs</span>
                <label class="rt-tutorial-lookback-all" title="Include the entire chat history">
                    <input type="checkbox" id="rt-tutorial-lookback-all" ${mp.lookbackAll ? 'checked' : ''}>
                    <span>all</span>
                </label>
            </div>
            <div class="rt-chat-gear-wrap">
                <button type="button" class="rpg-tracker-icon-btn rt-chat-gear-btn" id="rt-chat-gear-btn" title="Context injection options" aria-haspopup="true" aria-expanded="false"><i class="fa-solid fa-gear"></i></button>
                <div class="rt-chat-gear-menu" id="rt-chat-gear-menu" style="display:none;" role="menu">
                    <label class="rt-chat-gear-item" role="menuitemcheckbox">
                        <input type="checkbox" id="rt-chat-inject-lore" ${_prefs.injectLore ? 'checked' : ''}>
                        <span>Inject Lorebook Agent lore</span>
                    </label>
                    <label class="rt-chat-gear-item" role="menuitemcheckbox">
                        <input type="checkbox" id="rt-chat-inject-memo" ${_prefs.injectMemo ? 'checked' : ''}>
                        <span>Inject State Tracker</span>
                    </label>
                </div>
            </div>
            <button type="button" class="rpg-tracker-nav-btn rt-tutorial-clear" id="rt-tutorial-clear" title="Clear this mode's conversation">Clear</button>
        </div>
        <div class="rt-tutorial-messages" id="rt-tutorial-messages" role="log" aria-live="polite"></div>
        <div class="rt-tutorial-composer">
            <textarea class="rt-tutorial-input" id="rt-tutorial-input" rows="2" placeholder=""></textarea>
            <button type="button" class="rpg-tracker-prompt-send rt-tutorial-send" id="rt-tutorial-send" title="Send">▶</button>
        </div>
    `;
    host.dataset.rtTutorialReady = SHELL_VERSION;
    syncChromeFromPrefs();
    return host;
}

function getMessageEl() {
    return _panel?.querySelector('#rt-tutorial-messages') || null;
}

function welcomeHtml() {
    if (_prefs.mode === 'companion') {
        return `
            <div class="rt-tutorial-msg rt-tutorial-msg-bot rt-tutorial-welcome">
                <div class="rt-tutorial-msg-label">Adventure Companion</div>
                <div class="rt-tutorial-msg-body">I'm here to brainstorm, joke, and talk about your adventure. <b>Story lookback</b> links me to the chat by default — use <b>all</b> for the full history. Open the gear for optional State Tracker / Lorebook injections.</div>
            </div>`;
    }
    return `
        <div class="rt-tutorial-msg rt-tutorial-msg-bot rt-tutorial-welcome">
            <div class="rt-tutorial-msg-label">Tutorial Bot</div>
            <div class="rt-tutorial-msg-body">Ask me anything about Multihog — setup, modules, RNG, Lorebook Agent, World Progression, quests, CYOA, cartridges, or troubleshooting. I use the docs as source of truth and do <b>not</b> link story chat unless you enable <b>Story lookback</b>.</div>
        </div>`;
}

function renderTranscript() {
    const box = getMessageEl();
    if (!box) return;
    const history = activeModePrefs().history;
    if (history.length === 0) {
        box.innerHTML = welcomeHtml();
        return;
    }
    const label = botLabel();
    box.innerHTML = history.map((m) => {
        const isUser = m.role === 'user';
        const cls = isUser ? 'rt-tutorial-msg-user' : 'rt-tutorial-msg-bot';
        const who = isUser ? 'You' : label;
        const body = isUser ? escapeHtml(m.content).replace(/\n/g, '<br>') : formatBotHtml(m.content);
        return `<div class="rt-tutorial-msg ${cls}"><div class="rt-tutorial-msg-label">${escapeHtml(who)}</div><div class="rt-tutorial-msg-body">${body}</div></div>`;
    }).join('');
    box.scrollTop = box.scrollHeight;
}

function setBusy(busy) {
    _busy = busy;
    const send = _panel?.querySelector('#rt-tutorial-send');
    const input = _panel?.querySelector('#rt-tutorial-input');
    if (send instanceof HTMLButtonElement) {
        send.disabled = busy;
        send.textContent = busy ? '…' : '▶';
    }
    if (input instanceof HTMLTextAreaElement) input.disabled = busy;
    syncLookbackUi();
    const modeBtns = _panel?.querySelectorAll('#rt-chat-mode-tutorial, #rt-chat-mode-companion');
    modeBtns?.forEach((btn) => {
        if (btn instanceof HTMLButtonElement) btn.disabled = busy;
    });
}

/**
 * @param {boolean} on
 */
function syncChatButton(on) {
    if (!_panel) return;
    const btn = _panel.querySelector('#rpg-tracker-help-btn');
    if (!(btn instanceof HTMLElement)) return;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.title = on ? 'Exit CHAT' : 'CHAT';
    btn.textContent = 'CHAT';
    if (!on) btn.blur();
}

/**
 * @param {boolean} on
 */
function applyMorph(on) {
    if (!_panel) return;
    const memo = _panel.querySelector('#rpg-tracker-memo');
    const render = _panel.querySelector('#rpg-tracker-render');
    const tutorial = _panel.querySelector('#rt-tutorial-view');
    const delta = _panel.querySelector('#rpg-tracker-delta');
    const promptBar = _panel.querySelector('#rpg-tracker-prompt-bar');
    const trackerPane = _panel.querySelector('#rt-panel-tracker-pane');

    if (on) {
        if (memo instanceof HTMLElement) memo.style.display = 'none';
        if (render instanceof HTMLElement) render.style.display = 'none';
        if (delta instanceof HTMLElement) delta.style.display = 'none';
        if (promptBar instanceof HTMLElement) promptBar.style.display = 'none';
        if (tutorial instanceof HTMLElement) tutorial.style.display = 'flex';
        trackerPane?.classList.add('rt-tutorial-mode');
        _panel.classList.add('rt-tutorial-active');
        syncChatButton(true);
    } else {
        if (tutorial instanceof HTMLElement) tutorial.style.display = 'none';
        trackerPane?.classList.remove('rt-tutorial-mode');
        _panel.classList.remove('rt-tutorial-active');
        syncChatButton(false);
        closeGearMenu();
        const wantRender = !!runtimeState.renderedViewActive;
        if (memo instanceof HTMLElement) memo.style.display = wantRender ? 'none' : '';
        if (render instanceof HTMLElement) render.style.display = wantRender ? 'block' : 'none';
    }
}

function closeGearMenu() {
    const menu = _panel?.querySelector('#rt-chat-gear-menu');
    const gearBtn = _panel?.querySelector('#rt-chat-gear-btn');
    if (menu instanceof HTMLElement) menu.style.display = 'none';
    if (gearBtn instanceof HTMLElement) gearBtn.setAttribute('aria-expanded', 'false');
}

/**
 * @param {ChatBotMode} mode
 */
function switchChatMode(mode) {
    if (_busy) return;
    if (mode !== 'tutorial' && mode !== 'companion') return;
    if (_prefs.mode === mode) return;
    _prefs.mode = mode;
    savePrefs(_prefs);
    closeGearMenu();
    syncChromeFromPrefs();
    renderTranscript();
}

export function exitTutorialMode() {
    if (!_chatOpen) return;
    if (_abort) {
        try { _abort.abort(); } catch (_) { /* ignore */ }
        _abort = null;
    }
    setBusy(false);
    _chatOpen = false;
    applyMorph(false);
}

export function enterTutorialMode() {
    if (!_panel) {
        _panel = /** @type {HTMLElement|null} */ (document.getElementById('rpg-tracker-panel'));
    }
    if (!_panel) {
        toastr['warning']('State Tracker panel is not available yet.', 'CHAT');
        return;
    }

    ensureChatShell(_panel);
    bindTutorialBotControls(_panel);

    const agentMode = getSettings().trackerContentMode === 'agent'
        && localStorage.getItem('rpg_tracker_agent_detached') !== 'true';
    if (agentMode) {
        const trackerTab = _panel.querySelector('#rt-panel-mode-tracker');
        if (trackerTab instanceof HTMLElement) trackerTab.click();
    }

    if (_panel.classList.contains('rt-panel-collapsed')) {
        const collapseBtn = _panel.querySelector('#rpg-tracker-collapse-btn');
        if (collapseBtn instanceof HTMLElement) collapseBtn.click();
    }

    _chatOpen = true;
    applyMorph(true);
    syncChromeFromPrefs();
    renderTranscript();
    if (_prefs.mode === 'tutorial') void loadDocumentation();
    const input = _panel.querySelector('#rt-tutorial-input');
    if (input instanceof HTMLTextAreaElement) {
        setTimeout(() => input.focus(), 50);
    }
}

export function toggleTutorialMode() {
    if (_chatOpen) exitTutorialMode();
    else enterTutorialMode();
}

export function openTutorialBot() {
    let panel = document.getElementById('rpg-tracker-panel');
    if (!(panel instanceof HTMLElement)) {
        toastr['warning']('State Tracker panel is not available yet.', 'CHAT');
        return;
    }
    _panel = panel;
    if (panel.style.display === 'none') {
        panel.style.display = 'flex';
        localStorage.setItem('rpg_tracker_visible', 'true');
    }
    ensureChatShell(panel);
    enterTutorialMode();
}

function readLookbackFromUi() {
    const mp = activeModePrefs();
    const allChk = /** @type {HTMLInputElement|null} */ (_panel?.querySelector('#rt-tutorial-lookback-all'));
    const lookbackInp = /** @type {HTMLInputElement|null} */ (_panel?.querySelector('#rt-tutorial-lookback'));
    mp.lookbackAll = !!allChk?.checked;
    if (!mp.lookbackAll && lookbackInp) {
        let n = parseInt(String(lookbackInp.value).trim(), 10);
        if (!Number.isFinite(n) || n < 0) n = 0;
        n = Math.min(100, n);
        lookbackInp.value = String(n);
        mp.lookback = n;
    }
    savePrefs(_prefs);
    syncLookbackUi();
}

async function sendMessage() {
    if (!_panel || _busy) return;
    const input = /** @type {HTMLTextAreaElement|null} */ (_panel.querySelector('#rt-tutorial-input'));
    const text = (input?.value || '').trim();
    if (!text) return;

    if (input) input.value = '';
    const mp = activeModePrefs();
    mp.history.push({ role: 'user', content: text });
    savePrefs(_prefs);
    renderTranscript();

    const box = getMessageEl();
    if (box) {
        const pending = document.createElement('div');
        pending.className = 'rt-tutorial-msg rt-tutorial-msg-bot rt-tutorial-pending';
        pending.id = 'rt-tutorial-pending';
        pending.innerHTML = `<div class="rt-tutorial-msg-label">${escapeHtml(botLabel())}</div><div class="rt-tutorial-msg-body">Thinking…</div>`;
        box.appendChild(pending);
        box.scrollTop = box.scrollHeight;
    }

    setBusy(true);
    _abort = new AbortController();

    try {
        readLookbackFromUi();
        const loreChk = /** @type {HTMLInputElement|null} */ (_panel.querySelector('#rt-chat-inject-lore'));
        const memoChk = /** @type {HTMLInputElement|null} */ (_panel.querySelector('#rt-chat-inject-memo'));
        _prefs.injectLore = !!loreChk?.checked;
        _prefs.injectMemo = !!memoChk?.checked;
        savePrefs(_prefs);

        const isCompanion = _prefs.mode === 'companion';
        // Companion defaults lookback=5 (linked to chat); Tutorial defaults lookback=0 (not linked).
        const narrative = (mp.lookbackAll || mp.lookback > 0)
            ? buildNarrativeContext(mp.lookbackAll, mp.lookback)
            : '';
        const memo = _prefs.injectMemo ? buildMemoContext() : '';
        const lore = _prefs.injectLore ? await buildLoreContext() : '';
        const doc = isCompanion ? '' : await loadDocumentation();

        const systemPrompt = buildSystemPrompt({ doc, narrative, memo, lore });
        const messages = [
            { role: 'system', content: systemPrompt },
            ...mp.history.map((m) => ({ role: m.role, content: m.content })),
        ];
        const result = await sendAgentTurn(getSettings(), messages, null, _abort.signal);
        const reply = (result?.content || '').trim() || '(No response from the model.)';
        mp.history.push({ role: 'assistant', content: reply });
    } catch (err) {
        if (err?.name === 'AbortError') {
            mp.history.push({ role: 'assistant', content: '(Cancelled.)' });
        } else {
            console.error('[CHAT]', err);
            const msg = err?.message || String(err);
            mp.history.push({
                role: 'assistant',
                content: `I could not reach the model. Check State Tracker connection settings.\n\n${msg}`,
            });
            toastr['error']('CHAT request failed — see conversation.', 'CHAT');
        }
    } finally {
        _abort = null;
        setBusy(false);
        savePrefs(_prefs);
        _panel?.querySelector('#rt-tutorial-pending')?.remove();
        renderTranscript();
    }
}

function clearChat() {
    if (_busy) return;
    activeModePrefs().history = [];
    savePrefs(_prefs);
    renderTranscript();
}

export function bindTutorialBot(panel) {
    if (!(panel instanceof HTMLElement)) return;
    _panel = panel;
    ensureChatShell(panel);
    bindTutorialBotControls(panel);
    // Ensure header button label is CHAT even before opening
    const btn = panel.querySelector('#rpg-tracker-help-btn');
    if (btn instanceof HTMLElement) {
        btn.textContent = 'CHAT';
        btn.title = 'CHAT';
    }
    // Re-hydrate companion for the active chat once panel/settings are available
    loadCompanionForChat(resolveActiveChatId());
}

/**
 * @param {HTMLElement} panel
 */
function bindTutorialBotControls(panel) {
    const helpBtn = panel.querySelector('#rpg-tracker-help-btn');
    if (helpBtn && !helpBtn.dataset.rtTutorialBound) {
        helpBtn.dataset.rtTutorialBound = '1';
        helpBtn.textContent = 'CHAT';
        helpBtn.title = 'CHAT';
        helpBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            toggleTutorialMode();
            if (!_chatOpen && helpBtn instanceof HTMLElement) helpBtn.blur();
        });
    }

    const backBtn = panel.querySelector('#rt-tutorial-back');
    if (backBtn && !backBtn.dataset.rtTutorialBound) {
        backBtn.dataset.rtTutorialBound = '1';
        backBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exitTutorialMode();
        });
    }

    const clearBtn = panel.querySelector('#rt-tutorial-clear');
    if (clearBtn && !clearBtn.dataset.rtTutorialBound) {
        clearBtn.dataset.rtTutorialBound = '1';
        clearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            clearChat();
        });
    }

    const sendBtn = panel.querySelector('#rt-tutorial-send');
    if (sendBtn && !sendBtn.dataset.rtTutorialBound) {
        sendBtn.dataset.rtTutorialBound = '1';
        sendBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            void sendMessage();
        });
    }

    const input = panel.querySelector('#rt-tutorial-input');
    if (input instanceof HTMLTextAreaElement && !input.dataset.rtTutorialBound) {
        input.dataset.rtTutorialBound = '1';
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void sendMessage();
            }
        });
    }

    const lookbackInp = panel.querySelector('#rt-tutorial-lookback');
    if (lookbackInp instanceof HTMLInputElement && !lookbackInp.dataset.rtTutorialBound) {
        lookbackInp.dataset.rtTutorialBound = '1';
        lookbackInp.addEventListener('change', () => readLookbackFromUi());
        lookbackInp.addEventListener('blur', () => readLookbackFromUi());
    }

    const allChk = panel.querySelector('#rt-tutorial-lookback-all');
    if (allChk instanceof HTMLInputElement && !allChk.dataset.rtTutorialBound) {
        allChk.dataset.rtTutorialBound = '1';
        allChk.addEventListener('change', () => readLookbackFromUi());
    }

    const tutModeBtn = panel.querySelector('#rt-chat-mode-tutorial');
    if (tutModeBtn && !tutModeBtn.dataset.rtTutorialBound) {
        tutModeBtn.dataset.rtTutorialBound = '1';
        tutModeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            switchChatMode('tutorial');
        });
    }

    const compModeBtn = panel.querySelector('#rt-chat-mode-companion');
    if (compModeBtn && !compModeBtn.dataset.rtTutorialBound) {
        compModeBtn.dataset.rtTutorialBound = '1';
        compModeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            switchChatMode('companion');
        });
    }

    const gearBtn = panel.querySelector('#rt-chat-gear-btn');
    const gearMenu = panel.querySelector('#rt-chat-gear-menu');
    if (gearBtn && gearMenu && !gearBtn.dataset.rtTutorialBound) {
        gearBtn.dataset.rtTutorialBound = '1';
        gearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const open = gearMenu instanceof HTMLElement && gearMenu.style.display !== 'none';
            if (open) {
                closeGearMenu();
            } else if (gearMenu instanceof HTMLElement) {
                syncGearUi();
                gearMenu.style.display = 'flex';
                gearBtn.setAttribute('aria-expanded', 'true');
            }
        });
        document.addEventListener('click', (e) => {
            if (!(e.target instanceof Element)) return;
            if (e.target.closest('.rt-chat-gear-wrap')) return;
            closeGearMenu();
        });
    }

    const loreChk = panel.querySelector('#rt-chat-inject-lore');
    if (loreChk instanceof HTMLInputElement && !loreChk.dataset.rtTutorialBound) {
        loreChk.dataset.rtTutorialBound = '1';
        loreChk.addEventListener('change', () => {
            _prefs.injectLore = !!loreChk.checked;
            savePrefs(_prefs);
        });
    }

    const memoChk = panel.querySelector('#rt-chat-inject-memo');
    if (memoChk instanceof HTMLInputElement && !memoChk.dataset.rtTutorialBound) {
        memoChk.dataset.rtTutorialBound = '1';
        memoChk.addEventListener('change', () => {
            _prefs.injectMemo = !!memoChk.checked;
            savePrefs(_prefs);
        });
    }

    const agentTab = panel.querySelector('#rt-panel-mode-agent');
    if (agentTab && !agentTab.dataset.rtTutorialBound) {
        agentTab.dataset.rtTutorialBound = '1';
        agentTab.addEventListener('click', () => {
            if (_chatOpen) exitTutorialMode();
        }, true);
    }
}
