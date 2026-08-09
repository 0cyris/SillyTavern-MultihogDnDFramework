import { describe, expect, it } from 'vitest';
import { buildOnboardingTimeHint, formatTimeOfDay } from '../constants.js';
import { parseInWorldTime } from '../memo-processor.js';

describe('formatTimeOfDay', () => {
    it('formats minutes-of-day as 12h with AM/PM', () => {
        expect(formatTimeOfDay(0, false)).toBe('12:00 AM');
        expect(formatTimeOfDay(8 * 60, false)).toBe('08:00 AM');
        expect(formatTimeOfDay(12 * 60, false)).toBe('12:00 PM');
        expect(formatTimeOfDay(13 * 60 + 30, false)).toBe('01:30 PM');
        expect(formatTimeOfDay(23 * 60 + 59, false)).toBe('11:59 PM');
    });

    it('formats minutes-of-day as 24h', () => {
        expect(formatTimeOfDay(0, true)).toBe('00:00');
        expect(formatTimeOfDay(8 * 60, true)).toBe('08:00');
        expect(formatTimeOfDay(20 * 60 + 5, true)).toBe('20:05');
    });

    it('round-trips through parseInWorldTime for both clock styles', () => {
        for (const [text, use24h] of [['08:00 AM', false], ['20:00', true], ['11:59 PM', false], ['00:00', true]]) {
            const mins = parseInWorldTime(text);
            expect(formatTimeOfDay(mins, use24h)).toBe(text);
        }
    });
});

describe('buildOnboardingTimeHint', () => {
    it('defaults to 08:00 AM when no start time is provided', () => {
        expect(buildOnboardingTimeHint('Day 1')).toContain('Current Time: 08:00 AM, Day 1');
    });

    it('uses the supplied initial time instead of the hardcoded default', () => {
        expect(buildOnboardingTimeHint('Day 1', '10:45 PM')).toContain('Current Time: 10:45 PM, Day 1');
        expect(buildOnboardingTimeHint('01/01/2026', '23:15')).toContain('Current Time: 23:15, 01/01/2026');
    });
});
