// @vitest-environment jsdom

/**
 * "But I already accepted."
 *
 * The options editor's consent row reports the Mojang download answer and offers
 * **Open the download setting** as its remedy. It read that answer once, in `onMounted`,
 * and never again - so the remedy was a dead end: the setting opened, accepting there
 * worked and persisted, and this screen went on saying "not accepted yet" for the life of
 * the window. `../world/consentState.ts` records the same defect on the world surfaces and
 * why the fix is an event rather than a poll.
 *
 * The shell bumps `settingsEpoch` every time the settings surface closes, which is the one
 * moment the record can have changed while this screen is showing. This asserts the screen
 * re-reads on that bump, against a bridge that answers "not accepted" first and "accepted"
 * afterwards - exactly the sequence a user performs.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import ConfigScreen from "./ConfigScreen.vue";

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;

    globalThis.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    })) as unknown as typeof globalThis.matchMedia;
});

const vuetify = createVuetify({ components, directives });
const i18n = createI18n({ legacy: false, locale: "en", messages: { en: {} } });

let wrapper: VueWrapper | null = null;
/** How many times the screen asked the bridge for the recorded answer. */
let reads = 0;
/** What the bridge answers next. Flipped between reads, as accepting in settings would. */
let accepted = false;

beforeEach(() => {
    reads = 0;
    accepted = false;
    (globalThis as { window?: unknown }).window = globalThis.window;
    (window as unknown as Record<string, unknown>).worldlens = {
        readConsent: () => {
            reads += 1;
            return Promise.resolve({ accepted });
        },
    };
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    delete (window as unknown as Record<string, unknown>).worldlens;
});

/** Let the mount's own awaited work settle before counting reads. */
async function settle(): Promise<void> {
    for (let i = 0; i < 8; i += 1) {
        await nextTick();
        await Promise.resolve();
    }
}

describe("the options editor and the consent record", () => {
    it("re-reads the recorded answer when the settings surface closes", async () => {
        // `host: null` is this component's documented "there is deliberately no host" value,
        // so the mount does no file work and the consent read is the behaviour under test.
        wrapper = mount(ConfigScreen, {
            props: { host: null, settingsEpoch: 0 },
            global: { plugins: [vuetify, i18n] },
        });
        await settle();

        const atMount = reads;
        expect(atMount).toBeGreaterThan(0);

        // The user opens the setting from the row's own button and accepts there.
        accepted = true;
        await wrapper.setProps({ settingsEpoch: 1 });
        await settle();

        expect(reads).toBeGreaterThan(atMount);
    });
});
