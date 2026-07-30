import { describe, expect, it } from 'vitest';
import {
    buildNameOnlyPersonaIdentity,
    resolveActivatedPersonaDescription,
} from '../src/state/player-identity.js';
import { buildDefaultSettings } from '../src/state/defaults.js';

describe('SillyTavern player identity', () => {
    it('keeps the character name with an empty description', () => {
        expect(buildNameOnlyPersonaIdentity('Phil Powell')).toEqual({
            name: 'Phil Powell',
            description: '',
        });
    });

    it('sanitizes unsafe name characters and supplies a fallback', () => {
        expect(buildNameOnlyPersonaIdentity(`'Jane "Ace" Doe'`).name).toBe('Jane Ace Doe');
        expect(buildNameOnlyPersonaIdentity('').name).toBe('My Character');
    });

    it('recommends the name-only ST persona by default', () => {
        expect(buildDefaultSettings().onboardingCreateSillyTavernPersona).toBe(true);
    });

    it('preserves the source description only when explicitly requested', () => {
        expect(resolveActivatedPersonaDescription('Rich source Persona', true)).toBe('Rich source Persona');
        expect(resolveActivatedPersonaDescription('Rich source Persona', false)).toBe('');
        expect(resolveActivatedPersonaDescription(undefined, true)).toBe('');
    });
});
