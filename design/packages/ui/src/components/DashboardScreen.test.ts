// @vitest-environment jsdom

/**
 * The frozen dashboard.
 *
 * Reported from a real build: "Server dashboard" stuck on "Refreshing all rows with bounded
 * concurrency...", no rows, and a Cancel button that did nothing. The renderer clears its busy
 * flag in a `finally`, so it looked impossible - until you notice that `finally` never runs for a
 * promise that stays pending. A request that is only settled by a reply hangs forever when the
 * reply never comes, and no `catch` anywhere can save it.
 *
 * Two things are asserted here and they fail differently:
 *
 * - Cancel must end the wait locally. It used to send `dashboardCancel` and leave the spinner
 *   alone, which meant the one control offered for a stuck refresh depended on the stuck refresh
 *   settling. That is the worst possible arrangement.
 * - A request that never answers must eventually become an honest error rather than a permanent
 *   spinner.
 *
 * The bridge below never settles on purpose. That is the whole point: a bridge that resolves
 * proves nothing about this, and every existing check used one.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";

import DashboardScreen from "./DashboardScreen.vue";

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;
    if (globalThis.matchMedia === undefined) {
        Object.defineProperty(globalThis, "matchMedia", {
            writable: true,
            value: (query: string) => ({
                matches: false,
                media: query,
                addEventListener: () => {},
                removeEventListener: () => {},
                addListener: () => {},
                removeListener: () => {},
                dispatchEvent: () => false,
            }),
        });
    }
});

const vuetify = createVuetify();
const i18n = createI18n({
    legacy: false,
    locale: "en",
    fallbackLocale: "en",
    missingWarn: false,
    fallbackWarn: false,
    messages: { en: {} },
});

/** Never resolves, never rejects. Exactly what a stalled main process looks like from here. */
function neverSettles<T>(): Promise<T> {
    return new Promise<T>(() => {});
}

let wrapper: VueWrapper | null = null;

function mountWithStalledBridge(): VueWrapper {
    const cancel = vi.fn(async () => ({ cancelled: true }));
    // Attached to jsdom's own window rather than replacing it: overwriting `window` takes
    // `document` with it, and Vuetify's mount needs both.
    (window as unknown as { worldlens: unknown }).worldlens = {
        dashboardSnapshot: () => neverSettles(),
        dashboardRefresh: () => neverSettles(),
        dashboardCancel: cancel,
    };
    wrapper = mount(DashboardScreen, { global: { plugins: [vuetify, i18n] } });
    return wrapper;
}

function dashboardVm(view: VueWrapper): { loading: boolean; cancelRefresh: () => void; errorMessage: string } {
    return view.vm as unknown as { loading: boolean; cancelRefresh: () => void; errorMessage: string };
}

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.useRealTimers();
});

describe("the dashboard cannot be left frozen by a request that never answers", () => {
    it("clears the busy state when Cancel is pressed, without waiting for the stuck request", async () => {
        const view = mountWithStalledBridge();
        await nextTick();

        // The reported state: busy, with nothing to show.
        expect(dashboardVm(view).loading, "the mount's own request is still pending, so it is busy").toBe(true);

        dashboardVm(view).cancelRefresh();
        await nextTick();

        expect(
            dashboardVm(view).loading,
            "Cancel must end the wait here rather than relying on a request that may never settle",
        ).toBe(false);
    });

    it("gives up on its own after the deadline, so an unanswered request becomes an error", async () => {
        vi.useFakeTimers();
        const view = mountWithStalledBridge();
        await nextTick();
        expect(dashboardVm(view).loading).toBe(true);

        await vi.advanceTimersByTimeAsync(61_000);
        await nextTick();

        expect(dashboardVm(view).loading, "the deadline must release the spinner").toBe(false);
        expect(
            String(dashboardVm(view).errorMessage),
            "and it must say what happened rather than silently showing an empty dashboard",
        ).toMatch(/did not answer/i);
    });
});
