import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/ui/panel/panel-builder.js', import.meta.url), 'utf8');

describe('Add NPC to Story portrait generation', () => {
    it('queues the saved NPC entry when NPC auto-generation is enabled', () => {
        const creatorStart = source.indexOf('const createNpcFromCharCard = async');
        const creatorEnd = source.indexOf('const minimalReviewNpcWithAI = async', creatorStart);
        const creator = source.slice(creatorStart, creatorEnd);

        expect(creatorStart).toBeGreaterThanOrEqual(0);
        expect(creator).toContain('s.portraitAutoGenerateNpcs');
        expect(creator).toContain('triggerBackgroundPortraitGeneration(name, refreshAll, content)');
        expect(creator.indexOf("fetch('/api/worldinfo/edit'")).toBeLessThan(
            creator.indexOf('triggerBackgroundPortraitGeneration(name, refreshAll, content)'),
        );
    });
});
