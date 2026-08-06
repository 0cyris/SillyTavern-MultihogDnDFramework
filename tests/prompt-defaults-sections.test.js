import { describe, expect, it } from 'vitest';
import {
    buildBundledPromptsSnapshot,
    formatCoreSectionsSnapshot,
    getLivePromptCategoryBlocks,
    getSnapshotCategoryBlocks,
    PROMPT_DEFAULTS_CATEGORIES,
    resolveCoreSections,
} from '../src/state/factory-and-diff.js';
import { DEFAULT_NPC_SECTIONS, DEFAULT_PC_SECTIONS } from '../src/state/schema-sections.js';

describe('prompt-defaults Character Sheets category', () => {
    it('includes sections in PROMPT_DEFAULTS_CATEGORIES', () => {
        expect(PROMPT_DEFAULTS_CATEGORIES).toContain('sections');
    });

    it('ships Species/Body/Equipment in the bundled sections snapshot', () => {
        const snap = buildBundledPromptsSnapshot();
        expect(snap.sections?.pcCoreSections).toContain('name: Species');
        expect(snap.sections?.pcCoreSections).toContain('name: Body');
        expect(snap.sections?.pcCoreSections).toContain('name: Equipment');
        expect(snap.sections?.npcCoreSections).toContain('name: Species');
        expect(snap.sections?.npcCoreSections).toContain('name: Body');
        expect(snap.sections?.npcCoreSections).toContain('name: Equipment');
        expect(snap.sections?.pcCoreSections).not.toContain('name: Appearance/Species');
        expect(snap.sections?.npcCoreSections).not.toContain('name: Appearance/Species');
    });

    it('treats empty stored sections as matching shipped defaults for live impact badges', () => {
        const snap = buildBundledPromptsSnapshot();
        const live = getLivePromptCategoryBlocks({ npcCoreSections: [], pcCoreSections: [] }, 'sections');
        const shipped = getSnapshotCategoryBlocks(snap, 'sections');
        expect(live).toEqual(shipped);
    });

    it('resolveCoreSections falls back to defaults for empty arrays', () => {
        expect(resolveCoreSections([], DEFAULT_PC_SECTIONS)).toBe(DEFAULT_PC_SECTIONS);
        expect(resolveCoreSections(DEFAULT_PC_SECTIONS, DEFAULT_PC_SECTIONS)).toBe(DEFAULT_PC_SECTIONS);
    });

    it('formatCoreSectionsSnapshot is stable and includes descriptions', () => {
        const text = formatCoreSectionsSnapshot(DEFAULT_PC_SECTIONS);
        expect(text).toContain('id: sec_body');
        expect(text).toContain('Do NOT describe clothing, armor, or worn gear here');
        expect(text.split('---').length).toBeGreaterThan(1);
    });
});
