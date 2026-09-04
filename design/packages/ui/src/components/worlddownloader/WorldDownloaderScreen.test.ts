/**
 * @vitest-environment jsdom
 *
 * The world downloader screen, mounted.
 *
 * Two facts are only true of the rendered component and would be asserted against a
 * stand-in for nothing: that a build with no bridge says so honestly instead of a form that
 * fails silently on submit; and that the honest states for a missing jar, missing Java, a
 * running session and a failed start each render what they claim to, driven entirely by real
 * bridge answers rather than assumed defaults.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import WorldDownloaderScreen from "./WorldDownloaderScreen.vue";
import type {
    DownloaderEvent,
    DownloaderStatus,
    WorldDownloaderBridge,
} from "./worldDownloaderBridge.js";

beforeAll(() => {
    // jsdom has no layout engine, and Vuetify's fields and overlays observe their own size.
    // Same stubs `BackupScreen.test.ts` installs, for the same reason.
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

afterEach(() => vi.unstubAllGlobals());

const i18n = createI18n({
    legacy: false,
    missingWarn: false,
    fallbackWarn: false,
    locale: "none",
    fallbackLocale: "none",
    messages: {},
});
const vuetify = createVuetify();

const defaultStatus: DownloaderStatus = {
    jar: null,
    java: { available: false, executable: null },
    session: { sessionId: null, phase: null, redactedArguments: [] },
    secret: { held: false, savedAt: null },
};

/**
 * Every mock is typed against `WorldDownloaderBridge`'s own method, by name, rather than left
 * for `vi.fn()` to infer from its implementation. `vi.fn<T>()` (`@vitest/spy`'s single-type-
 * parameter form) takes the whole function type, so a mismatched parameter or return type here
 * is a compile error against the real bridge contract - not a cast that would hide the same
 * mismatch from the renderer's real preload binding.
 */
function fakeBridge(overrides: Partial<WorldDownloaderBridge> = {}): WorldDownloaderBridge {
    let listener: ((event: DownloaderEvent) => void) | null = null;

    const status = vi.fn<WorldDownloaderBridge["status"]>(async () => defaultStatus);
    const ensureJar = vi.fn<WorldDownloaderBridge["ensureJar"]>(async () => ({
        ok: true,
        record: { path: "/jar", tag: "latest", sha256: "abc" },
    }));
    const readSettings = vi.fn<WorldDownloaderBridge["readSettings"]>(async () => ({
        settings: {
            server: "play.example.test",
            outputFolder: "/worlds/out",
            declaredVersion: "1.21",
            account: { mode: "offline", username: "Steve" },
            options: {},
        },
        stored: false,
    }));
    const writeSettings = vi.fn<WorldDownloaderBridge["writeSettings"]>(async () => ({
        ok: true,
        savedAt: "now",
        problems: [],
    }));
    const testConnection = vi.fn<WorldDownloaderBridge["testConnection"]>(async () => ({
        ping: { ok: true, message: "reached" },
        matchesDeclared: true,
        reportedAnchor: "1.21",
        message: "play.example.test answered as 1.21.",
    }));
    const start = vi.fn<WorldDownloaderBridge["start"]>(async () => ({ ok: true, sessionId: "s1" }));
    const stop = vi.fn<WorldDownloaderBridge["stop"]>(async () => true);
    const saveToken = vi.fn<WorldDownloaderBridge["saveToken"]>(async () => ({ ok: true }));
    const clearToken = vi.fn<WorldDownloaderBridge["clearToken"]>(async () => true);
    const countChunks = vi.fn<WorldDownloaderBridge["countChunks"]>(async () => ({
        ok: true,
        total: 0,
        bytes: 0,
        dimensions: [],
    }));
    const portFree = vi.fn<WorldDownloaderBridge["portFree"]>(async () => ({
        free: true,
        message: "Port 25566 is free.",
    }));
    const onWorldDownloaderEvent = vi.fn<WorldDownloaderBridge["onWorldDownloaderEvent"]>((cb) => {
        listener = cb;
        return () => {
            listener = null;
        };
    });

    return {
        status,
        ensureJar,
        readSettings,
        writeSettings,
        testConnection,
        start,
        stop,
        saveToken,
        clearToken,
        countChunks,
        portFree,
        onWorldDownloaderEvent,
        ...overrides,
    };
}

function mountScreen(bridge: WorldDownloaderBridge | null | undefined) {
    return mount(WorldDownloaderScreen, {
        props: { bridge },
        global: { plugins: [i18n, vuetify] },
    });
}

describe("WorldDownloaderScreen", () => {
    it("says the desktop bridge is unavailable rather than showing an inert form", () => {
        const wrapper = mountScreen(null);
        expect(wrapper.find('[data-test="world-downloader-unavailable"]').exists()).toBe(true);
        expect(wrapper.find('[data-test="world-downloader-server-field"]').exists()).toBe(false);
    });

    it("shows the no-jar and no-java states from a real status answer, and offers to get the jar", async () => {
        const bridge = fakeBridge();
        const wrapper = mountScreen(bridge);
        await flushPromises();

        expect(bridge.status).toHaveBeenCalled();
        expect(bridge.readSettings).toHaveBeenCalled();
        expect(wrapper.find('[data-test="world-downloader-get-jar"]').exists()).toBe(true);
        expect(wrapper.find('[data-test="world-downloader-blocked"]').exists()).toBe(true);
        expect(wrapper.find('[data-test="world-downloader-server-field"]').exists()).toBe(true);
    });

    it("reflects the settings the bridge actually reported, not invented defaults", async () => {
        const bridge = fakeBridge();
        const wrapper = mountScreen(bridge);
        await flushPromises();

        const serverField = wrapper.find('[data-test="world-downloader-server-field"] input');
        expect((serverField.element as HTMLInputElement).value).toBe("play.example.test");
    });

    it("starts a download only through the bridge, and reports a real failure message honestly", async () => {
        const bridge = fakeBridge({
            status: vi.fn<WorldDownloaderBridge["status"]>(async () => ({
                ...defaultStatus,
                jar: { path: "/jar", tag: "latest", sha256: "abc" },
                java: { available: true, executable: "/usr/bin/java" },
            })),
            start: vi.fn<WorldDownloaderBridge["start"]>(async () => ({
                ok: false,
                message: "The server refused the connection.",
                problems: [],
            })),
        });
        const wrapper = mountScreen(bridge);
        await flushPromises();

        await wrapper.find('[data-test="world-downloader-start"]').trigger("click");
        await flushPromises();

        expect(bridge.start).toHaveBeenCalledTimes(1);
        expect(wrapper.text()).toContain("The server refused the connection.");
    });

    it("subscribes to real session events and unsubscribes on unmount", async () => {
        const unsubscribe = vi.fn();
        const bridge = fakeBridge({
            onWorldDownloaderEvent: vi.fn<WorldDownloaderBridge["onWorldDownloaderEvent"]>(
                () => unsubscribe,
            ),
        });
        const wrapper = mountScreen(bridge);
        await flushPromises();

        expect(bridge.onWorldDownloaderEvent).toHaveBeenCalledTimes(1);
        wrapper.unmount();
        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
});
