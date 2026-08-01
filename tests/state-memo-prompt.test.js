import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RT_PROMPTS } from '../constants.js';

const RULE = 'Never audit, reconstruct, reconcile, or update its resource totals from earlier narration or logs; an external tracker handles resource accounting.';
const DEPLETED_RESOURCE_GUARD = 'never use a depleted resource, e.g. cast with Level 1 at 0/4.';

describe('authoritative state memo resource guidance', () => {
    it('ships the rule in modern and legacy prompt sources and fallbacks', () => {
        for (const filename of ['sysprompt.txt', 'sysprompt_legacy.txt']) {
            const standalone = readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8');
            expect(standalone).toContain('- ## TRACKER STATE 0 (Current) - passed every turn, is mechanical law.');
            expect(standalone).toContain(RULE);
            expect(standalone).toContain(DEPLETED_RESOURCE_GUARD);
            expect(RT_PROMPTS[filename]).toContain('- ## TRACKER STATE 0 (Current) - passed every turn, is mechanical law.');
            expect(RT_PROMPTS[filename]).toContain(RULE);
            expect(RT_PROMPTS[filename]).toContain(DEPLETED_RESOURCE_GUARD);
        }
    });
});
