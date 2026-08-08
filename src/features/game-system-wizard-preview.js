export function normalizeWizardTrackerTag(value) {
    return String(value || '').toUpperCase().trim()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'CUSTOM';
}

/** Extract any generic block or marker lines from tracker instructions. */
export function extractGenericWizardTemplate(trackerContent) {
    let raw = String(trackerContent || '').trim();
    if (!raw) return '';
    raw = raw.replace(/^```[a-zA-Z0-9_-]*\s*\n?/gm, '').replace(/\n?```\s*$/gm, '').trim();

    // 1. Generic closed [TAG]...[/TAG] block
    const genericMatches = [...raw.matchAll(/\[([A-Z0-9_-]+)\]([\s\S]*?)\[\/\1\]/gi)];
    if (genericMatches.length) {
        return String(genericMatches[genericMatches.length - 1][2] || '').trim();
    }

    // 2. Generic open [TAG] block
    const genericOpenMatch = raw.match(/\[([A-Z0-9_-]+)\]([^\n]*\n[\s\S]*)$/i);
    if (genericOpenMatch && genericOpenMatch[2].trim()) {
        return genericOpenMatch[2].trim();
    }

    // 3. Marker lines or key-value lines
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    const markerLines = lines.filter(l => /\(\([A-Za-z0-9_#\s-]+\)\)/.test(l) || /^[^:\n]+:\s*.+$/.test(l));
    if (markerLines.length) {
        return markerLines.join('\n');
    }

    return raw;
}

/** Extract the sample block matching the wizard's tracker tag, or fallback to raw content. */
export function extractGameSystemWizardTemplate(trackerContent, trackerTag) {
    let raw = String(trackerContent || '').trim();
    if (!raw) return '';
    // Strip markdown code fences if present
    raw = raw.replace(/^```[a-zA-Z0-9_-]*\s*\n?/gm, '').replace(/\n?```\s*$/gm, '').trim();

    const tag = normalizeWizardTrackerTag(trackerTag);
    const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // 1. Exact closed [TAG]...[/TAG] block
    const blockPattern = new RegExp(`\\[${escapedTag}\\]([\\s\\S]*?)\\[\\/${escapedTag}\\]`, 'gi');
    const matches = [...raw.matchAll(blockPattern)];
    if (matches.length) {
        return String(matches[matches.length - 1][1] || '').trim();
    }

    // 2. Open [TAG] block without closing tag
    const openTagPattern = new RegExp(`\\[${escapedTag}\\]([\\s\\S]*)$`, 'i');
    const openMatch = raw.match(openTagPattern);
    if (openMatch && openMatch[1].trim()) {
        return openMatch[1].trim();
    }

    // 3. If raw has NO [TAG] tags at all, treat raw text as the template content directly
    const hasAnyTags = /\[[A-Z0-9_-]+\]/i.test(raw);
    if (!hasAnyTags) {
        return raw;
    }

    return '';
}

/** Build the temporary state memo rendered by the wizard UI preview. */
export function buildGameSystemWizardPreviewMemo(trackerContent, trackerTag) {
    const tag = normalizeWizardTrackerTag(trackerTag);
    let template = extractGameSystemWizardTemplate(trackerContent, tag);
    if (!template) {
        template = extractGenericWizardTemplate(trackerContent);
    }
    return template ? `[${tag}]\n${template}\n[/${tag}]` : '';
}


