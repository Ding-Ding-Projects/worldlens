/**
 * @vitest-environment jsdom
 *
 * The "Add player" dialog must default to picking a name the app already knows about
 * (from the online roster and the flat-file lists it has already read), never a blank
 * textbox. Typing a name that has never been seen is an explicit opt-in switch, off by
 * default, and it is disabled - with a stated reason - when there is nothing yet known.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";

import PlayerManager from "./PlayerManager.vue";
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
    (globalThis as { visualViewport?: unknown }).visualViewport = {
        width: 1024,
        height: 768,
        addEventListener: () => {},
        removeEventListener: () => {},
    };
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

function fakeHost(readImpl: McServerHost["files"]["read"]): McServerHost {
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
            read: readImpl,
            write: vi.fn().mockResolvedValue({ ok: true, value: { hash: "h", size: 0, writtenAt: "2026-01-01T00:00:00Z", backupPath: null } }),
        },
        logTail: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    };
}

function encode(text: string): Uint8Array {
    return new TextEncoder().encode(text);
}

function stubBridge(onlineNames: readonly string[]): void {
    (globalThis as { worldlens?: unknown }).worldlens = {
        mcserver: {
            players: {
                list: vi.fn().mockResolvedValue({ ok: true, value: onlineNames.map((name) => ({ name, op: false, banned: false, whitelisted: false })) }),
                action: vi.fn().mockResolvedValue({ ok: true }),
            },
        },
    };
}

async function mountWith(readImpl: McServerHost["files"]["read"], onlineNames: readonly string[]) {
    stubBridge(onlineNames);
    const i18n = createI18n({ legacy: false, locale: "en", messages: { en: {} } });
    const vuetify = createVuetify();
    const store = createServerStore({ host: fakeHost(readImpl) });
    await store.load();
    await store.probe("srv-1");
    return mount(PlayerManager as never, {
        props: { serverId: "srv-1" } as never,
        global: {
            plugins: [i18n, vuetify],
            provide: { [SERVER_STORE as symbol]: store },
        },
    });
}

describe("PlayerManager add-player dialog", () => {
    it("defaults to a picker of real known names, not a blank textbox", async () => {
        const readImpl = vi.fn(async (_id: string, path: string) => {
            if (path === "whitelist.json") return { ok: true, value: { bytes: encode(JSON.stringify([{ name: "Steve" }])), hash: "h1", size: 0, truncated: false } };
            return { ok: false, failure: { code: "not-found" as const, message: "not found", detail: null } };
        });
        const wrapper = await mountWith(readImpl, ["Alex"]);
        await flushPromises();

        // Switch to the whitelist tab, which is where "Add player" appears.
        const tabs = wrapper.findAllComponents({ name: "VTab" });
        await tabs[1]!.trigger("click");
        await flushPromises();

        const addButtons = wrapper.findAllComponents({ name: "VBtn" }).filter((b) => b.text().includes("Add player"));
        expect(addButtons.length).toBeGreaterThan(0);
        await addButtons[0]!.trigger("click");
        await flushPromises();

        // The picker exists and is fed the app's own known names (Alex online, Steve whitelisted) -
        // never a hard-coded stand-in list.
        const select = wrapper.findComponent({ name: "VSelect" });
        expect(select.exists()).toBe(true);
        expect((select.props("items") as string[])).toEqual(expect.arrayContaining(["Alex"]));

        // Typing a name is opt-in and starts off.
        const toggle = wrapper.findComponent({ name: "VSwitch" });
        expect(toggle.exists()).toBe(true);
        expect(toggle.props("modelValue")).toBe(false);

        // Flip it on: the picker gives way to a real textbox.
        await toggle.vm.$emit("update:modelValue", true);
        await flushPromises();
        expect(wrapper.findComponent({ name: "VTextField" }).exists()).toBe(true);
    });

    it("disables the opt-in toggle with a stated reason when nothing is known yet", async () => {
        const readImpl = vi.fn(async () => ({ ok: false as const, failure: { code: "not-found" as const, message: "not found", detail: null } }));
        const wrapper = await mountWith(readImpl, []);
        await flushPromises();

        const tabs = wrapper.findAllComponents({ name: "VTab" });
        await tabs[1]!.trigger("click");
        await flushPromises();
        const addButtons = wrapper.findAllComponents({ name: "VBtn" }).filter((b) => b.text().includes("Add player"));
        await addButtons[0]!.trigger("click");
        await flushPromises();

        const toggle = wrapper.findComponent({ name: "VSwitch" });
        expect(toggle.props("disabled")).toBe(true);
        expect(toggle.props("hint")).toContain("No known player names yet");
        // With nothing known, the dialog falls back to the textbox directly rather than
        // an unusable empty picker.
        expect(wrapper.findComponent({ name: "VTextField" }).exists()).toBe(true);
    });
});
