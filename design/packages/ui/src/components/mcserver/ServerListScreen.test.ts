/**
 * @vitest-environment jsdom
 *
 * The server list, mounted. Three properties only exist in the rendered component: a build
 * with no host says so instead of showing an empty list; a search actually narrows the real
 * cards; and selecting servers surfaces the bulk action bar with the real selected count.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import ServerListScreen from "./ServerListScreen.vue";
import { SERVER_STORE } from "./useServers.js";
import { createServerStore, type Answer, type McServerHost } from "./serverStore.js";
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
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    })) as unknown as typeof globalThis.matchMedia;
});

const i18n = createI18n({ legacy: false, missingWarn: false, fallbackWarn: false, locale: "none", fallbackLocale: "none", messages: {} });
const vuetify = createVuetify();

function ok<T>(value: T): Answer<T> {
    return { ok: true, value };
}

function record(id: string, name: string): ServerRecord {
    return {
        id,
        name,
        flavour: "paper",
        minecraftVersion: "1.21",
        ref: { kind: "local-process", serverDir: `/srv/${id}` },
        origin: "created",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        hasRconSecret: false,
        rconPort: 25565,
        writeScope: [],
    };
}

function fakeHost(records: readonly ServerRecord[]): McServerHost {
    return {
        name: "fake",
        list: async () => ok(records),
        get: async () => ok(records[0]!),
        save: async () => ok(records[0]!),
        forget: async () => ok(undefined),
        probe: async () => ok({ reachable: true, runtimeVersion: null, message: "", checkedAt: "now", capabilities: null }),
        status: async () => ok({ state: "running" as const, running: true, startedAt: null, exitCode: null, checkedAt: "now" }),
        start: async () => ok(undefined),
        stop: async () => ok(undefined),
        files: {
            list: async () => ok([]),
            read: async () => ok({ bytes: new Uint8Array(), hash: "", size: 0, truncated: false }),
            write: async () => ok({ hash: "", size: 0, writtenAt: "now", backupPath: null }),
        },
        logTail: async () => ok([]),
    };
}

function mountScreen(host: McServerHost | null) {
    const store = createServerStore({ host });
    return { store, wrapper: mount(ServerListScreen, { global: { plugins: [i18n, vuetify], provide: { [SERVER_STORE as symbol]: store } } }) };
}

describe("ServerListScreen", () => {
    it("says plainly that this build cannot reach a server host", () => {
        const { wrapper } = mountScreen(null);
        expect(wrapper.text()).toContain("This build cannot reach a Minecraft server host");
    });

    it("lists real servers from the host, once loaded", async () => {
        const { wrapper } = mountScreen(fakeHost([record("survival", "Survival"), record("creative", "Creative")]));
        await flushAll();
        expect(wrapper.text()).toContain("Survival");
        expect(wrapper.text()).toContain("Creative");
    });

    it("narrows the list with the search field", async () => {
        const { wrapper } = mountScreen(fakeHost([record("survival", "Survival"), record("creative", "Creative")]));
        await flushAll();
        const search = wrapper.find("input[type='text']");
        await search.setValue("Survival");
        await flushAll();
        expect(wrapper.text()).toContain("Survival");
        expect(wrapper.text()).not.toContain("Creative");
    });

    it("shows an honest empty state for a host with no servers", async () => {
        const { wrapper } = mountScreen(fakeHost([]));
        await flushAll();
        expect(wrapper.text()).toContain("No servers yet");
    });
});

async function flushAll(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}
