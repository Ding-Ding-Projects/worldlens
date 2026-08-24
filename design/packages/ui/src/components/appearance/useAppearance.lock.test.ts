// @vitest-environment jsdom

import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { LOCK_STORE } from "../locks/useLocks.js";
import { createLockStore } from "../locks/lockStore.js";
import { createLock, type LockRecord } from "../locks/lockModel.js";
import { emptyRecord, resolveStateAppearance } from "./appearanceRecord.js";
import {
    emptyState,
    importTheme,
    resolveTarget,
    withoutPreset,
    withPreset,
    withRecord,
} from "./appearanceStore.js";
import { appearancePropertyLockTarget } from "./appearanceLocks.js";
import { appearanceState, commitAppearance, useAppearanceTarget } from "./useAppearance.js";

describe("appearance setters and real lock store", () => {
    it("refuses a locked property while allowing a different property target", async () => {
        commitAppearance(emptyState());
        const gapTarget = appearancePropertyLockTarget("locked", "gap");
        const locked = await createLock(
            gapTarget,
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
            setup(_, { expose }) {
                const target = useAppearanceTarget("locked");
                expose({ target });
                return () => h("button", { onClick: () => target.setSurface("gap", 42) }, "set");
            },
        });
        const view = mount(Test, { global: { provide: { [LOCK_STORE as symbol]: store } } });
        await view.find("button").trigger("click");
        await nextTick();
        expect(appearanceState().value.elements.locked).toBeUndefined();
        expect(store.isLocked(gapTarget.surface, gapTarget.path)).toBe(true);
    });

    it("preserves locked properties through every reset route", async () => {
        const paths = [
            appearancePropertyLockTarget("locked", "fontSize"),
            appearancePropertyLockTarget("locked", "gap"),
            appearancePropertyLockTarget("locked", "gap", "hover"),
            appearancePropertyLockTarget("global", "gap"),
        ];
        const records: LockRecord[] = [];
        for (const [index, target] of paths.entries()) {
            const made = await createLock(
                target,
                { method: "password", password: `test-${index}` },
                { id: `reset-lock-${index}`, iterations: 1, now: "2026-08-24T00:00:00.000Z" },
            );
            expect(made.ok).toBe(true);
            if (made.ok) records.push(made.record);
        }
        const store = createLockStore({
            host: {
                name: "reset test host",
                load: async () => records,
                save: async () => {},
                vault: null,
                dataFolder: "C:/test-data",
            },
        });
        await store.load();
        const source = {
            typography: { fontSize: 18 },
            surface: { gap: 4 },
            states: { hover: { surface: { gap: 8 } } },
        };
        commitAppearance({
            ...emptyState(),
            elements: {
                locked: { ...emptyRecord(), ...source },
                global: { ...emptyRecord(), surface: { gap: 2 } },
            },
        });
        const Test = defineComponent({
            setup(_, { expose }) {
                const target = useAppearanceTarget("locked");
                expose({ target });
                return () => h("div");
            },
        });
        const view = mount(Test, { global: { provide: { [LOCK_STORE as symbol]: store } } });
        const target = (view.vm as unknown as { target: ReturnType<typeof useAppearanceTarget> })
            .target;
        target.resetTypographyProperty("fontSize");
        target.resetSurfaceProperty("gap");
        target.resetStateProperty("hover", "surface", "gap");
        target.resetElement();
        await nextTick();
        expect(appearanceState().value.elements.locked?.typography.fontSize).toBe(18);
        expect(appearanceState().value.elements.locked?.surface.gap).toBe(4);
        expect(appearanceState().value.elements.locked?.states.hover?.surface?.gap).toBe(8);
        target.resetEverything();
        await nextTick();
        expect(appearanceState().value.elements.locked?.surface.gap).toBe(4);
        expect(appearanceState().value.elements.global?.surface.gap).toBe(2);
    });

    it("reconciles locked values through preset, inherit, removal, and theme import changes", async () => {
        const gapTarget = appearancePropertyLockTarget("locked", "gap");
        const made = await createLock(
            gapTarget,
            { method: "password", password: "preset-test" },
            { id: "preset-lock", iterations: 1, now: "2026-08-24T00:00:00.000Z" },
        );
        expect(made.ok).toBe(true);
        if (!made.ok) return;
        const store = createLockStore({
            host: {
                name: "preset test host",
                load: async () => [made.record],
                save: async () => {},
                vault: null,
                dataFolder: "C:/test-data",
            },
        });
        await store.load();
        let state = withRecord(emptyState(), "locked", { ...emptyRecord(), surface: { gap: 4 } });
        state = withPreset(state, "user.demo", "Demo", { ...emptyRecord(), surface: { gap: 99 } });
        commitAppearance(state);
        const Test = defineComponent({
            setup(_, { expose }) {
                const target = useAppearanceTarget("locked");
                expose({ target });
                return () => h("div");
            },
        });
        const view = mount(Test, { global: { provide: { [LOCK_STORE as symbol]: store } } });
        const target = (view.vm as unknown as { target: ReturnType<typeof useAppearanceTarget> })
            .target;

        target.commitState({ ...appearanceState().value, activePreset: "builtin.largeText" });
        expect(appearanceState().value.elements.locked?.surface.gap).toBe(4);
        target.commitState(withoutPreset(appearanceState().value, "user.demo"));
        expect(appearanceState().value.elements.locked?.surface.gap).toBe(4);
        target.setInherit("builtin.highContrast");
        expect(appearanceState().value.elements.locked?.surface.gap).toBe(4);
        const imported = importTheme(
            JSON.stringify({
                format: "worldlens-appearance",
                elements: { locked: { surface: { gap: 1 } } },
            }),
        );
        expect(imported.ok).toBe(true);
        if (!imported.ok) return;
        target.commitState(imported.state);
        expect(appearanceState().value.elements.locked?.surface.gap).toBe(4);
    });

    it("writes compound state groups directly and resets each group as one unit", async () => {
        commitAppearance(emptyState());
        const Test = defineComponent({
            setup(_, { expose }) {
                const target = useAppearanceTarget("compound");
                expose({ target });
                return () => h("div");
            },
        });
        const view = mount(Test);
        const target = (view.vm as unknown as { target: ReturnType<typeof useAppearanceTarget> })
            .target;
        target.setState("hover", {
            icon: { name: "star", color: "red", size: 20, opacity: 1 },
            badge: {
                text: "new",
                color: "white",
                backgroundColor: "blue",
                shape: "pill",
                visible: true,
            },
            separator: { visible: true, color: "red", thickness: 2, style: "solid" },
        });
        const layer = appearanceState().value.elements.compound?.states.hover;
        expect(layer?.icon?.name).toBe("star");
        expect(layer?.icon && "icon" in layer.icon).toBe(false);
        expect(layer?.badge?.text).toBe("new");
        expect(layer?.separator?.visible).toBe(true);
        const resolved = resolveStateAppearance(
            resolveTarget(appearanceState().value, "compound"),
            "hover",
        );
        expect(resolved.surface.icon.name).toBe("star");
        expect(resolved.surface.badge.text).toBe("new");
        expect(resolved.surface.separator.visible).toBe(true);
        target.resetStateProperty("hover", "icon", "__group__");
        target.resetStateProperty("hover", "badge", "__group__");
        target.resetStateProperty("hover", "separator", "__group__");
        expect(appearanceState().value.elements.compound?.states.hover).toBeUndefined();
    });
});
