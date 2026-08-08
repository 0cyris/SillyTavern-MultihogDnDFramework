import { describe, expect, it } from 'vitest';
import { synchronizeAllPromptsAndInstructions } from '../src/state/settings.js';
import { buildDefaultSettings } from '../src/state/defaults.js';
import { DEFAULT_NPC_SECTIONS } from '../src/state/schema-sections.js';

describe('Universal Plain-Text Prompt & Instruction Synchronization', () => {
    it('resolves maxActivations across all prompt templates without leaving raw macros', () => {
        const settings = buildDefaultSettings();
        settings.routerMaxActivations = 12;
        synchronizeAllPromptsAndInstructions(settings);

        expect(settings.routerBasicSystemPromptTemplate).toContain('You are limited to **12 active entries**');
        expect(settings.routerBasicSystemPromptTemplate).not.toContain('{{maxActivations}}');

        expect(settings.routerAgentSharedContextTemplate).toContain('Maximum Active Entities: **12**');
        expect(settings.routerAgentSharedContextTemplate).not.toContain('{{maxActivations}}');
    });

    it('resolves dynamic NPC core sections into instructions and prompt text', () => {
        const settings = buildDefaultSettings();
        settings.npcCoreSections = [
            { id: 'sec_species', name: 'Ancestry', icon: '🧬', color: '#ff0000', description: 'Ancestry detail' },
            { id: 'sec_body', name: 'Physique', icon: '💪', color: '#00ff00', description: 'Physique detail' },
            { id: 'sec_personality', name: 'Demeanor', icon: '🎭', color: '#0000ff', description: 'Demeanor detail' }
        ];

        synchronizeAllPromptsAndInstructions(settings);

        const expectedSectionList = 'Ancestry, Physique, Demeanor';
        expect(settings.routerBasicSystemPromptTemplate).toContain(`structured \`[CORE]\` with ${expectedSectionList}`);
        expect(settings.routerBasicSystemPromptTemplate).toContain(`Eligible UPDATE_CORE fields this pass: ${expectedSectionList}`);
        expect(settings.routerBasicSystemPromptTemplate).toContain(`ONLY the sections instructed below (${expectedSectionList}) for NPCs`);
        expect(settings.routerAgentSharedContextTemplate).toContain(`Eligible commit.core fields this pass: ${expectedSectionList}`);
        expect(settings.routerBasicSystemPromptTemplate).not.toContain('{{sectionNames}}');
        expect(settings.routerBasicSystemPromptTemplate).not.toContain('{{eligibleCoreFields}}');
        expect(settings.routerModules.npc.instruction).toContain('Ancestry');
        expect(settings.routerModules.npc.instruction).toContain('Physique');
        expect(settings.routerModules.npc.instruction).toContain('Demeanor');
    });

    it('resolves campaign prefix override into prompt templates', () => {
        const settings = buildDefaultSettings();
        settings.routerCampaignPrefixOverride = 'Shadowfell';

        synchronizeAllPromptsAndInstructions(settings);

        expect(settings.routerAgentSharedContextTemplate).toContain('Campaign Root: "Shadowfell"');
        expect(settings.routerAgentSharedContextTemplate).toContain('NPCs -> "Shadowfell_NPCs"');
        expect(settings.routerAgentSharedContextTemplate).toContain('Locations -> "Shadowfell_Locations"');
        expect(settings.routerAgentSharedContextTemplate).not.toContain('{{campaignRoot}}');
        expect(settings.routerAgentSharedContextTemplate).not.toContain('{{campaignNpcBook}}');
        expect(settings.routerAgentSharedContextTemplate).not.toContain('{{campaignLocBook}}');
    });

    it('resolves relationship sections dynamically when enabled/disabled', () => {
        const settings = buildDefaultSettings();
        settings.npcRelationshipBars = true;
        settings.npcRelationshipMax = 200;

        synchronizeAllPromptsAndInstructions(settings);
        expect(settings.routerBasicSystemPromptTemplate).toContain('## NPC RELATIONSHIPS');
        expect(settings.routerBasicSystemPromptTemplate).toContain('Valid range: -200 to +200.');
        expect(settings.routerModules.npc.instruction).toContain('## NPC RELATIONSHIPS');
        expect(settings.routerModules.npc.instruction).toContain('Valid range: -200 to +200.');
    });

    it('replaces all macro placeholders leaving zero unexpanded template variables', () => {
        const settings = buildDefaultSettings();
        synchronizeAllPromptsAndInstructions(settings);

        const templates = [
            settings.routerBasicSystemPromptTemplate,
            settings.routerSystemPromptTemplate,
            settings.routerAgentSharedContextTemplate,
            settings.routerModularPromptTemplate
        ];

        for (const t of templates) {
            if (!t) continue;
            // Check that no {{macro}} tokens remain (except allowed ST macros like {{user}} or {{char}})
            const disallowed = t.match(/\{\{(?!user\b|char\b)[a-zA-Z0-9_]+\}\}/g);
            expect(disallowed).toBeNull();
        }
    });
});
