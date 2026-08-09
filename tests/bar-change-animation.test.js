import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('../portrait-storage.js', () => ({
    lookupCustomPortraitSrc: () => '',
}));

import {
    getBarChangeTransition,
    getBarTrickleDuration,
    getBarTrickleFrame,
} from '../src/ui/panel/bar-change-animation.js';
import { getSettings } from '../state-manager.js';
import { blockToItems, tryRenderMarker } from '../renderer.js';

const snapshot = (current, overrides = {}) => ({
    id: 'NPC:Alice:Morale',
    current,
    max: 100,
    kind: 'linear',
    animateChanges: true,
    ...overrides,
});

afterEach(() => {
    getSettings().barColors = {};
    getSettings().animateAllCustomBarChanges = true;
});

describe('universal bar change animation', () => {
    it('calculates gain and loss segments from the previous rendered value', () => {
        expect(getBarChangeTransition(snapshot(25), snapshot(40))).toEqual({
            delta: 15,
            fromPct: 25,
            toPct: 40,
            segmentLeftPct: 25,
            segmentWidthPct: 15,
        });
        expect(getBarChangeTransition(snapshot(70), snapshot(55))).toEqual({
            delta: -15,
            fromPct: 70,
            toPct: 55,
            segmentLeftPct: 55,
            segmentWidthPct: 15,
        });
    });

    it('does not animate disabled bars, initial renders, unchanged values, or scale changes', () => {
        expect(getBarChangeTransition(null, snapshot(20))).toBeNull();
        expect(getBarChangeTransition(snapshot(20), snapshot(30, { animateChanges: false }))).toBeNull();
        expect(getBarChangeTransition(snapshot(20), snapshot(20))).toBeNull();
        expect(getBarChangeTransition(snapshot(20), snapshot(30, { max: 200 }))).toBeNull();
    });

    it('maps signed BARREL values around their centre marker, including zero crossings', () => {
        const transition = getBarChangeTransition(
            snapshot(-40, { kind: 'barrel' }),
            snapshot(20, { kind: 'barrel' }),
        );
        expect(transition).toMatchObject({
            delta: 60,
            fromPct: 30,
            toPct: 60,
            segmentLeftPct: 30,
            segmentWidthPct: 30,
        });
    });

    it('uses the same trickle duration for equivalent proportional changes', () => {
        expect(getBarTrickleDuration(-1, 5)).toBe(getBarTrickleDuration(-200, 1000));
        expect(getBarTrickleDuration(50, 100)).toBeGreaterThan(getBarTrickleDuration(10, 100));
        expect(getBarTrickleDuration(0, 100)).toBe(0);
    });

    it('counts the floating delta down while moving the visible bar value', () => {
        expect(getBarTrickleFrame(5, -1, 5, 'linear', 0.5)).toEqual({
            current: 4.5,
            remaining: 0.5,
            positionPct: 90,
        });
        expect(getBarTrickleFrame(-40, 60, 100, 'barrel', 0.5)).toEqual({
            current: -10,
            remaining: 30,
            positionPct: 45,
        });
    });

    it('emits stable machine-readable state for an opted-in custom ((BAR))', () => {
        getSettings().barColors['NPC::Morale'] = {
            mode: 'solid',
            color: '#123456',
            animateChanges: true,
        };
        const html = tryRenderMarker('Morale: ((BAR)) 20/100', 'NPC');

        expect(html).toContain('data-rt-bar-id="NPC::Morale"');
        expect(html).toContain('data-rt-bar-current="20"');
        expect(html).toContain('data-rt-bar-max="100"');
        expect(html).toContain('data-rt-bar-animate="true"');
    });

    it('globally enables custom BAR and BARREL markers without affecting native or other marker bars', () => {
        getSettings().animateAllCustomBarChanges = true;

        const customBar = tryRenderMarker('Morale: ((BAR)) 20/100', 'NPC');
        const customBarrel = tryRenderMarker('Trust: ((BARREL)) -20/100', 'NPC');
        const customProgress = tryRenderMarker('Build: ((PROGRESS)) 2/10', 'NPC');
        const nativeHp = blockToItems('PARTY', 'Alice: 20/100 HP').join('');

        expect(customBar).toContain('data-rt-bar-animate="true"');
        expect(customBarrel).toContain('data-rt-bar-animate="true"');
        expect(customProgress).toContain('data-rt-bar-animate="false"');
        expect(nativeHp).toContain('data-rt-bar-animate="false"');
    });

    it('ships with universal custom-bar animation enabled by default', async () => {
        const { buildDefaultSettings } = await import('../src/state/defaults.js');
        expect(buildDefaultSettings().animateAllCustomBarChanges).toBe(true);
    });

    it('wires the per-bar toggle, refresh capture/playback, and gain/loss styles', () => {
        const themeManager = readFileSync(new URL('../theme-manager.js', import.meta.url), 'utf8');
        const index = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
        const styles = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

        expect(themeManager).toContain('id="animate-bar-changes"');
        expect(themeManager).toContain('cfg.animateChanges');
        expect(index).toContain('captureBarChangeAnimationState(el, xpAnimationContext)');
        expect(index).toContain('playBarChangeAnimations(el, capturedBars, xpAnimationContext)');
        expect(index).toContain("$('#rpg_tracker_animate_all_custom_bars')");
        expect(styles).toContain('.rt-bar-delta-gain');
        expect(styles).toContain('.rt-bar-delta-loss');
        expect(styles).toContain('.rt-bar-change-floater');
        expect(styles).toContain('.rt-bar-change-releasing');
        expect(index).toContain('playBarChangeAnimations');
    });
});
