/**
 * @vitest-environment jsdom
 *
 * Regression coverage for the two local filters added to this lane's panels:
 * PluginManager's installed-plugins list and AdoptionReviewDialog's combined
 * evidence/mounts/ports list. Both had no way to narrow a long list before this task;
 * these tests mount each panel with a populated list, prove the filter actually hides
 * non-matching rows, and prove the honest no-match state appears when nothing matches -
 * a search field that renders but never actually filters is worse than none, because it
 * looks like it works.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";

import PluginManager from "./PluginManager.vue";
import AdoptionReviewDialog from "./AdoptionReviewDialog.vue";
import CreateServerWizard from "./CreateServerWizard.vue";
import ServerConsole from "./ServerConsole.vue";
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
    Element.prototype.scrollIntoView = function scrollIntoView(): void {};
    document.elementsFromPoint = (): Element[] => [];
    Object.defineProperty(globalThis, "visualViewport", {
        configurable: true,
        value: {
            width: 1024,
            height: 768,
            offsetLeft: 0,
            offsetTop: 0,
            scale: 1,
            addEventListener: () => {},
            removeEventListener: () => {},
        } as unknown as VisualViewport,
    });
});

afterEach(() => {
    // Every mounted panel is attached to document.body for Vuetify teleports. Clear it
    // between cases so a later negative filter assertion cannot read an older mount.
    document.body.innerHTML = "";
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
            value: {
                reachable: true,
                runtimeVersion: "1.21",
                message: "",
                checkedAt: "2026-01-01T00:00:00Z",
                capabilities: {
                    canCreate: true,
                    canLifecycle: true,
                    canWriteFiles: true,
                    canDestroy: true,
                    console: "stdin",
                },
            },
        }),
        status: vi.fn().mockResolvedValue({
            ok: true,
            value: {
                state: "running",
                running: true,
                startedAt: null,
                exitCode: null,
                checkedAt: "2026-01-01T00:00:00Z",
            },
        }),
        start: vi.fn().mockResolvedValue({ ok: true }),
        stop: vi.fn().mockResolvedValue({ ok: true }),
        files: {
            list: vi.fn().mockResolvedValue({ ok: true, value: [] }),
            read: vi
                .fn()
                .mockResolvedValue({
                    ok: false,
                    failure: { code: "not-found", message: "not found", detail: null },
                }),
            write: vi
                .fn()
                .mockResolvedValue({
                    ok: true,
                    value: {
                        hash: "h",
                        size: 0,
                        writtenAt: "2026-01-01T00:00:00Z",
                        backupPath: null,
                    },
                }),
        },
        logTail: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    };
}

const installedPlugins = [
    {
        path: "plugins/EssentialsX.jar",
        name: "EssentialsX",
        source: "modrinth",
        version: "2.20.1",
        enabled: true,
    },
    {
        path: "plugins/WorldEdit.jar",
        name: "WorldEdit",
        source: "modrinth",
        version: "7.3.0",
        enabled: true,
    },
    {
        path: "plugins/Vault.jar",
        name: "Vault",
        source: "hangar",
        version: "1.7.3",
        enabled: false,
    },
];

function stubBridge(): void {
    (globalThis as { worldlens?: unknown }).worldlens = {
        mcserver: {
            rconTest: vi.fn().mockResolvedValue({ ok: false }),
            consoleOpen: vi.fn().mockResolvedValue({ sessionId: "s1" }),
            consoleSend: vi.fn().mockResolvedValue({ ok: true }),
            consoleClose: vi.fn().mockResolvedValue({ ok: true }),
            onConsoleLine: vi.fn().mockReturnValue(() => {}),
            players: {
                list: vi.fn().mockResolvedValue({ ok: true, value: [] }),
                action: vi.fn().mockResolvedValue({ ok: true }),
            },
            plugins: {
                search: vi.fn().mockResolvedValue({ ok: true, value: [] }),
                versions: vi.fn().mockResolvedValue({ ok: true, value: [] }),
                install: vi.fn().mockResolvedValue({ ok: true }),
                list: vi.fn().mockResolvedValue({ ok: true, value: installedPlugins }),
                toggle: vi.fn().mockResolvedValue({ ok: true }),
                remove: vi.fn().mockResolvedValue({ ok: true }),
                updates: vi
                    .fn()
                    .mockResolvedValue({ ok: true, value: { hasUpdate: false, latest: null } }),
            },
            adopt: {
                discover: vi.fn().mockResolvedValue({ ok: true, value: [] }),
                confirm: vi.fn().mockResolvedValue({ ok: true }),
                release: vi.fn().mockResolvedValue({ ok: true }),
            },
            webConsole: {
                status: vi.fn().mockResolvedValue({
                    ok: true,
                    value: {
                        running: false,
                        host: "127.0.0.1",
                        port: null,
                        loopbackOnly: true,
                        hasPassword: false,
                    },
                }),
                start: vi.fn().mockResolvedValue({ ok: true }),
                stop: vi.fn().mockResolvedValue({ ok: true }),
                setPassword: vi.fn().mockResolvedValue({ ok: true }),
                bind: vi.fn().mockResolvedValue({ ok: true }),
            },
        },
    };
}

async function mountWith(component: unknown, props: Record<string, unknown>, host = fakeHost()) {
    const i18n = createI18n({ legacy: false, locale: "en", messages: { en: {} } });
    const vuetify = createVuetify();
    const store = createServerStore({ host });
    await store.load();
    return mount(component as never, {
        props: props as never,
        global: {
            plugins: [i18n, vuetify],
            provide: { [SERVER_STORE as symbol]: store },
        },
        // VDialog teleports its content to document.body once open, and AdoptionReviewDialog
        // is mounted open in the tests below -- so those reads need the mounted tree attached
        // to a real document rather than a detached fragment, the same way ConfigApplyDialog's
        // own suite does for the same reason.
        attachTo: document.body,
    });
}

describe("PluginManager installed-plugin filter", () => {
    beforeAll(stubBridge);

    it("shows every installed plugin before anything is typed", async () => {
        const wrapper = await mountWith(PluginManager, { serverId: "srv-1" });
        await flushPromises();
        expect(wrapper.text()).toContain("EssentialsX");
        expect(wrapper.text()).toContain("WorldEdit");
        expect(wrapper.text()).toContain("Vault");
    });

    it("narrows the list to the matching plugin and hides the rest", async () => {
        const wrapper = await mountWith(PluginManager, { serverId: "srv-1" });
        await flushPromises();
        const field = wrapper.find('input[placeholder="Name, source or version"]');
        expect(field.exists()).toBe(true);
        await field.setValue("WorldEdit");
        await flushPromises();
        expect(wrapper.text()).toContain("WorldEdit");
        expect(wrapper.text()).not.toContain("EssentialsX");
        expect(wrapper.text()).not.toContain("Vault");
    });

    it("shows an honest no-match state rather than a blank list", async () => {
        const wrapper = await mountWith(PluginManager, { serverId: "srv-1" });
        await flushPromises();
        const field = wrapper.find('input[placeholder="Name, source or version"]');
        await field.setValue("no-such-plugin-anywhere");
        await flushPromises();
        expect(wrapper.text()).toContain("No installed plugin matches");
        expect(wrapper.text()).not.toContain("EssentialsX");
    });
});

describe("CreateServerWizard and ServerConsole search coverage", () => {
    beforeAll(stubBridge);

    it("filters the wizard's catalogue versions with plain text by default", async () => {
        const host: McServerHost = fakeHost();
        host.catalogue = {
            list: vi.fn().mockResolvedValue({
                ok: true,
                value: {
                    fetchedAt: "2026-01-01T00:00:00Z",
                    stale: false,
                    failures: [],
                    flavours: [
                        {
                            flavour: "paper",
                            versions: [
                                { version: "1.21.4", releasedAt: null, javaFeature: 21, stability: "release", downloadUrl: null, sha256: null },
                                { version: "1.20.6", releasedAt: null, javaFeature: 21, stability: "release", downloadUrl: null, sha256: null },
                            ],
                        },
                    ],
                },
            }),
            refresh: vi.fn(),
        };
        await mountWith(CreateServerWizard, { modelValue: true }, host);
        await flushPromises();

        // Two things make reading this dialog different from reading an ordinary component.
        // Vuetify teleports an open dialog to document.body, so its content is never inside
        // the wrapper tree - reading `wrapper` here found zero buttons and reported it as a
        // missing Next control. And teleported content from earlier tests in this file is
        // still in the document, so a document-wide query picks up somebody else's dialog.
        // Both are avoided by scoping to this dialog by the heading only it carries.
        const dialog = (): Element => {
            const found = [...document.querySelectorAll(".v-overlay")].find((el) =>
                (el.textContent ?? "").includes("New Minecraft server"),
            );
            if (found === undefined) throw new Error("the creation wizard is not in the document");
            return found;
        };
        const shown = (): string => dialog().textContent ?? "";
        const byText = (needle: string): HTMLButtonElement | undefined =>
            [...dialog().querySelectorAll("button")].find((b) => (b.textContent ?? "").includes(needle));

        const next = byText("Next");
        expect(next, "the wizard rendered no Next control").toBeDefined();
        next!.click();
        await flushPromises();

        // ConfigSearchField gives its input a floating label rather than a placeholder.
        const field = dialog().querySelector<HTMLInputElement>(".mb-config-search input");
        expect(field, "the version step rendered no search field").not.toBeNull();
        expect(shown()).toContain("1.21.4");
        expect(shown()).toContain("1.20.x");

        field!.value = "1.21.4";
        field!.dispatchEvent(new Event("input", { bubbles: true }));
        await flushPromises();
        expect(shown()).toContain("1.21.4");
        expect(shown()).not.toContain("1.20.6");
    });

    it("filters live console lines and exposes the anchored regex opt-in field", async () => {
        const host = fakeHost();
        host.logTail = vi.fn().mockResolvedValue({
            ok: true,
            value: [
                { at: "2026-01-01T00:00:00Z", stream: "stdout", text: "Started world" },
                { at: "2026-01-01T00:00:01Z", stream: "stderr", text: "Failed to bind port" },
            ],
        });
        const wrapper = await mountWith(ServerConsole, { serverId: "srv-1" }, host);
        await flushPromises();
        const field = wrapper.find(".wl-mcserver-console__search input");
        expect(field.exists()).toBe(true);
        expect(wrapper.text()).toContain("Started world");
        expect(wrapper.text()).toContain("Failed to bind port");
        await field.setValue("Failed");
        await flushPromises();
        expect(wrapper.text()).toContain("Failed to bind port");
        expect(wrapper.text()).not.toContain("Started world");
    });
});

describe("AdoptionReviewDialog evidence/mounts/ports filter", () => {
    beforeAll(stubBridge);

    const dialogProps = {
        modelValue: true,
        record,
        evidence: [
            "Found server.properties",
            "Found a world/ directory",
            "Image name matches a known Paper build",
        ],
        confidence: "high" as const,
        mounts: [
            { source: "/host/data", target: "/data" },
            { source: "/host/plugins", target: "/data/plugins" },
        ],
        ports: [
            { container: 25565, host: 25565 },
            { container: 25575, host: null },
        ],
        blockers: [],
        containerId: "container-1",
    };

    it("shows every evidence line, mount and port before anything is typed", async () => {
        await mountWith(AdoptionReviewDialog, dialogProps);
        await flushPromises();
        const body = document.body.textContent ?? "";
        expect(body).toContain("server.properties");
        expect(body).toContain("/host/plugins");
        expect(body).toContain("25575");
    });

    it("narrows all three lists together and hides non-matching rows", async () => {
        await mountWith(AdoptionReviewDialog, dialogProps);
        await flushPromises();
        const field = document.querySelector<HTMLInputElement>(
            'input[placeholder="Path, port or evidence text"]',
        );
        expect(field).not.toBeNull();
        field!.value = "plugins";
        field!.dispatchEvent(new Event("input"));
        await flushPromises();
        const body = document.body.textContent ?? "";
        expect(body).toContain("/host/plugins");
        expect(body).not.toContain("/host/data");
        expect(body).not.toContain("server.properties");
    });

    it("shows an honest per-section no-match state rather than a blank section", async () => {
        await mountWith(AdoptionReviewDialog, dialogProps);
        await flushPromises();
        const field = document.querySelector<HTMLInputElement>(
            'input[placeholder="Path, port or evidence text"]',
        );
        expect(field).not.toBeNull();
        field!.value = "nothing-will-ever-match-this";
        field!.dispatchEvent(new Event("input"));
        await flushPromises();
        const body = document.body.textContent ?? "";
        expect(body).toContain("No evidence line matches the filter");
        expect(body).toContain("No mounted path matches the filter");
        expect(body).toContain("No published port matches the filter");
    });
});
