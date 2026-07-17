#!/usr/bin/env node
/**
 * prompt-preview.mjs — show exactly what each LLM receives from a cartridge.
 *
 *   node prompt-preview.mjs <cartridge.json> [--out <file.md>] [--narrator-only|--extractor-only]
 *
 * Narrator prompt: assembled from the live sysprompt.txt using the
 * extension's real extractTopLevelSections / normalizeSectionOrder /
 * getSectionRowDescriptor / transformBaseSectionContent. Only the ~20-line
 * orchestration loop of buildSysprompt (index.js) is mirrored here, because
 * that function reads live browser settings internally; its source hash is
 * guarded by extract-framework-data.mjs --check.
 *
 * Extractor prompt: systemPromptTemplate with {{modulesText}} expanded via
 * the real buildModulesInstructionText.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { bootFramework, buildSettingsFromCartridge } from './lib/framework-loader.mjs';
import { readCartridge } from './lib/cartridge-io.mjs';

/** Mirror of buildSysprompt (index.js) — orchestration only, hash-guarded. */
function assembleNarratorPrompt(fw, settings, rawText) {
    const { extractTopLevelSections, normalizeSectionOrder, getSectionRowDescriptor, transformBaseSectionContent, isBlankSectionContent } = fw.gameSystems;
    const baseSections = extractTopLevelSections(rawText);
    const baseSectionMap = new Map(baseSections.map((sec) => [sec.tag, sec.content]));
    const order = normalizeSectionOrder(settings, baseSections);

    const rows = order.map((key) => {
        const row = getSectionRowDescriptor(key, settings, baseSectionMap);
        if (!row) return { key, kind: '(dropped)', enabled: false, content: '' };
        let content = '';
        if (row.enabled) {
            content = row.kind === 'base'
                ? transformBaseSectionContent(row.tag, row.content, settings)
                : (isBlankSectionContent(row.content) ? '' : row.content);
        }
        return { key, kind: row.kind, label: row.label, enabled: row.enabled, content: content || '' };
    });

    let content = rows.map((r) => r.content).filter(Boolean).join('\n\n');
    const modulesText = fw.memoProcessor.buildModulesInstructionText(settings);
    content = content.replace('{{modulesText}}', modulesText);
    if (!settings.rngEnabled) {
        content = content
            .replace(/.*RollTheDice(?:D100)?.*\n?/gi, '')
            .replace(/.*\[RNG_QUEUE(?:_d100)?\s+v[\d.]+[^\]]*\].*\n?/gi, '');
    }
    content = content.replace(/\n{3,}/g, '\n\n').trim();
    return { rows, content };
}

function assembleExtractorPrompt(fw, settings) {
    const modulesText = fw.memoProcessor.buildModulesInstructionText(settings);
    return String(settings.systemPromptTemplate || '').replace('{{modulesText}}', modulesText);
}

const approxTokens = (s) => Math.round(s.length / 4);

async function main() {
    const args = process.argv.slice(2);
    const files = args.filter((a) => !a.startsWith('--'));
    const outIdx = args.indexOf('--out');
    const outPath = outIdx !== -1 ? args[outIdx + 1] : null;
    const narratorOnly = args.includes('--narrator-only');
    const extractorOnly = args.includes('--extractor-only');
    const inputPath = files[0];
    if (!inputPath || (outIdx !== -1 && files.length > 2)) {
        console.error('Usage: prompt-preview.mjs <cartridge.json> [--out <file.md>] [--narrator-only|--extractor-only]');
        process.exit(2);
    }

    const fw = await bootFramework();
    let wrapper, payload;
    try {
        ({ wrapper, payload } = readCartridge(path.resolve(inputPath)));
    } catch (err) {
        console.error(String(err.message));
        process.exit(2);
    }
    const settings = buildSettingsFromCartridge(fw, payload);

    const parts = [`# Prompt preview — ${wrapper.name || path.basename(inputPath)}`, ''];

    if (!extractorOnly) {
        const { rows, content } = assembleNarratorPrompt(fw, settings, fw.sysPromptRaw);
        parts.push('## Narrator system prompt', '', '### Section order', '');
        parts.push('| # | Key | Kind | Enabled | Chars |', '|---|-----|------|---------|-------|');
        rows.forEach((r, i) => {
            parts.push(`| ${i + 1} | \`${r.key}\` | ${r.kind} | ${r.enabled ? 'yes' : 'NO'} | ${r.content.length} |`);
        });
        parts.push('', `### Assembled prompt (${content.length} chars, ~${approxTokens(content)} tokens)`, '', '```', content, '```', '');
    }
    if (!narratorOnly) {
        const extractor = assembleExtractorPrompt(fw, settings);
        parts.push('## State-extractor system prompt', '', `(${extractor.length} chars, ~${approxTokens(extractor)} tokens — includes {{modulesText}} expansion)`, '', '```', extractor, '```', '');
    }

    const md = parts.join('\n');
    if (outPath) {
        writeFileSync(path.resolve(outPath), md);
        console.log(`Wrote ${outPath}`);
    } else {
        console.log(md);
    }
}

main().catch((err) => { console.error(err.stack || String(err)); process.exit(2); });
