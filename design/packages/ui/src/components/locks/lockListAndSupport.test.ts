/**
 * @vitest-environment jsdom
 *
 * The lock list and the recovery desk.
 *
 * The list's job is to make fifteen separate credentials liveable, so what is checked is
 * that it can be searched, that a bulk action acts on exactly the set it previewed, and that
 * it never claims an empty list when it simply could not read one.
 *
 * The desk's job is a joke wrapped around one real instruction. So what is checked is the
 * part that is not a joke: the disclosure that nothing is sent anywhere, the exact folder,
 * and the fact that the application never deletes it for you.
 */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";

import LockList from "./LockList.vue";
import SupportTickets from "./SupportTickets.vue";
import { createLockStore, type LockHost, type LockStore } from "./lockStore.js";
import type { LockRecord, LockVault } from "./lockModel.js";
import { LOCK_STORE } from "./useLocks.js";

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

    globalThis.visualViewport = {
        width: 1024,
        height: 768,
        addEventListener: () => {},
        removeEventListener: () => {},
    } as unknown as typeof globalThis.visualViewport;
});

const FOLDER = "C:/Users/test/AppData/Roaming/Worldlens";

function host(overrides: Partial<LockHost> = {}): LockHost {
    let stored: readonly LockRecord[] = [];
    const secrets = new Map<string, string>();
    const vault: LockVault = {
        put: async (id, secret) => void secrets.set(id, secret),
        get: async (id) => secrets.get(id) ?? null,
        remove: async (id) => void secrets.delete(id),
    };
    return {
        name: "test",
        dataFolder: FOLDER,
        vault,
        load: async () => stored,
        save: async (locks) => void (stored = locks),
        ...overrides,
    };
}

function mountWith(component: unknown, store: LockStore, props: Record<string, unknown> = {}) {
    return mount(component as never, {
        props: props as never,
        global: {
            plugins: [
                createVuetify(),
                createI18n({ legacy: false, locale: "en", missingWarn: false, fallbackWarn: false }),
            ],
            provide: { [LOCK_STORE as unknown as symbol]: store },
        },
    });
}

async function storeWith(labels: readonly string[]): Promise<LockStore> {
    const store = createLockStore({ host: host() });
    await store.load();
    for (const label of labels) {
        await store.add(
            { surface: "element", path: `settings.${label.toLowerCase()}`, label },
            { method: "password", password: "x" },
        );
    }
    return store;
}

describe("the list of every lock", () => {
    it("says nothing is locked only when it has really read the list", async () => {
        const store = createLockStore({ host: host() });
        await store.load();
        const wrapper = mountWith(LockList, store);
        await flushPromises();
        expect(wrapper.find('[data-test="lock-list-empty"]').exists()).toBe(true);
        wrapper.unmount();
    });

    it("says the list is unknown rather than empty when it could not be read", async () => {
        const store = createLockStore({
            host: host({
                load: async () => {
                    throw new Error("the lock file is unreadable");
                },
            }),
        });
        await store.load();
        const wrapper = mountWith(LockList, store);
        await flushPromises();

        expect(wrapper.find('[data-test="lock-list-empty"]').exists()).toBe(false);
        const text = wrapper.find('[data-test="lock-list-failure"]').text();
        expect(text).toContain("not an empty list");
        expect(text).toContain("unreadable");
        wrapper.unmount();
    });

    it("says so plainly on a build that cannot keep locks at all", async () => {
        const store = createLockStore({ host: null });
        await store.load();
        const wrapper = mountWith(LockList, store);
        await flushPromises();
        expect(wrapper.find('[data-test="lock-list-unsupported"]').text()).toContain(
            "cannot keep locks",
        );
        wrapper.unmount();
    });

    it("lists one row per lock, with what it guards and how it opens", async () => {
        const store = await storeWith(["Font size", "Colour"]);
        const wrapper = mountWith(LockList, store);
        await flushPromises();

        const rows = wrapper.findAll('[data-test="lock-row"]');
        expect(rows).toHaveLength(2);
        expect(wrapper.text()).toContain("Font size");
        expect(wrapper.text()).toContain("Password");
        wrapper.unmount();
    });

    it("never renders anything that could be a credential", async () => {
        const store = createLockStore({ host: host() });
        await store.load();
        await store.add(
            { surface: "element", path: "settings.fontSize", label: "Font size" },
            { method: "password", password: "correct horse battery" },
        );
        const wrapper = mountWith(LockList, store);
        await flushPromises();

        const html = wrapper.html();
        expect(html).not.toContain("correct horse");
        // Not even the verifier, which is useless to an attacker but is still not the sort
        // of thing a list has any business rendering.
        expect(html).not.toContain(store.locks.value[0]!.verifier!.derived);
        wrapper.unmount();
    });

    it("shows a lock as open while its session is live", async () => {
        const store = createLockStore({ host: host() });
        await store.load();
        await store.add(
            { surface: "element", path: "settings.fontSize", label: "Font size" },
            { method: "password", password: "x" },
            { kind: "session" },
        );
        await store.attempt(store.locks.value[0]!.id, "x");

        const wrapper = mountWith(LockList, store);
        await flushPromises();
        expect(wrapper.find('[data-test="lock-row-state"]').text()).toContain("Open now");

        await wrapper.find('[data-test="lock-row-relock"]').trigger("click");
        await flushPromises();
        expect(wrapper.find('[data-test="lock-row-state"]').text()).toContain("Locked");
        wrapper.unmount();
    });
});

