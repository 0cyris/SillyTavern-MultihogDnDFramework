export function normalizeWizardTrackerTag(value) {
    return String(value || '').toUpperCase().trim()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'CUSTOM';
}

/** Extract the last complete sample block matching the wizard's tracker tag. */
export function extractGameSystemWizardTemplate(trackerContent, trackerTag) {
    const tag = normalizeWizardTrackerTag(trackerTag);
    const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const blockPattern = new RegExp(`\\[${escapedTag}\\]([\\s\\S]*?)\\[\\/${escapedTag}\\]`, 'gi');
    const matches = [...String(trackerContent || '').matchAll(blockPattern)];
    return matches.length ? String(matches[matches.length - 1][1] || '').trim() : '';
}

/** Build the temporary state memo rendered by the wizard UI preview. */
export function buildGameSystemWizardPreviewMemo(trackerContent, trackerTag) {
    const tag = normalizeWizardTrackerTag(trackerTag);
    const template = extractGameSystemWizardTemplate(trackerContent, tag);
    return template ? `[${tag}]\n${template}\n[/${tag}]` : '';
}
