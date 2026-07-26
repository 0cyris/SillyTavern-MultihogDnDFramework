import { describe, expect, it } from 'vitest';
import {
    REALTIME_VISUALIZATION_DISABLED_KEY,
    enforceRealtimeVisualizationDisabled,
    isRealtimeVisualizationDisabled,
    setRealtimeVisualizationDisabled,
} from '../src/state/realtime-visualization-guard.js';

function createStorage() {
    const values = new Map();
    return {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key),
    };
}

describe('Real-Time Visualization safety latch', () => {
    it('survives a stale settings snapshot until explicitly re-enabled', () => {
        const storage = createStorage();
        setRealtimeVisualizationDisabled(true, storage);

        const staleSettings = {
            portraitAutoGenerateSceneView: true,
            portraitRegenerateVisitedLocations: true,
            locationImages: true,
        };

        expect(enforceRealtimeVisualizationDisabled(staleSettings, storage)).toBe(true);
        expect(staleSettings.portraitAutoGenerateSceneView).toBe(false);
        expect(staleSettings.portraitRegenerateVisitedLocations).toBe(false);
        expect(staleSettings.locationImages).toBe(true);

        setRealtimeVisualizationDisabled(false, storage);
        staleSettings.portraitAutoGenerateSceneView = true;
        expect(enforceRealtimeVisualizationDisabled(staleSettings, storage)).toBe(false);
        expect(staleSettings.portraitAutoGenerateSceneView).toBe(true);
    });

    it('stores only the explicit disabled state', () => {
        const storage = createStorage();
        setRealtimeVisualizationDisabled(true, storage);
        expect(storage.getItem(REALTIME_VISUALIZATION_DISABLED_KEY)).toBe('true');
        expect(isRealtimeVisualizationDisabled(storage)).toBe(true);

        setRealtimeVisualizationDisabled(false, storage);
        expect(storage.getItem(REALTIME_VISUALIZATION_DISABLED_KEY)).toBeNull();
        expect(isRealtimeVisualizationDisabled(storage)).toBe(false);
    });
});
