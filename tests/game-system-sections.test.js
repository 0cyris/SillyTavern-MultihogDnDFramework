import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
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

    it('redirects Wizard tracker-module scope clicks to Manage Game Systems', () => {
        const editorSource = readFileSync(new URL('../ui-editors.js', import.meta.url), 'utf8');

        expect(editorSource).toContain("scopeControl.className = 'rt-module-wizard-scope'");
        expect(editorSource).toContain('Open Manage Game Systems to make the bundle GLOBAL or CHAT-BOUND.');
        expect(editorSource).toContain('scopeControl.onclick = showWizardScopeRedirect');
        expect(editorSource).toMatch(/event\.key !== 'Enter' && event\.key !== ' '/);
    });
});
