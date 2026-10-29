/**
 * @vitest-environment jsdom
 *
 * The new surfaces as a person meets them: PIN entry by keyboard and by keypad, a combined
 * lock's prompt, and the unlock ladder opened from that prompt while a wait is running.
 */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";

import type { DimSumDish } from "../dimsum/dimSumCatalog.js";
import LockWizard from "./LockWizard.vue";
import UnlockLadder from "./UnlockLadder.vue";
import UnlockPrompt from "./UnlockPrompt.vue";
import { createLockStore, type LockHost, type LockStore } from "./lockStore.js";
import type { LockRecord, LockVault } from "./lockModel.js";
import { LOCK_STORE } from "./useLocks.js";

const target = { surface: "settings", path: "appearance.fontSize", label: "Font size" };
const DISHES: readonly DimSumDish[] = [
    { id: "a", nameEn: "Shrimp dumpling", nameZhHant: "蝦餃", imageUrl: null },
    { id: "b", nameEn: "Pork dumpling", nameZhHant: "燒賣", imageUrl: null },
    { id: "c", nameEn: "Barbecue pork bun", nameZhHant: "叉燒包", imageUrl: null },
    { id: "d", nameEn: "Rice noodle roll", nameZhHant: "腸粉", imageUrl: null },
];
const NAME_BY_CLUE = new Map(DISHES.map((dish) => [dish.nameZhHant, dish.nameEn]));

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
        dataFolder: null,
        vault,
        load: async () => stored,
        save: async (locks) => void (stored = locks),
    };
}

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
    document.elementsFromPoint = () => [];
});

