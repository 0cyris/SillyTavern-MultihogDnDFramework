import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupResizeObserver } from '../ui-geometry.js';

const originalResizeObserver = globalThis.ResizeObserver;

afterEach(() => {
    if (originalResizeObserver === undefined) delete globalThis.ResizeObserver;
    else globalThis.ResizeObserver = originalResizeObserver;
});

describe('panel geometry compatibility', () => {
    it('continues without automatic resize persistence when ResizeObserver is unavailable', () => {
        delete globalThis.ResizeObserver;

        expect(setupResizeObserver({})).toBeNull();
    });

    it('observes the panel when ResizeObserver is available', () => {
        const observe = vi.fn();
        globalThis.ResizeObserver = class {
            constructor(callback) {
                this.callback = callback;
            }

            observe = observe;
        };
        const panel = {};

        const observer = setupResizeObserver(panel);

        expect(observer).not.toBeNull();
        expect(observe).toHaveBeenCalledWith(panel);
    });
});