describe("bulk actions act on exactly the set they previewed", () => {
    it("selects what is shown, not what is filtered out", async () => {
        const store = await storeWith(["Font size", "Colour", "Density"]);
        const wrapper = mountWith(LockList, store);
        await flushPromises();

        await wrapper.find('[data-test="lock-list"] input[type="text"]').setValue("Colour");
        await flushPromises();
        expect(wrapper.findAll('[data-test="lock-row"]')).toHaveLength(1);

        await wrapper.find('[data-test="lock-select-all"]').trigger("click");
        await flushPromises();

        // The preview names one, so the removal must take one - never the whole list
        // because a filter was on.
        expect(wrapper.find('[data-test="lock-remove-selected"]').text()).toContain("1");
        await wrapper.find('[data-test="lock-remove-selected"]').trigger("click");
        await flushPromises();
        expect(wrapper.find('[data-test="lock-remove-confirm"]').text()).toContain("1");

        await wrapper.find('[data-test="lock-remove-go"]').trigger("click");
        await flushPromises();
        expect(store.locks.value).toHaveLength(2);
        wrapper.unmount();
    });

    it("removes several at once when several are selected", async () => {
        const store = await storeWith(["Font size", "Colour", "Density"]);
        const wrapper = mountWith(LockList, store);
        await flushPromises();

        await wrapper.find('[data-test="lock-select-all"]').trigger("click");
        await flushPromises();
        await wrapper.find('[data-test="lock-remove-selected"]').trigger("click");
        await flushPromises();
        await wrapper.find('[data-test="lock-remove-go"]').trigger("click");
        await flushPromises();

        expect(store.locks.value).toHaveLength(0);
        wrapper.unmount();
    });

    it("keeps them when the preview is declined", async () => {
        const store = await storeWith(["Font size", "Colour"]);
        const wrapper = mountWith(LockList, store);
        await flushPromises();
        await wrapper.find('[data-test="lock-select-all"]').trigger("click");
        await wrapper.find('[data-test="lock-remove-selected"]').trigger("click");
        await flushPromises();

        const keep = wrapper
            .findAll("button")
            .find((button) => button.text().includes("Keep them"));
        await keep?.trigger("click");
        await flushPromises();
        expect(store.locks.value).toHaveLength(2);
        wrapper.unmount();
    });

    it("says no lock matches rather than showing an empty list with no explanation", async () => {
        const store = await storeWith(["Font size"]);
        const wrapper = mountWith(LockList, store);
        await flushPromises();
        await wrapper.find('[data-test="lock-list"] input[type="text"]').setValue("nothing at all");
        await flushPromises();
        expect(wrapper.find('[data-test="lock-list-no-match"]').text()).toContain("No lock matches");
        wrapper.unmount();
    });
});

