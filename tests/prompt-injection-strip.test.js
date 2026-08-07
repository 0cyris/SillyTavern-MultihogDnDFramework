import { describe, expect, it } from 'vitest';
import { stripCyoaAndPacingInjections, stripPromptInjectionsFromUserText } from '../memo-processor.js';

describe('prompt injection stripping', () => {
    it('recovers typed text after CURRENT USER INPUT and strips core blocks', () => {
        const polluted = `<high_agency_mode_on>
- Emphasize player-agency.
</high_agency_mode_on>

<CYOA_mode>
choices here
</CYOA_mode>

[RNG_QUEUE v7.0]
1. d20=1
[/RNG_QUEUE]

<state_memo>
TRACKER STATE 0 below is the authoritative, read-only resource state for this turn.
</state_memo>

## TRACKER STATE 0 (Current)
HP: 10

### CURRENT USER INPUT
I look around the room
`;
        expect(stripPromptInjectionsFromUserText(polluted)).toBe('I look around the room');
    });

    it('strips only CYOA/pacing from older turns, leaving RNG', () => {
        const older = `<output_length>
- Keep short.
</output_length>

<CYOA_mode>old</CYOA_mode>

[RNG_QUEUE v7.0]
1. d20=5
[/RNG_QUEUE]

### CURRENT USER INPUT
hello`;
        const cleaned = stripCyoaAndPacingInjections(older);
        expect(cleaned).not.toContain('<CYOA_mode>');
        expect(cleaned).not.toContain('<output_length>');
        expect(cleaned).toContain('[RNG_QUEUE v7.0]');
        expect(cleaned).toContain('hello');
    });
});
