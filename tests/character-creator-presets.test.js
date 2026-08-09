import { describe, expect, it } from 'vitest';
import {
    findCharacterCreatorPresetByName,
    upsertCharacterCreatorPreset,
} from '../src/features/character-creator/presets.js';

describe('Character Creator presets', () => {
    it('detects duplicate names case-insensitively and ignores surrounding whitespace', () => {
        const presets = [{ id: 'one', name: 'My Hero', data: { level: 1 } }];
        expect(findCharacterCreatorPresetByName(presets, '  my hero  ')).toBe(presets[0]);
    });

    it('overwrites a same-name preset without creating a duplicate or changing its id', () => {
        const presets = [{ id: 'one', name: 'My Hero', data: { level: 1 } }];
        const result = upsertCharacterCreatorPreset(
            presets,
            'my hero',
            { level: 5 },
            () => 'new-id',
        );

        expect(result.overwritten).toBe(true);
        expect(result.presets).toHaveLength(1);
        expect(result.preset).toEqual({ id: 'one', name: 'my hero', data: { level: 5 } });
    });

    it('creates a new preset when the name is unique', () => {
        const result = upsertCharacterCreatorPreset([], 'New Hero', { level: 2 }, () => 'new-id');
        expect(result.overwritten).toBe(false);
        expect(result.presets).toEqual([{ id: 'new-id', name: 'New Hero', data: { level: 2 } }]);
    });
});
