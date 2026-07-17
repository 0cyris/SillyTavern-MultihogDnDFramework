#!/usr/bin/env node
/**
 * preview.mjs — render a cartridge + sample state memo into a standalone
 * HTML preview of the extension's tracker panel, using the extension's REAL
 * renderer (renderMemoAsCards / renderQuestLog) under Node.
 *
 *   node preview.mjs <cartridge.json> --memo <sample-memo.txt>
 *                    [--out <file.html>] [--theme native|hacker|fantasy|hologram|pacific|cherry]
 *                    [--time "HH:MM AM, Day N"]
 *
 * Scope: static card view + quest log. Tab mode, portraits, pagination and
 * detached panels are intentionally out of scope. Output is fully
 * self-contained (extension style.css embedded, no network requests).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootFramework, buildSettingsFromCartridge } from './lib/framework-loader.mjs';
import { readCartridge, sanitizeCartridgeIcon } from './lib/cartridge-io.mjs';

const ASSETS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const THEMES = ['native', 'hacker', 'fantasy', 'hologram', 'pacific', 'cherry'];

function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildChips(settings) {
    const chips = [];
    for (const [key, enabled] of Object.entries(settings.modules || {})) {
        chips.push(`<span class="gc-preview-chip${enabled ? '' : ' off'}">${escapeHtml(key)}</span>`);
    }
    for (const f of settings.customFields || []) {
        chips.push(`<span class="gc-preview-chip${f.enabled === false ? ' off' : ''}">${escapeHtml(f.icon || '')} ${escapeHtml(f.tag)}</span>`);
    }
    return chips.join('');
}

async function main() {
    const args = process.argv.slice(2);
    const getFlag = (name) => {
        const i = args.indexOf(name);
        return i !== -1 ? args[i + 1] : null;
    };
    const positional = args.filter((a, i) => !a.startsWith('--') && !['--memo', '--out', '--theme', '--time'].includes(args[i - 1]));
    const inputPath = positional[0];
    const memoPath = getFlag('--memo');
    const theme = getFlag('--theme') || 'hacker';
    const timeOverride = getFlag('--time');
    if (!inputPath || !memoPath) {
        console.error('Usage: preview.mjs <cartridge.json> --memo <sample-memo.txt> [--out <file.html>] [--theme <name>] [--time "..."]');
        process.exit(2);
    }
    if (!THEMES.includes(theme)) {
        console.error(`Unknown theme "${theme}". Valid: ${THEMES.join(', ')}`);
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
    const memo = readFileSync(path.resolve(memoPath), 'utf8').trim();
    if (!memo) {
        console.error('Sample memo file is empty — the renderer would show the onboarding screen instead of the tracker.');
        process.exit(2);
    }

    const settings = buildSettingsFromCartridge(fw, payload);
    // Bypass pagination so every entry of every section renders.
    const allTags = [...Object.keys(fw.renderer.parseMemoBlocks(memo) || {})];
    settings.fullViewSections = allTags;
    settings.currentMemo = memo;

    // Main card view via the real renderer.
    let content = fw.renderer.renderMemoAsCards(memo, null, {});

    // Quest log (skipped by the card renderer) via its dedicated renderer.
    if (settings.modules?.quests !== false && /\[QUESTS\]/i.test(memo)) {
        try {
            const quests = fw.memoProcessor.parseQuestsFromMemo(memo);
            if (quests.length) {
                const currentTime = timeOverride || fw.memoProcessor.extractCurrentTimeStr?.(memo) || '';
                content += fw.renderer.renderQuestLog(quests, currentTime, new Set(), new Set(), null);
            }
        } catch (err) {
            content += `<div class="rt-empty">Quest log failed to render: ${escapeHtml(err.message)}</div>`;
        }
    }

    const template = readFileSync(path.join(ASSETS_DIR, 'preview-template.html'), 'utf8');
    const name = wrapper.name || path.basename(inputPath);
    const html = template
        .split('__TITLE__').join(escapeHtml(`${name} — cartridge preview`))
        .split('__ICON__').join(escapeHtml(sanitizeCartridgeIcon(wrapper.icon)))
        .split('__NAME__').join(escapeHtml(name))
        .split('__DESCRIPTION__').join(escapeHtml(wrapper.description || 'No description'))
        .split('__CHIPS__').join(buildChips(settings))
        .split('__THEME__').join(`rt-theme-${theme}`)
        .split('__CONTENT__').join(content)
        .split('__FOOTER__').join(escapeHtml(`Generated ${new Date().toISOString()} · theme: ${theme} · Multihog game-cartridge skill preview (static card view)`))
        .split('__STYLE_CSS__').join(fw.styleCss)
        .split('__OVERRIDES_CSS__').join(readFileSync(path.join(ASSETS_DIR, 'preview-overrides.css'), 'utf8'));

    const outPath = getFlag('--out') || path.resolve(inputPath).replace(/\.json$/i, '') + '.preview.html';
    writeFileSync(outPath, html);
    console.log(`Wrote ${outPath} (${(html.length / 1024).toFixed(0)} KB, ${allTags.length} memo block(s): ${allTags.join(', ')})`);
}

main().catch((err) => { console.error(err.stack || String(err)); process.exit(2); });
