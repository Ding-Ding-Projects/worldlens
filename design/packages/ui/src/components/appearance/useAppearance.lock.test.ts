// @vitest-environment jsdom

import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { LOCK_STORE } from "../locks/useLocks.js";
import { createLockStore } from "../locks/lockStore.js";
import { createLock } from "../locks/lockModel.js";
import { emptyState } from "./appearanceStore.js";
import { appearanceState, commitAppearance, useAppearanceTarget } from "./useAppearance.js";

describe("appearance setters and real lock store", () => {
    it("refuses a locked property while allowing a different property target", async () => {
        commitAppearance(emptyState());
        const locked = await createLock(
            { surface: "appearance", path: "element:locked/base/gap", label: "Gap" },
            { method: "password", password: "test-only" },
            { id: "appearance-gap-lock", iterations: 1, now: "2026-08-24T00:00:00.000Z" },
        );
        expect(locked.ok).toBe(true);
        if (!locked.ok) return;

        const host = {
            name: "test lock host",
            load: async () => [locked.record],
            save: async () => {},
            vault: null,
            dataFolder: "C:/test-data",
        };
        const store = createLockStore({ host });
        await store.load();

        const Test = defineComponent({
            setup() {
                const target = useAppearanceTarget("locked");
                return () => h("button", { onClick: () => target.setSurface("gap", 42) }, "set");
            },
        });
        const view = mount(Test, { global: { provide: { [LOCK_STORE as symbol]: store } } });
        await view.find("button").trigger("click");
        await nextTick();
        expect(appearanceState().value.elements.locked).toBeUndefined();
        expect(store.isLocked("appearance", "element:locked/base/gap")).toBe(true);
    });
});
