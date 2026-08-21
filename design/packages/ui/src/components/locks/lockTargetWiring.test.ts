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

    // Vuetify's overlay scroll strategy calls `document.elementsFromPoint` on reposition,
    // and jsdom has no layout engine to answer it. Unstubbed it rejects asynchronously,
    // *after* the test that opened the menu has already passed - so every test stays green
    // and vitest still exits non-zero for "unhandled errors", which is a failing CI run
    // with a clean test table above it and nothing obvious to blame.
    document.elementsFromPoint = () => [];
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
        slots: { default: '<button data-test="guarded">Bigger</button>' },
        attachTo: document.body,
        global: {
            plugins: [
                createVuetify(),
                createI18n({
                    legacy: false,
                    locale: "en",
                    missingWarn: false,
                    fallbackWarn: false,
                }),
            ],
            provide: { [LOCK_STORE as unknown as symbol]: store },
        },
    });
}

/** Right-click the wrapper and read what the menu offers, in document order. */
async function menuItems(wrapper: ReturnType<typeof mountTarget>): Promise<string[]> {
    await wrapper.trigger("contextmenu");
    await flushPromises();
    return [...document.querySelectorAll(".v-list-item")].map(
        (item) => item.textContent?.trim() ?? "",
    );
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

describe("a locked element is actually disabled, not merely labelled", () => {
    /**
     * The assertion this whole feature turns on.
     *
     * A lock that leaves its element clickable is decoration, and it is decoration that
     * *looks* like it works - which is worse than no lock, because the owner believes the
     * element is guarded. `inert` is checked rather than a class or a `pointer-events`
     * style because those two leave the element reachable by keyboard, and a lock that a
     * Tab press walks straight through has not disabled anything.
     */
    async function lockedWrapper() {
        const store = createLockStore({ host: host() });
        await store.load();
        await store.add(
            { surface: "element", path: "settings.fontSize", label: "Font size" },
            { method: "password", password: "correct-horse" },
        );
        const wrapper = mountTarget(store);
        await flushPromises();
        return { store, wrapper };
    }

    it("makes the guarded content inert while the lock is closed", async () => {
        const { wrapper } = await lockedWrapper();

        const content = wrapper
            .get('[data-test="guarded"]')
            .element.closest(".mb-appearance-target__content");
        expect(content?.hasAttribute("inert")).toBe(true);

        wrapper.unmount();
        document.body.innerHTML = "";
    });

    it("lets the content work again once the right password opens the lock", async () => {
        const { store, wrapper } = await lockedWrapper();

        const outcome = await store.attempt(store.locks.value[0]!.id, "correct-horse");
        expect(outcome.ok).toBe(true);
        await flushPromises();

        const content = wrapper
            .get('[data-test="guarded"]')
            .element.closest(".mb-appearance-target__content");
        expect(content?.hasAttribute("inert")).toBe(false);

        wrapper.unmount();
        document.body.innerHTML = "";
    });

    it("keeps the unlock badge outside the inert subtree, or there is no way back in", async () => {
        const { wrapper } = await lockedWrapper();

        const badge = wrapper.get('[data-test="element-lock-badge"]').element;
        expect(badge.closest("[inert]")).toBeNull();

        wrapper.unmount();
        document.body.innerHTML = "";
    });

    it("says it is disabled to assistive technology as well as to the eye", async () => {
        const { wrapper } = await lockedWrapper();
        expect(wrapper.attributes("aria-disabled")).toBe("true");
        wrapper.unmount();
        document.body.innerHTML = "";
    });
});

describe("a lock can be managed after it is made", () => {
    it("offers changing the credential from the element's own menu", async () => {
        const store = createLockStore({ host: host() });
        await store.load();
        await store.add(
            { surface: "element", path: "settings.fontSize", label: "Font size" },
            { method: "password", password: "first" },
        );

        const wrapper = mountTarget(store);
        await flushPromises();
        const items = await menuItems(wrapper);
        expect(items.some((item) => item.includes("Change this lock"))).toBe(true);
        wrapper.unmount();
        document.body.innerHTML = "";
    });

    it("replaces the credential in one step, keeping the lock closed throughout", async () => {
        const store = createLockStore({ host: host() });
        await store.load();
        await store.add(
            { surface: "element", path: "settings.fontSize", label: "Font size" },
            { method: "password", password: "first" },
        );
        const id = store.locks.value[0]!.id;
        // Open it, so the change has an existing session to invalidate.
        await store.attempt(id, "first");
        expect(store.isLocked("element", "settings.fontSize")).toBe(false);

        const changed = await store.changeAuth(id, { method: "password", password: "second" });
        expect(changed.ok).toBe(true);

        // The element is guarded again immediately: a credential change that left the old
        // session open would mean the replaced password still had effect.
        expect(store.isLocked("element", "settings.fontSize")).toBe(true);
        // One lock, same id - not a second row, and nothing that referenced it is stale.
        expect(store.locks.value).toHaveLength(1);
        expect(store.locks.value[0]!.id).toBe(id);

        expect((await store.attempt(id, "first")).ok).toBe(false);
        expect((await store.attempt(id, "second")).ok).toBe(true);
    });

    it("refuses to change a lock that is no longer in the list", async () => {
        const store = createLockStore({ host: host() });
        await store.load();
        const result = await store.changeAuth("nope", { method: "password", password: "x" });
        expect(result.ok).toBe(false);
    });
});
