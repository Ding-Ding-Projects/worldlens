/**
 * @vitest-environment jsdom
 *
 * That every panel this lane owns actually mounts against a real store and a real bridge
 * stub, rather than only against pure helper functions.
 *
 * A component tested only through the functions it calls passes whether or not its own
 * template is wired correctly - a typo'd prop name or a missing import throws only when
 * something actually renders it. This mounts each panel once, with a minimal fake
 * `serverStore` and a minimal fake `globalThis.worldlens.mcserver` bridge, and asserts it
 * renders without throwing and shows its own honest empty/loading state.
 */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";

import ServerConsole from "./ServerConsole.vue";
import ServerConfigEditor from "./ServerConfigEditor.vue";
import PluginManager from "./PluginManager.vue";
import PlayerManager from "./PlayerManager.vue";
import WebConsolePanel from "./WebConsolePanel.vue";
import AdoptionReviewDialog from "./AdoptionReviewDialog.vue";
import { SERVER_STORE } from "./useServers.js";
import { createServerStore, type McServerHost } from "./serverStore.js";
import type { ServerRecord } from "./serverModel.js";

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;
    globalThis.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    })) as unknown as typeof globalThis.matchMedia;
});

const record: ServerRecord = {
    id: "srv-1",
    name: "Test Server",
    flavour: "paper",
    minecraftVersion: "1.21",
    ref: { kind: "local-process", serverDir: "/servers/srv-1" },
    origin: "created",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    hasRconSecret: false,
    rconPort: null,
    writeScope: [],
};

function fakeHost(): McServerHost {
    return {
        name: "fake",
        list: vi.fn().mockResolvedValue({ ok: true, value: [record] }),
        get: vi.fn().mockResolvedValue({ ok: true, value: record }),
        save: vi.fn().mockResolvedValue({ ok: true, value: record }),
        forget: vi.fn().mockResolvedValue({ ok: true }),
        probe: vi.fn().mockResolvedValue({
            ok: true,
            value: { reachable: true, runtimeVersion: "1.21", message: "", checkedAt: "2026-01-01T00:00:00Z", capabilities: { canCreate: true, canLifecycle: true, canWriteFiles: true, canDestroy: true, console: "stdin" } },
        }),
        status: vi.fn().mockResolvedValue({ ok: true, value: { state: "running", running: true, startedAt: null, exitCode: null, checkedAt: "2026-01-01T00:00:00Z" } }),
        start: vi.fn().mockResolvedValue({ ok: true }),
        stop: vi.fn().mockResolvedValue({ ok: true }),
        files: {
            list: vi.fn().mockResolvedValue({ ok: true, value: [] }),
            read: vi.fn().mockResolvedValue({ ok: false, failure: { code: "not-found", message: "not found", detail: null } }),
            write: vi.fn().mockResolvedValue({ ok: true, value: { hash: "h", size: 0, writtenAt: "2026-01-01T00:00:00Z", backupPath: null } }),
        },
        logTail: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    };
}

function stubBridge(): void {
    (globalThis as { worldlens?: unknown }).worldlens = {
        mcserver: {
            rconTest: vi.fn().mockResolvedValue({ ok: false }),
            consoleOpen: vi.fn().mockResolvedValue({ sessionId: "s1" }),
            consoleSend: vi.fn().mockResolvedValue({ ok: true }),
            consoleClose: vi.fn().mockResolvedValue({ ok: true }),
            onConsoleLine: vi.fn().mockReturnValue(() => {}),
            players: { list: vi.fn().mockResolvedValue({ ok: true, value: [] }), action: vi.fn().mockResolvedValue({ ok: true }) },
            plugins: {
                search: vi.fn().mockResolvedValue({ ok: true, value: [] }),
                versions: vi.fn().mockResolvedValue({ ok: true, value: [] }),
                install: vi.fn().mockResolvedValue({ ok: true }),
                list: vi.fn().mockResolvedValue({ ok: true, value: [] }),
                toggle: vi.fn().mockResolvedValue({ ok: true }),
                remove: vi.fn().mockResolvedValue({ ok: true }),
                updates: vi.fn().mockResolvedValue({ ok: true, value: { hasUpdate: false, latest: null } }),
            },
            adopt: { discover: vi.fn().mockResolvedValue({ ok: true, value: [] }), confirm: vi.fn().mockResolvedValue({ ok: true }), release: vi.fn().mockResolvedValue({ ok: true }) },
            webConsole: {
                status: vi.fn().mockResolvedValue({ ok: true, value: { running: false, host: "127.0.0.1", port: null, loopbackOnly: true, hasPassword: false } }),
                start: vi.fn().mockResolvedValue({ ok: true }),
                stop: vi.fn().mockResolvedValue({ ok: true }),
                setPassword: vi.fn().mockResolvedValue({ ok: true }),
                bind: vi.fn().mockResolvedValue({ ok: true }),
            },
        },
    };
}

async function mountWith(component: unknown, props: Record<string, unknown>) {
    const i18n = createI18n({ legacy: false, locale: "en", messages: { en: {} } });
    const vuetify = createVuetify();
    const store = createServerStore({ host: fakeHost() });
    await store.load();
    return mount(component as never, {
        props: props as never,
        global: {
            plugins: [i18n, vuetify],
            provide: { [SERVER_STORE as symbol]: store },
        },
    });
}

describe("mcserver panels mount against a real store and bridge", () => {
    beforeAll(stubBridge);

    it("ServerConsole mounts and shows the empty log state", async () => {
        const wrapper = await mountWith(ServerConsole, { serverId: "srv-1" });
        await flushPromises();
        expect(wrapper.text()).toContain("No log lines yet");
    });

    it("ServerConfigEditor mounts and offers the file picker", async () => {
        const wrapper = await mountWith(ServerConfigEditor, { serverId: "srv-1" });
        await flushPromises();
        expect(wrapper.findComponent({ name: "VSelect" }).exists()).toBe(true);
    });

    it("PluginManager mounts and shows the empty installed state", async () => {
        const wrapper = await mountWith(PluginManager, { serverId: "srv-1" });
        await flushPromises();
        expect(wrapper.text()).toContain("No plugins installed");
    });

    it("PlayerManager mounts and shows nobody online", async () => {
        const wrapper = await mountWith(PlayerManager, { serverId: "srv-1" });
        await flushPromises();
        expect(wrapper.text()).toContain("Nobody is online");
    });

    it("WebConsolePanel mounts with the server header and web-console tab", async () => {
        const wrapper = await mountWith(WebConsolePanel, { serverId: "srv-1" });
        await flushPromises();
        expect(wrapper.text()).toContain("Test Server");
        expect(wrapper.text()).toContain("Web console");
    });

    it("AdoptionReviewDialog mounts closed without throwing", async () => {
        const wrapper = await mountWith(AdoptionReviewDialog, { modelValue: false, record });
        await flushPromises();
        expect(wrapper.exists()).toBe(true);
    });
});
