import { describe, expect, it } from 'vitest';
import { isPercentFormula, resolveDiceCompare } from '../src/state/dice-compare.js';

describe('isPercentFormula', () => {
    it('accepts pure d100 formulas', () => {
        expect(isPercentFormula('1d100')).toBe(true);
        expect(isPercentFormula('d100')).toBe(true);
        expect(isPercentFormula('1d100+5')).toBe(true);
        expect(isPercentFormula('1d100-2')).toBe(true);
    });

    it('rejects skill / mixed formulas', () => {
        expect(isPercentFormula('1d20')).toBe(false);
        expect(isPercentFormula('1d20+7')).toBe(false);
        expect(isPercentFormula('2d6+3')).toBe(false);
        expect(isPercentFormula('1d20+1d100')).toBe(false);
        expect(isPercentFormula('')).toBe(false);
    });
});

describe('resolveDiceCompare', () => {
    it('honors an explicit compare', () => {
        expect(resolveDiceCompare('lte', '1d20')).toBe('lte');
        expect(resolveDiceCompare('gte', '1d100')).toBe('gte');
        expect(resolveDiceCompare('LTE', '1d20')).toBe('lte');
    });

    it('defaults d100 to lte and everything else to gte', () => {
        expect(resolveDiceCompare(undefined, '1d100')).toBe('lte');
        expect(resolveDiceCompare('', 'd100')).toBe('lte');
        expect(resolveDiceCompare(undefined, '1d20+3')).toBe('gte');
        expect(resolveDiceCompare(null, '2d6')).toBe('gte');
    });
});
