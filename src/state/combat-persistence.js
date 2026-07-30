const COMBATANT_HP_RX = /^(.+?):\s*([+-]?[\d,]+)(?:\/([\d,]+))?\s*HP\b(.*)$/i;
const RESOLVED_STATUS_RX = /(?:^|\|)\s*Status\s*:\s*(?:(?:\(\([^)]*\)\)|\([^)]*\))\s*)*(?:defeated|dead)\b/i;

/**
 * @param {string} line
 * @returns {boolean}
 */
export function isResolvedCombatantStatusLine(line) {
    return RESOLVED_STATUS_RX.test(String(line || '').trim());
}

/**
 * @param {string} content
 * @returns {{ preamble: string[], entities: { name: string, lines: string[] }[] }}
 */
function parseCombatLayout(content) {
    const preamble = [];
    const entities = [];
    let current = null;

    for (const rawLine of String(content || '').split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;
        const hpMatch = line.match(COMBATANT_HP_RX);
        if (hpMatch) {
            current = { name: hpMatch[1].trim(), lines: [line] };
            entities.push(current);
        } else if (current) {
            current.lines.push(line);
        } else {
            preamble.push(line);
        }
    }

    return { preamble, entities };
}

/**
 * @param {string} content
 * @returns {{ name: string, lines: string[] }[]}
 */
export function parseCombatants(content) {
    return parseCombatLayout(content).entities;
}

/**
 * Move explicitly resolved combatants out of memo content and into a UI-only
 * archive. Zero HP alone is intentionally insufficient: dying combatants and
 * creatures with death saves remain active until their Status says Defeated or Dead.
 *
 * @param {string} content
 * @param {{ name: string, content: string }[]} [previousArchive=[]]
 * @returns {{ activeContent: string, defeatedCombatants: { name: string, content: string }[] }}
 */
export function partitionResolvedCombatants(content, previousArchive = []) {
    const { preamble, entities } = parseCombatLayout(content);
    const active = [];
    const resolved = [];

    for (const entity of entities) {
        const entityContent = entity.lines.join('\n');
        if (entity.lines.some(isResolvedCombatantStatusLine)) {
            resolved.push({ name: entity.name, content: entityContent });
        } else {
            active.push(entity);
        }
    }

    const activeNames = new Set(active.map(entity => entity.name.toLocaleLowerCase()));
    const archiveByName = new Map();
    for (const entry of Array.isArray(previousArchive) ? previousArchive : []) {
        const name = String(entry?.name || '').trim();
        const archivedContent = String(entry?.content || '').trim();
        if (!name || !archivedContent || activeNames.has(name.toLocaleLowerCase())) continue;
        archiveByName.set(name.toLocaleLowerCase(), { name, content: archivedContent });
    }
    for (const entry of resolved) {
        archiveByName.set(entry.name.toLocaleLowerCase(), entry);
    }

    return {
        activeContent: [
            ...preamble,
            ...active.flatMap(entity => entity.lines),
        ].join('\n').trim(),
        defeatedCombatants: [...archiveByName.values()],
    };
}

/**
 * Remove explicitly resolved combatants from every COMBAT block in a memo.
 * This is a fail-closed context filter for legacy saves and manual raw edits;
 * normal tracker merges already move these entries into the UI-only archive.
 *
 * @param {string} memo
 * @returns {string}
 */
export function stripResolvedCombatantsFromMemo(memo) {
    return String(memo || '').replace(
        /\[COMBAT\]([\s\S]*?)\[\/COMBAT\]/gi,
        (fullBlock, content) => {
            if (/^\s*END_COMBAT\s*$/i.test(content)) return fullBlock;
            const { activeContent } = partitionResolvedCombatants(content);
            return `[COMBAT]\n${activeContent}\n[/COMBAT]`;
        },
    );
}

/**
 * Append the UI-only defeated archive to an active COMBAT block for rendering.
 * The returned string is display-only; the supplied memo remains unchanged.
 *
 * @param {string} memo
 * @param {{ name: string, content: string }[]} archive
 * @returns {string}
 */
export function buildCombatDisplayMemo(memo, archive) {
    const entries = Array.isArray(archive)
        ? archive.filter(entry => String(entry?.name || '').trim() && String(entry?.content || '').trim())
        : [];
    if (!entries.length) return String(memo || '');

    return String(memo || '').replace(/\[COMBAT\]([\s\S]*?)\[\/COMBAT\]/i, (fullBlock, content) => {
        if (/^\s*END_COMBAT\s*$/i.test(content)) return fullBlock;
        const activeNames = new Set(parseCombatants(content).map(entity => entity.name.toLocaleLowerCase()));
        const uiEntries = entries
            .filter(entry => !activeNames.has(String(entry.name).trim().toLocaleLowerCase()))
            .map(entry => String(entry.content).trim());
        if (!uiEntries.length) return fullBlock;
        return `[COMBAT]\n${[String(content).trim(), ...uiEntries].filter(Boolean).join('\n')}\n[/COMBAT]`;
    });
}