function mountWith(component: unknown, props: Record<string, unknown>, store: LockStore) {
    return mount(component as never, {
        props: props as never,
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

async function press(wrapper: VueWrapper, prefix: string, digits: string): Promise<void> {
    for (const digit of digits) {
        await wrapper.find(`[data-test="${prefix}-key-${digit}"]`).trigger("click");
    }
}

describe("PIN entry in the wizard", () => {
    it("makes a PIN lock from the keypad alone", async () => {
        const store = createLockStore({ host: host() });
        await store.load();
        const wrapper = mountWith(LockWizard, { target }, store);
        await flushPromises();
        await wrapper.find('[data-test="lock-method-pin"] input').setValue(true);
        await flushPromises();

        await press(wrapper, "lock-pin", "4829");
        await press(wrapper, "lock-pin-confirm", "4829");
        await wrapper.find('[data-test="lock-create"]').trigger("click");
        await vi.waitFor(() => expect(store.locks.value).toHaveLength(1));
        expect(store.locks.value[0]!.method).toBe("pin");
        expect(JSON.stringify(store.locks.value[0])).not.toContain("4829");
        wrapper.unmount();
    });

    it("keeps typed PINs to digits, and says what an unusable PIN needs", async () => {
        const store = createLockStore({ host: host() });
        await store.load();
        const wrapper = mountWith(LockWizard, { target }, store);
        await flushPromises();
        await wrapper.find('[data-test="lock-method-pin"] input').setValue(true);
        await flushPromises();

        const field = wrapper.find('[data-test="lock-pin-field"] input');
        await field.setValue("12ab");
        await flushPromises();
        expect((field.element as HTMLInputElement).value).toBe("12");
        expect(field.attributes("inputmode")).toBe("numeric");
        expect(wrapper.find('[data-test="lock-blocked"]').text()).toContain("4 to 12 digits");

        await wrapper.find('[data-test="lock-pin-back"]').trigger("click");
        await flushPromises();
        expect((field.element as HTMLInputElement).value).toBe("1");
        await wrapper.find('[data-test="lock-pin-clear"]').trigger("click");
        await flushPromises();
        expect((field.element as HTMLInputElement).value).toBe("");
        wrapper.unmount();
    });

    it("needs both a password and a PIN for the combined method", async () => {
        const store = createLockStore({ host: host() });
        await store.load();
        const wrapper = mountWith(LockWizard, { target }, store);
        await flushPromises();
        await wrapper.find('[data-test="lock-method-pin-password"] input').setValue(true);
        await flushPromises();
        await wrapper.find('[data-test="lock-password"] input').setValue("open sesame");
        await wrapper.find('[data-test="lock-password-confirm"] input').setValue("open sesame");
        await flushPromises();
        expect(wrapper.find('[data-test="lock-create"]').attributes("disabled")).toBeDefined();
        await press(wrapper, "lock-pin", "482916");
        await press(wrapper, "lock-pin-confirm", "482916");
        await flushPromises();
        await wrapper.find('[data-test="lock-create"]').trigger("click");
        await vi.waitFor(() => expect(store.locks.value).toHaveLength(1));
        expect(store.locks.value[0]!.method).toBe("pin+password");
        wrapper.unmount();
    });
});

describe("the prompt for a combined lock", () => {
    async function combined() {
        const store = createLockStore({ host: host() });
        await store.load();
        await store.add(target, { method: "pin+password", pin: "482916", password: "open sesame" });
        return store;
    }

    it("asks for every part and opens only when all are right", async () => {
        const store = await combined();
        const wrapper = mountWith(UnlockPrompt, { lock: store.locks.value[0] }, store);
        await flushPromises();

        await wrapper.find('[data-test="unlock-answer"] input').setValue("open sesame");
        await flushPromises();
        // One part is not enough.
        expect(wrapper.find('[data-test="unlock-submit"]').attributes("disabled")).toBeDefined();
        await press(wrapper, "unlock-pin", "482917");
        await wrapper.find('[data-test="unlock-submit"]').trigger("click");
        await vi.waitFor(() =>
            expect(wrapper.find('[data-test="unlock-problem"]').text()).toContain("did not match"),
        );
        // It never says which part was wrong.
        expect(wrapper.find('[data-test="unlock-problem"]').text()).not.toMatch(
            /PIN was|password was/i,
        );

        await wrapper.find('[data-test="unlock-answer"] input').setValue("open sesame");
        await press(wrapper, "unlock-pin", "482916");
        await wrapper.find('[data-test="unlock-submit"]').trigger("click");
        await vi.waitFor(() => expect(wrapper.emitted("unlocked")).toBeTruthy());
        wrapper.unmount();
    });

    it("spends one budget whether the PIN was typed or pressed", async () => {
        const store = await combined();
        const id = store.locks.value[0]!.id;
        const wrapper = mountWith(UnlockPrompt, { lock: store.locks.value[0] }, store);
        await flushPromises();
        for (const route of ["typed", "pressed"] as const) {
            await wrapper.find('[data-test="unlock-answer"] input').setValue("wrong");
            if (route === "typed") {
                await wrapper.find('[data-test="unlock-pin-field"] input').setValue("000000");
            } else {
                await press(wrapper, "unlock-pin", "000000");
            }
            await wrapper.find('[data-test="unlock-submit"]').trigger("click");
            await vi.waitFor(() =>
                expect(wrapper.find('[data-test="unlock-problem"]').exists()).toBe(true),
            );
            await flushPromises();
        }
        expect(store.failures(id)).toBe(2);
        wrapper.unmount();
    });
});

describe("the ladder, opened from the prompt", () => {
    async function waiting() {
        const store = createLockStore({ host: host() });
        await store.load();
        await store.add(target, { method: "pin", pin: "482916" });
        const id = store.locks.value[0]!.id;
        for (let index = 0; index < 3; index += 1) await store.attempt(id, { pin: "000000" });
        return { store, id };
    }

    it("is not offered before there is a wait to skip", async () => {
        const store = createLockStore({ host: host() });
        await store.load();
        await store.add(target, { method: "pin", pin: "482916" });
        const wrapper = mountWith(UnlockPrompt, { lock: store.locks.value[0] }, store);
        await flushPromises();
        expect(wrapper.find('[data-test="unlock-ladder-open"]').exists()).toBe(false);
        wrapper.unmount();
    });

    it("opens while a wait runs, says what winning gets, and hands back to the credential", async () => {
        const { store, id } = await waiting();
        const wrapper = mountWith(UnlockPrompt, { lock: store.locks.value[0] }, store);
        await flushPromises();
        await wrapper.find('[data-test="unlock-ladder-open"]').trigger("click");
        await flushPromises();

        const ladder = wrapper.findComponent(UnlockLadder);
        expect(ladder.exists()).toBe(true);
        // Fields are swapped out while the ladder shows, so nothing is submitted by accident.
        expect(wrapper.find('[data-test="unlock-submit"]').exists()).toBe(false);
        expect(wrapper.find('[data-test="ladder-honest"]').text()).toContain("ends this wait");
        expect(wrapper.find('[data-test="ladder-honest"]').text()).toContain("stays locked");
        await ladder.vm.$nextTick();
        await wrapper.find('[data-test="ladder-close"]').trigger("click");
        await flushPromises();
        expect(wrapper.find('[data-test="unlock-submit"]').exists()).toBe(true);
        expect(store.isLocked(target.surface, target.path)).toBe(true);
        expect(store.failures(id)).toBe(3);
        wrapper.unmount();
    });
});

describe("the ladder surface", () => {
    async function mountLadder(schoolMode: boolean) {
        const { store, id } = await (async () => {
            const s = createLockStore({ host: host() });
            await s.load();
            await s.add(target, { method: "pin", pin: "482916" });
            const lockId = s.locks.value[0]!.id;
            for (let index = 0; index < 3; index += 1) await s.attempt(lockId, { pin: "000000" });
            return { store: s, id: lockId };
        })();
        const wrapper = mountWith(
            UnlockLadder,
            { lockId: id, dishes: DISHES, schoolMode, tickMs: 60_000 },
            store,
        );
        await flushPromises();
        return { wrapper, store, id };
    }

    it("clears a wait from the dish rung by pointer, and the lock stays locked", async () => {
        const { wrapper, store, id } = await mountLadder(false);
        const clue = wrapper.find('[data-test="ladder-dish-clue"]').text();
        const choices = wrapper.findAll('[data-test="ladder-dish-choice"]');
        expect(choices).toHaveLength(4);
        const right = choices.find((choice) => choice.text() === NAME_BY_CLUE.get(clue))!;
        await right.trigger("click");
        await flushPromises();
        expect(wrapper.find('[data-test="ladder-cleared"]').exists()).toBe(true);
        expect(store.waitMs(id)).toBe(0);
        expect(store.isLocked(target.surface, target.path)).toBe(true);
        expect(store.open.value).toEqual([]);
        wrapper.unmount();
    });

    it("starts at the sums under School mode, with no dish anywhere on the surface", async () => {
        const { wrapper } = await mountLadder(true);
        expect(wrapper.find('[data-test="ladder-dimsum"]').exists()).toBe(false);
        expect(wrapper.find('[data-test="ladder-sums"]').exists()).toBe(true);
        expect(wrapper.text()).not.toMatch(/dish|dim sum/i);
        wrapper.unmount();
    });

    it("answers sums from the keyboard, and one wrong sum moves to the moles", async () => {
        const { wrapper } = await mountLadder(true);
        const field = wrapper.find('[data-test="ladder-sum-answer"] input');
        await field.setValue("-999");
        await wrapper.find('[data-test="ladder-sums"]').trigger("submit");
        await flushPromises();
        expect(wrapper.find('[data-test="ladder-moles"]').exists()).toBe(true);
        expect(wrapper.find('[data-test="ladder-mole-start"]').exists()).toBe(true);
        wrapper.unmount();
    });

    it("plays the mole grid by number keys as well as by pointer, every cell a named button", async () => {
        const { wrapper } = await mountLadder(true);
        await wrapper.find('[data-test="ladder-sum-answer"] input').setValue("-999");
        await wrapper.find('[data-test="ladder-sums"]').trigger("submit");
        await flushPromises();
        await wrapper.find('[data-test="ladder-mole-start"]').trigger("click");
        await flushPromises();

        const cells = wrapper.findAll('[data-test^="ladder-mole-cell-"]');
        expect(cells).toHaveLength(9);
        for (const cell of cells) {
            expect(cell.element.tagName).toBe("BUTTON");
            expect(cell.attributes("aria-label")).toMatch(/Cell \d/);
        }
        await wrapper.find('[data-test="ladder-mole-grid"]').trigger("keydown", { key: "5" });
        await flushPromises();
        // Nothing is up in the first moments, so the key registers as a tap on an empty cell.
        expect(wrapper.find('[data-test="ladder-feedback"]').text()).toContain("Nothing there");
        await cells[0]!.trigger("click");
        await flushPromises();
        expect(wrapper.find('[data-test="ladder-feedback"]').text()).toContain("Nothing there");
        wrapper.unmount();
    });

    it("says plainly when the ladder cannot be played", async () => {
        const store = createLockStore({ host: host() });
        await store.load();
        await store.add(target, { method: "pin", pin: "482916" });
        const wrapper = mountWith(
            UnlockLadder,
            { lockId: store.locks.value[0]!.id, dishes: DISHES, schoolMode: false },
            store,
        );
        await flushPromises();
        expect(wrapper.find('[data-test="ladder-unavailable"]').exists()).toBe(true);
        wrapper.unmount();
    });

    it("turns the mole animation off under reduced motion", async () => {
        const { readFileSync } = await import("node:fs");
        const { join } = await import("node:path");
        const source = readFileSync(join(__dirname, "UnlockLadder.vue"), "utf8");
        expect(source).toMatch(
            /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition: none[\s\S]*transform: none/,
        );
    });
});
