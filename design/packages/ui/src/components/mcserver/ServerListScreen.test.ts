/**
 * @vitest-environment jsdom
 *
 * The server list, mounted. Three properties only exist in the rendered component: a build
 * with no host says so instead of showing an empty list; a search actually narrows the real
 * cards; and selecting servers surfaces the bulk action bar with the real selected count.
 */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
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

const i18n = createI18n({
    legacy: false,
    missingWarn: false,
    fallbackWarn: false,
    locale: "none",
    fallbackLocale: "none",
    messages: {},
});
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
        probe: async () =>
            ok({
                reachable: true,
                runtimeVersion: null,
                message: "",
                checkedAt: "now",
                capabilities: null,
            }),
        status: async () =>
            ok({
                state: "running" as const,
                running: true,
                startedAt: null,
                exitCode: null,
                checkedAt: "now",
            }),
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

function mountScreen(host: McServerHost | null, attach = false) {
    const store = createServerStore({ host });
    return {
        store,
        wrapper: mount(ServerListScreen, {
            global: { plugins: [i18n, vuetify], provide: { [SERVER_STORE as symbol]: store } },
            ...(attach ? { attachTo: document.body } : {}),
        }),
    };
}

describe("ServerListScreen", () => {
    it.each([true, false])(
        "loads real capabilities before enabling the permitted lifecycle control: available=%s",
        async (available) => {
            const host = fakeHost([record("survival", "Survival")]);
            host.status = async () =>
                ok({
                    state: "exited",
                    running: false,
                    startedAt: null,
                    exitCode: 0,
                    checkedAt: "now",
                });
            host.probe = async () => {
                if (!available) throw new Error("Disconnected");
                return ok({
                    reachable: true,
                    runtimeVersion: null,
                    message: "",
                    checkedAt: "now",
                    capabilities: {
                        canCreate: false,
                        canLifecycle: false,
                        canStart: true,
                        canStop: false,
                        canWriteFiles: false,
                        canDestroy: false,
                        console: "none",
                    },
                });
            };
            const { wrapper } = mountScreen(host);
            try {
                await flushPromises();
                // A stopped server offers Start as its one lifecycle control; Stop is not
                // available for it, so it is not drawn at all rather than drawn dead.
                const controls = wrapper.findAll(".wl-mcserver-card__actions button");
                const start = controls.find((button) => button.text() === "Start");
                expect(start).toBeDefined();
                expect(controls.find((button) => button.text() === "Stop")).toBeUndefined();
                expect(start?.attributes("disabled") === undefined).toBe(available);
                // A refused control names its reason beside itself, in words.
                const notice = wrapper.find(".wl-mcserver-card__notice");
                expect(notice.exists()).toBe(!available);
                if (!available) expect(notice.text()).toContain("cannot be reached");
            } finally {
                wrapper.unmount();
            }
        },
    );
    it("offers Stop as the primary control while a server runs, and names a refused one", async () => {
        const host = fakeHost([record("survival", "Survival")]);
        host.probe = async () =>
            ok({
                reachable: true,
                runtimeVersion: null,
                message: "",
                checkedAt: "now",
                capabilities: {
                    canCreate: false,
                    canLifecycle: false,
                    canWriteFiles: false,
                    canDestroy: false,
                    console: "none",
                },
            });
        const { wrapper } = mountScreen(host);
        try {
            await flushPromises();
            const controls = wrapper.findAll(".wl-mcserver-card__actions button");
            const stop = controls.find((button) => button.text() === "Stop");
            expect(stop?.attributes("disabled")).toBeDefined();
            expect(wrapper.find(".wl-mcserver-card__notice").text()).toContain(
                "cannot start or stop",
            );
        } finally {
            wrapper.unmount();
        }
    });
    it("selects a range with shift-click, in the order the list is shown", async () => {
        const { wrapper } = mountScreen(
            fakeHost([
                record("a", "Alpha"),
                record("b", "Bravo"),
                record("c", "Charlie"),
                record("d", "Delta"),
            ]),
        );
        try {
            await flushPromises();
            const box = (name: string) => wrapper.find(`input[aria-label="Select ${name}"]`);
            // The pointer press carries the modifier; the control's own value change follows.
            const press = async (name: string, shiftKey = false) => {
                // jsdom flips `checked` on the click itself but raises no input event.
                await box(name).trigger("click", { shiftKey });
                await box(name).trigger("input");
            };
            await press("Alpha");
            await press("Charlie", true);
            await flushPromises();
            expect(wrapper.text()).toContain("3 selected");
            expect((box("Delta").element as HTMLInputElement).checked).toBe(false);
            // Shift-clicking a selected end of the range clears the whole range again.
            await press("Alpha", true);
            await flushPromises();
            expect(wrapper.text()).not.toContain("selected");
        } finally {
            wrapper.unmount();
        }
    });
    it("shows the actionable start failure without losing the server list", async () => {
        const host = fakeHost([record("survival", "Survival")]);
        host.status = async () =>
            ok({ state: "exited", running: false, startedAt: null, exitCode: 1, checkedAt: "now" });
        host.probe = async () =>
            ok({
                reachable: true,
                runtimeVersion: null,
                message: "",
                checkedAt: "now",
                capabilities: {
                    canCreate: true,
                    canLifecycle: true,
                    canWriteFiles: true,
                    canDestroy: true,
                    console: "stdin",
                },
            });
        host.start = async () => ({
            ok: false,
            failure: {
                code: "not-found",
                message: "Java executable is missing",
                detail: "Choose an available runtime.",
            },
        });
        const { wrapper } = mountScreen(host);
        try {
            await flushPromises();
            await wrapper
                .findAll(".wl-mcserver-card__actions button")
                .find((b) => b.text() === "Start")!
                .trigger("click");
            await flushPromises();
            expect(wrapper.text()).toContain("Java executable is missing");
            expect(wrapper.text()).toContain("Choose an available runtime.");
            expect(wrapper.text()).toContain("Survival");
        } finally {
            wrapper.unmount();
        }
    });
    it("refreshes a late process exit without overlapping polls and stops after unmount", async () => {
        vi.useFakeTimers();
        const host = fakeHost([record("survival", "Survival")]);
        let reads = 0;
        host.status = async () => {
            reads++;
            return ok({
                state: reads === 1 ? "running" : "exited",
                running: reads === 1,
                startedAt: null,
                exitCode: reads === 1 ? null : 1,
                checkedAt: "now",
            });
        };
        const { wrapper } = mountScreen(host);
        try {
            await flushPromises();
            await vi.advanceTimersByTimeAsync(2000);
            expect(wrapper.text()).toContain("exited (code 1)");
            expect(reads).toBe(2);
            wrapper.unmount();
            await vi.advanceTimersByTimeAsync(6000);
            expect(reads).toBe(2);
        } finally {
            wrapper.unmount();
            vi.useRealTimers();
        }
    });
    it("retries a transient unknown status and observes the recovered exit", async () => {
        vi.useFakeTimers();
        const host = fakeHost([record("survival", "Survival")]);
        let reads = 0;
        host.status = async () => {
            reads++;
            if (reads === 2) throw new Error("Temporary disconnect");
            return ok({
                state: reads === 1 ? "running" : "exited",
                running: reads === 1,
                startedAt: null,
                exitCode: reads === 1 ? null : 1,
                checkedAt: "now",
            });
        };
        const { wrapper } = mountScreen(host);
        try {
            await flushPromises();
            await vi.advanceTimersByTimeAsync(4000);
            expect(reads).toBe(3);
            expect(wrapper.text()).toContain("exited (code 1)");
        } finally {
            wrapper.unmount();
            vi.useRealTimers();
        }
    });
    it("says plainly that this build cannot reach a server host", () => {
        const { wrapper } = mountScreen(null);
        expect(wrapper.text()).toContain("This build cannot reach a Minecraft server host");
    });

    it("lists real servers from the host, once loaded", async () => {
        const { wrapper } = mountScreen(
            fakeHost([record("survival", "Survival"), record("creative", "Creative")]),
        );
        await flushAll();
        expect(wrapper.text()).toContain("Survival");
        expect(wrapper.text()).toContain("Creative");
    });

    it("narrows the list with the search field", async () => {
        const { wrapper } = mountScreen(
            fakeHost([record("survival", "Survival"), record("creative", "Creative")]),
        );
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

    it("restores focus to the returned server control after detail Back", async () => {
        const { wrapper } = mountScreen(fakeHost([record("survival", "Survival")]), true);
        await flushAll();
        await wrapper.setProps({ returnServerId: "survival" });
        await flushAll();

        expect(document.activeElement?.getAttribute("data-server-control")).toBe("survival");
        wrapper.unmount();
    });

    it("returns focus to search when the originating server is filtered or deleted", async () => {
        const { wrapper } = mountScreen(
            fakeHost([record("survival", "Survival"), record("creative", "Creative")]),
            true,
        );
        await flushAll();
        await wrapper.setProps({ returnServerId: "removed-server" });
        await flushAll();

        const search = wrapper.find(".wl-mcserver-list__search input").element;
        expect(document.activeElement).toBe(search);
        wrapper.unmount();
    });

    it("returns focus to the list heading when no search control exists", async () => {
        const { wrapper } = mountScreen(null, true);
        await wrapper.setProps({ returnServerId: "removed-server" });
        await flushAll();

        expect(document.activeElement?.getAttribute("data-test")).toBe("mcserver-list-heading");
        wrapper.unmount();
    });
});

async function flushAll(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}
