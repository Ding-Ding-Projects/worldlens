// @vitest-environment jsdom

/**
 * The doc-disclosure and default-provenance line, mounted for a render mask's
 * own shape fields.
 *
 * `explainField.test.ts` proves the pure functions behind this pair; this file
 * proves `ConfigMaskField.vue` actually wires them in for a real shape, because a
 * correct helper nobody calls from the template is indistinguishable, from the
 * user's chair, from no helper at all.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp, VBtn } from "vuetify/components";
import { MASK_SHAPES, type PlainValue } from "@worldlens/config";
import ConfigMaskField from "./ConfigMaskField.vue";
import { UNKNOWN_WORLD, type WorldOrientation } from "./maskCanvas.js";

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

const vuetify = createVuetify();

function emptyI18n() {
    return createI18n({
        legacy: false,
        locale: "none",
        fallbackLocale: "none",
        silentFallbackWarn: true,
        missingWarn: false,
        fallbackWarn: false,
        messages: {},
    });
}

const MEASURED_WORLD: WorldOrientation = {
    extent: { minX: -256, maxX: 767, minZ: -512, maxZ: 511 },
    extentUnavailableReason: null,
    spawn: { x: 8, z: -16 },
    spawnUnavailableReason: null,
    regionCount: 4,
};

function mountMask(modelValue: PlainValue[], world: WorldOrientation = UNKNOWN_WORLD) {
    const host = defineComponent({
        setup: () => () =>
            h(VApp, () => [
                h(ConfigMaskField, {
                    modelValue,
                    label: "Render mask",
                    world,
                    "onUpdate:modelValue": () => {},
                }),
            ]),
    });
    return mount(host, { global: { plugins: [vuetify, emptyI18n()] } });
}

function lastMaskEmission(wrapper: ReturnType<typeof mountMask>): PlainValue[] | undefined {
    const field = wrapper.findComponent(ConfigMaskField);
    const events = field.emitted<PlainValue[][]>("update:modelValue");
    return events?.[events.length - 1]?.[0];
}

function buttonWithText(wrapper: ReturnType<typeof mountMask>, text: string) {
    return wrapper.findAllComponents(VBtn).find((button) => button.text().includes(text));
}

describe("the doc disclosure, on a real shape field", () => {
    // `shape` on a polygon mask is the one deliberately written long enough (past
    // three lines) to prove the toggle really does something, rather than only
    // existing in a case nothing in the schema ever triggers.
    const shapeField = MASK_SHAPES.find((shape) => shape.key === "polygon")!.fields.find(
        (field) => field.path === "shape",
    )!;

    it("starts collapsed and shows the toggle for a doc past the preview length", () => {
        const wrapper = mountMask([{ type: "bluemap:polygon" }]);
        expect(wrapper.text()).toContain(shapeField.doc.split("\n").slice(0, 3).join("\n"));
        expect(wrapper.text()).not.toContain("This only limits X and Z");
        expect(wrapper.text()).toContain("Show the rest of the explanation");
    });

    it("reveals the rest of the explanation once opened, and offers to collapse it again", async () => {
        const wrapper = mountMask([{ type: "bluemap:polygon" }]);
        const toggle = wrapper
            .findAllComponents(VBtn)
            .find((btn) => btn.text().includes("Show the rest of the explanation"));
        expect(toggle).toBeDefined();

        await toggle!.trigger("click");

        expect(wrapper.text()).toContain("This only limits X and Z");
        expect(wrapper.text()).toContain("Show less");
    });

    it("does not offer a toggle for a shape field short enough to already be shown in full", () => {
        // `center-x` on a circle is a single short sentence: already fully visible,
        // so a toggle here would be a control that does nothing.
        const wrapper = mountMask([{ type: "bluemap:circle" }]);
        const buttons = wrapper.findAllComponents(VBtn).map((btn) => btn.text());
        expect(buttons.some((text) => text.includes("Show the rest"))).toBe(false);
    });
});

describe("the provenance line, on a real shape field", () => {
    it("says a field the row never mentions is inherited, naming the real default", () => {
        const wrapper = mountMask([{ type: "bluemap:box" }]);
        expect(wrapper.text()).toContain("Not set here, so BlueMap uses off.");
    });

    it("says a field written to exactly the default is set, not inherited", () => {
        // The box's other fields (min-x, max-y, ...) are legitimately still
        // inherited in this fixture, so the assertion is specific to subtract's own
        // line rather than a page-wide absence of "Not set here".
        const wrapper = mountMask([{ type: "bluemap:box", subtract: false }]);
        expect(wrapper.text()).toContain("Set here, and it matches BlueMap's default.");
    });

    it("says a field written to something else is set, and still names the default", () => {
        const wrapper = mountMask([{ type: "bluemap:box", subtract: true }]);
        expect(wrapper.text()).toContain("Set here. BlueMap's default is off.");
    });

    it("reads BlueMap's unbounded sentinel as 'no limit' rather than as -2147483648", () => {
        const wrapper = mountMask([{ type: "bluemap:box" }]);
        expect(wrapper.text()).toContain("no limit");
        expect(wrapper.text()).not.toContain("-2147483648");
    });
});

describe("the authored badge", () => {
    it("marks every shape field as explained for this app, since map.conf has no per-field comment for any of them", () => {
        const wrapper = mountMask([{ type: "bluemap:box" }]);
        expect(wrapper.text()).toContain("Explained for this app");
    });
});

describe("a spot check against the real schema behaviour", () => {
    it("shows the box shape's real sentinel explanation rather than a placeholder", () => {
        const wrapper = mountMask([{ type: "bluemap:box" }]);
        expect(wrapper.text()).toContain("Integer.MIN_VALUE");
    });

    it("shows the circle shape's real validity rule", () => {
        const wrapper = mountMask([{ type: "bluemap:circle" }]);
        expect(wrapper.text()).toContain("Double.MAX_VALUE");
    });
});

describe("render-mask interactions", () => {
    it("offers the four footprint tools plus a measured region-aligned box", async () => {
        const wrapper = mountMask([], MEASURED_WORLD);
        for (const tool of ["Rectangle", "Circle", "Ellipse", "Polygon", "Region-aligned"]) {
            expect(buttonWithText(wrapper, tool)).toBeDefined();
        }

        await buttonWithText(wrapper, "Region-aligned")!.trigger("click");

        expect(lastMaskEmission(wrapper)).toEqual([
            expect.objectContaining({
                type: "bluemap:box",
                "min-x": -256,
                "max-x": 767,
                "min-z": -512,
                "max-z": 511,
            }),
        ]);
    });

    it("writes explicit Render it / Cut it out semantics into the existing shape row", async () => {
        const wrapper = mountMask([{ type: "bluemap:box" }]);
        expect(wrapper.text()).toContain("Render it");
        expect(wrapper.text()).toContain("Cut it out");

        await buttonWithText(wrapper, "Cut it out")!.trigger("click");

        expect(lastMaskEmission(wrapper)?.[0]).toEqual(
            expect.objectContaining({ type: "bluemap:box", subtract: true }),
        );
    });

    it("removes one explicit shape property to restore that field's inherited default", async () => {
        const wrapper = mountMask([{ type: "bluemap:box", "min-x": 42 }]);
        const reset = wrapper.find('[aria-label="Revert Minimum X to its inherited default"]');
        expect(reset.exists()).toBe(true);

        await reset.trigger("click");

        const record = lastMaskEmission(wrapper)?.[0] as Record<string, PlainValue> | undefined;
        expect(record).toBeDefined();
        expect(Object.hasOwn(record!, "min-x")).toBe(false);
    });

    it("describes the cross-route boundary without presenting a local exactness verdict", () => {
        const text = mountMask([]).text();
        expect(text).toContain("route-equivalence test");
        expect(text).not.toContain("Cloud/Actions and local desktop renders");
    });
});
