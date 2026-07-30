import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RT_PROMPTS } from '../constants.js';

const RULE = "Multi-die damage: use the current line's matching die, then that label from successive lines, consuming each (2d8 = current d8 + next d8).";

describe('RNG queue multi-die damage guidance', () => {
    it('ships the concise rule in modern and legacy prompt sources', () => {
        for (const filename of ['sysprompt.txt', 'sysprompt_legacy.txt']) {
            const standalone = readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8');
            expect(standalone).toContain(RULE);
            expect(RT_PROMPTS[filename]).toContain(RULE);
        }
    });
});
