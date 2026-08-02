import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { buildSkeletonLorebookSourceContext } from '../src/features/world-progression/skeleton-lorebooks.js';

const settingsMarkup = readFileSync(new URL('../settings.html', import.meta.url), 'utf8');
const routerSource = readFileSync(new URL('../router.js', import.meta.url), 'utf8');
const persistenceSource = readFileSync(new URL('../src/state/chat-persistence.js', import.meta.url), 'utf8');

describe('World Skeleton lorebook source context', () => {
    it('injects full selected lorebook entries as established canon', async () => {
        const loadWorldInfo = vi.fn(async name => ({
            entries: {
                1: { comment: 'The Brass Court', content: 'A mercantile council controls the harbor.', disable: true },
                2: { key: ['Glassward'], content: 'A district built over volcanic glass.' },
            },
            name,
        }));

        const result = await buildSkeletonLorebookSourceContext(['Existing World'], loadWorldInfo);

        expect(result).toContain('## EXISTING LOREBOOK SOURCE MATERIAL');
        expect(result).toContain('### LOREBOOK: Existing World');
        expect(result).toContain('#### The Brass Court');
        expect(result).toContain('A mercantile council controls the harbor.');
        expect(result).toContain('#### Glassward');
        expect(result).toContain('established world canon');
    });

    it('excludes skeleton books and tolerates unavailable selected books', async () => {
        const loadWorldInfo = vi.fn(async name => {
            if (name === 'Missing') throw new Error('not found');
            return { entries: { 0: { comment: 'Canon', content: 'Kept.' } } };
        });

        const result = await buildSkeletonLorebookSourceContext(
            ['Campaign_Skeleton', 'Missing', 'Canon Book', 'Canon Book'],
            loadWorldInfo,
        );

        expect(result).toContain('### LOREBOOK: Canon Book');
        expect(result).not.toContain('Campaign_Skeleton');
        expect(loadWorldInfo).toHaveBeenCalledTimes(2);
    });

    it('wires a dedicated per-chat lorebook selector into skeleton generation', () => {
        expect(settingsMarkup).toContain('id="rpg_world_progression_skeleton_use_lorebooks"');
        expect(settingsMarkup).toContain('id="rpg_world_progression_skeleton_lorebook_list"');
        expect(routerSource).toContain('buildSkeletonLorebookSourceContext');
        expect(routerSource).toContain('worldProgressionSkeletonLorebookFilter');
        expect(persistenceSource).toContain('worldProgressionSkeletonUseLorebooks:');
        expect(persistenceSource).toContain('worldProgressionSkeletonLorebookFilter:');
    });
});
