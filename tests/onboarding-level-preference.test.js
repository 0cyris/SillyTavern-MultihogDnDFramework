import { describe, expect, it } from 'vitest';
import { resolveOnboardingLevelPreference } from '../constants.js';

describe('resolveOnboardingLevelPreference', () => {
    it('preserves the none sentinel for no-level systems', () => {
        expect(resolveOnboardingLevelPreference('none')).toEqual({
            selectValue: 'none',
            stored: 'none',
            noLevel: true,
            level: null,
        });
        expect(resolveOnboardingLevelPreference(null)).toEqual({
            selectValue: 'none',
            stored: 'none',
            noLevel: true,
            level: null,
        });
    });

    it('normalizes numeric levels and rejects invalid values', () => {
        expect(resolveOnboardingLevelPreference(5)).toEqual({
            selectValue: '5',
            stored: 5,
            noLevel: false,
            level: 5,
        });
        expect(resolveOnboardingLevelPreference('12')).toEqual({
            selectValue: '12',
            stored: 12,
            noLevel: false,
            level: 12,
        });
        expect(resolveOnboardingLevelPreference('bogus').level).toBe(1);
        expect(resolveOnboardingLevelPreference(99).level).toBe(20);
    });
});
