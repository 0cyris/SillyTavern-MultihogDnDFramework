import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { MODULE_BOOK_CATEGORY, DEFAULT_MODULES } from '../src/state/default-modules.js';

const indexSource = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const panelBuilderSource = readFileSync(new URL('../src/ui/panel/panel-builder.js', import.meta.url), 'utf8');

describe('MODULE_BOOK_CATEGORY', () => {
    it('maps every stock module id to the exact lorebook name suffix the router files entries into', () => {
        // Must mirror router.js's catMap so the UI can never drift from what actually gets written.
        expect(MODULE_BOOK_CATEGORY).toEqual({
            npc: 'NPCs',
            loc: 'Locations',
            fac: 'Factions',
            quest: 'Quests',
            event: 'Events',
            world: 'World',
        });
    });

    it('has an entry for every key in DEFAULT_MODULES', () => {
        for (const id of Object.keys(DEFAULT_MODULES)) {
            expect(MODULE_BOOK_CATEGORY[id]).toBeTruthy();
        }
    });
});

describe('Modular Repertoire UI shows real lorebook names, not just raw tags', () => {
    it('index.js threads MODULE_BOOK_CATEGORY into createPanel dependencies', () => {
        expect(indexSource).toContain('MODULE_BOOK_CATEGORY,');
    });

    it('panel-builder.js labels stock module rows with the friendly book category and the tag in parentheses', () => {
        expect(panelBuilderSource).toContain('const bookCategory = MODULE_BOOK_CATEGORY?.[id];');
        expect(panelBuilderSource).toContain('${bookCategory} <span style="opacity:0.6; font-weight:normal;"');
    });

    it('custom tag rows show a live preview of the resulting lorebook name', () => {
        expect(panelBuilderSource).toContain("bookPreview.textContent = tag.tag ? `→ ..._${previewName(tag.tag)}` : '';");
        expect(panelBuilderSource).toContain("bookPreview.textContent = tagInp.value ? `→ ..._${previewName(tagInp.value)}` : '';");
    });
});