describe("the recovery desk, where the parts that are not jokes matter most", () => {
    it("states that nothing is sent anywhere, before any of the comedy", async () => {
        const store = createLockStore({ host: host() });
        await store.load();
        const wrapper = mountWith(SupportTickets, store);
        await flushPromises();

        const disclosure = wrapper.find('[data-test="support-disclosure"]').text();
        expect(disclosure).toContain("Nothing here is sent anywhere");
        expect(disclosure).toContain("nobody is reading it");
        expect(disclosure).toContain("not a real support service");
        wrapper.unmount();
    });

    it("names the exact folder, and says the application will not delete it for you", async () => {
        const store = createLockStore({ host: host() });
        await store.load();
        const wrapper = mountWith(SupportTickets, store);
        await flushPromises();

        expect(wrapper.find('[data-test="support-folder"]').text()).toBe(FOLDER);
        expect(wrapper.find('[data-test="support-no-delete"]').text()).toContain(
            "does not delete it for you",
        );
        wrapper.unmount();
    });

    it("opens the same folder it displayed, and marks the ticket resolved only then", async () => {
        const opened: string[] = [];
        const store = createLockStore({ host: host() });
        await store.load();
        const wrapper = mountWith(SupportTickets, store, {
            openDataFolder: async () => {
                opened.push(store.dataFolder ?? "");
                return true;
            },
        });
        await flushPromises();

        await wrapper.find('[data-test="support-description"] textarea').setValue("locked out");
        await wrapper.find('[data-test="support-submit"]').trigger("click");
        await flushPromises();
        expect(wrapper.find('[data-test="support-status"]').text()).toContain("awaiting your action");

        await wrapper.find('[data-test="support-resolve"]').trigger("click");
        await flushPromises();

        expect(opened).toEqual([FOLDER]);
        expect(wrapper.find('[data-test="support-status"]').text()).toContain("Resolved");
        wrapper.unmount();
    });

    it("reports honestly when the file manager will not open, and leaves it unresolved", async () => {
        const store = createLockStore({ host: host() });
        await store.load();
        const wrapper = mountWith(SupportTickets, store, {
            openDataFolder: async () => false,
        });
        await flushPromises();

        await wrapper.find('[data-test="support-description"] textarea').setValue("locked out");
        await wrapper.find('[data-test="support-submit"]').trigger("click");
        await flushPromises();
        await wrapper.find('[data-test="support-resolve"]').trigger("click");
        await flushPromises();

        expect(wrapper.find('[data-test="support-open-failed"]').text()).toContain("did not open");
        // Never a resolved ticket for a folder nobody ever saw.
        expect(wrapper.find('[data-test="support-status"]').text()).toContain("awaiting your action");
        wrapper.unmount();
    });

    it("says it cannot open anything when it cannot even name the folder", async () => {
        const store = createLockStore({ host: host({ dataFolder: null }) });
        await store.load();
        const wrapper = mountWith(SupportTickets, store);
        await flushPromises();
        expect(wrapper.find('[data-test="support-folder-unknown"]').text()).toContain(
            "cannot say where",
        );
        wrapper.unmount();
    });

    it("makes no network request of any kind", async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal("fetch", fetchSpy);
        const store = createLockStore({ host: host() });
        await store.load();
        const wrapper = mountWith(SupportTickets, store, { openDataFolder: async () => true });
        await flushPromises();

        await wrapper.find('[data-test="support-description"] textarea').setValue("help");
        await wrapper.find('[data-test="support-submit"]').trigger("click");
        await flushPromises();
        await wrapper.find('[data-test="support-resolve"]').trigger("click");
        await flushPromises();

        // The disclosure above is a promise about behaviour, so it is asserted as one.
        expect(fetchSpy).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
        wrapper.unmount();
    });

    it("does not invent a real company, a named agent, or a response time", async () => {
        const store = createLockStore({ host: host() });
        await store.load();
        const wrapper = mountWith(SupportTickets, store);
        await flushPromises();
        await wrapper.find('[data-test="support-description"] textarea').setValue("help");
        await wrapper.find('[data-test="support-submit"]').trigger("click");
        await flushPromises();

        const reply = wrapper.find('[data-test="support-reply"]').text();
        expect(reply).toContain("this application");
        // Impersonating a real support organisation is out of bounds here as everywhere,
        // and so is implying a human will get back to you.
        expect(reply).not.toMatch(/within \d+ (hours|days|business)/i);
        expect(reply).not.toMatch(/Microsoft|Google|Mojang|Anthropic/i);
        wrapper.unmount();
    });
});
