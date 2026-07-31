import { describe, expect, it } from 'vitest';
import {
    createPanel,
    resolveInitialPanelContentMode,
    resolveModeAfterAgentAttach,
} from '../src/ui/panel/panel-builder.js';
import { runtimeState } from '../src/app/runtime-state.js';

describe('panel builder', () => {
    it('loads independently from the application entry point', () => {
        expect(typeof createPanel).toBe('function');
        expect(runtimeState).toMatchObject({
            currentChatId: null,
            historyViewIndex: -1,
            renderedViewActive: false,
        });
    });

    it('restores the tracker pane when the agent is attached during CHAT', () => {
        expect(resolveModeAfterAgentAttach(true, 'agent')).toBe('tracker');
        expect(resolveModeAfterAgentAttach(false, 'agent')).toBe('agent');
        expect(resolveModeAfterAgentAttach(false, 'tracker')).toBe('tracker');
    });

    it('always opens a rebuilt UI on State Tracker regardless of the saved tab', () => {
        expect(resolveInitialPanelContentMode('agent')).toBe('tracker');
        expect(resolveInitialPanelContentMode('tracker')).toBe('tracker');
        expect(resolveInitialPanelContentMode(undefined)).toBe('tracker');
    });
});
