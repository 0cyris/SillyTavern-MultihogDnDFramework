import { describe, expect, it } from 'vitest';
import { isEffectiveSectionEnabled } from '../src/state/section-enabled.js';

describe('effective system-prompt section state', () => {
    it('keeps an enabled unlocked CYOA override active when the base toggle is off', () => {
        const settings = {
            syspromptModules: { CYOA_mode: false },
            customSyspromptLibrary: [{
                origin: 'unlocked_base',
                baseTag: 'CYOA_mode',
                enabled: true,
            }],
        };

        expect(isEffectiveSectionEnabled('CYOA_mode', settings)).toBe(true);
    });

    it('respects a disabled unlocked CYOA override', () => {
        const settings = {
            syspromptModules: { CYOA_mode: true },
            customSyspromptLibrary: [{
                origin: 'unlocked_base',
                baseTag: 'CYOA_mode',
                enabled: false,
            }],
        };

        expect(isEffectiveSectionEnabled('CYOA_mode', settings)).toBe(false);
    });
});
