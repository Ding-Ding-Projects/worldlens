/**
 * @vitest-environment jsdom
 *
 * That the locks actually reach the wrapper every element already uses.
 *
 * The model and the two surfaces are tested next door in isolation, and passing there
 * proves nothing about whether a person can reach any of it. This file mounts the real
 * `AppearanceTarget` - the same wrapper the application puts around its elements - and
 * drives it the way a person does: right-click, read the menu, press the item.
 *
 * That distinction is the whole reason this file exists. A surface tested only with an
 * injected host passes whether or not the thing that hosts it exposes the shape it expects,
 * so a menu item that was never added, or added under a condition that is never true, ships
 * green.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";

import AppearanceTarget from "../appearance/AppearanceTarget.vue";
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

function host(): LockHost {
    let stored: readonly LockRecord[] = [];
    const secrets = new Map<string, string>();
    const vault: LockVault = {
        put: async (id, secret) => void secrets.set(id, secret),
        get: async (id) => secrets.get(id) ?? null,
        remove: async (id) => void secrets.delete(id),
    };
    return {
        name: "test",
        dataFolder: "C:/Users/test/AppData/Roaming/Worldlens",
        vault,
        load: async () => stored,
        save: async (locks) => void (stored = locks),
    };
}

function mountTarget(store: LockStore) {
    return mount(AppearanceTarget, {
        props: { id: "settings.fontSize", label: "Font size" },
        attachTo: document.body,
        global: {
            plugins: [
                createVuetify(),
                createI18n({ legacy: false, locale: "en", missingWarn: false, fallbackWarn: false }),
            ],
            provide: { [LOCK_STORE as unknown as symbol]: store },
        },
    });
}

/** Right-click the wrapper and read what the menu offers, in document order. */
async function menuItems(wrapper: ReturnType<typeof mountTarget>): Promise<string[]> {
    await wrapper.trigger("contextmenu");
    await flushPromises();
    return [...document.querySelectorAll(".v-list-item")].map((item) => item.textContent?.trim() ?? "");
}

describe("every element that can be styled can also be locked", () => {
    it("offers Lock this element from the same menu as Edit appearance", async () => {
        const store = createLockStore({ host: host() });
        await store.load();
        const wrapper = mountTarget(store);
        await flushPromises();

        const items = await menuItems(wrapper);
        expect(items.some((item) => item.includes("Edit appearance"))).toBe(true);
        expect(items.some((item) => item.includes("Lock this element"))).toBe(true);
        wrapper.unmount();
        document.body.innerHTML = "";
    });

    it("offers no lock command at all on a build that cannot keep locks", async () => {
        // Deliberately absent rather than present-and-disabled: a wizard that opens only to
        // say "this build cannot keep locks" costs two clicks to learn the same thing.
        const store = createLockStore({ host: null });
        await store.load();
        const wrapper = mountTarget(store);
        await flushPromises();

        const items = await menuItems(wrapper);
        expect(items.some((item) => item.includes("Edit appearance"))).toBe(true);
        expect(items.some((item) => item.includes("Lock"))).toBe(false);
        wrapper.unmount();
        document.body.innerHTML = "";
    });

    it("switches to unlock and remove once the element carries a lock", async () => {
        const store = createLockStore({ host: host() });
        await store.load();
        await store.add(
            { surface: "element", path: "settings.fontSize", label: "Font size" },
            { method: "password", password: "x" },
        );

        const wrapper = mountTarget(store);
        await flushPromises();
        const items = await menuItems(wrapper);

        expect(items.some((item) => item.includes("Unlock this element"))).toBe(true);
        expect(items.some((item) => item.includes("Remove this lock"))).toBe(true);
        // Offering to lock an element that is already locked would be the menu describing
        // a state the application is not in.
        expect(items.some((item) => item.includes("Lock this element"))).toBe(false);
        wrapper.unmount();
        document.body.innerHTML = "";
    });

    it("uses the element's own id as the lock's path, so two elements never share one", async () => {
        const store = createLockStore({ host: host() });
        await store.load();
        await store.add(
            { surface: "element", path: "settings.colour", label: "Colour" },
            { method: "password", password: "x" },
        );

        // A lock on a *different* element must not make this one look locked.
        const wrapper = mountTarget(store);
        await flushPromises();
        const items = await menuItems(wrapper);
        expect(items.some((item) => item.includes("Lock this element"))).toBe(true);
        wrapper.unmount();
        document.body.innerHTML = "";
    });

    it("offers Lock it again now while an unlocked lock is still open", async () => {
        const store = createLockStore({ host: host() });
        await store.load();
        await store.add(
            { surface: "element", path: "settings.fontSize", label: "Font size" },
            { method: "password", password: "x" },
            { kind: "session" },
        );
        await store.attempt(store.locks.value[0]!.id, "x");

        const wrapper = mountTarget(store);
        await flushPromises();
        const items = await menuItems(wrapper);
        expect(items.some((item) => item.includes("Lock it again now"))).toBe(true);
        wrapper.unmount();
        document.body.innerHTML = "";
    });
});
