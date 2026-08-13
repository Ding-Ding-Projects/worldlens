/**
 * @vitest-environment jsdom
 *
 * The structure list, driven the way a person drives it: discover, render, search, delete.
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VSlider, VSwitch } from "vuetify/components";

import StructureList from "./StructureList.vue";
import type { StructureFile } from "./structureModel.js";
import { recordRender, setStructurePersistence, structureStore } from "./structureStore.js";

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

    document.elementsFromPoint = () => [];
});

beforeEach(() => {
    setStructurePersistence(false);
    structureStore.discovered.splice(0, structureStore.discovered.length);
    structureStore.rendered.splice(0, structureStore.rendered.length);
    structureStore.failure = null;
});

function file(overrides: Partial<StructureFile> = {}): StructureFile {
    return {
        id: "minecraft:nether_bridge_gate",
        name: "nether bridge gate",
        namespace: "minecraft",
        path: "world/generated/minecraft/structures/nether_bridge_gate.nbt",
        sizeBytes: 1024,
        ...overrides,
    };
}

function mountList(props: Record<string, unknown> = {}) {
    return mount(StructureList, {
        props: { files: [], ...props } as never,
        global: {
            plugins: [
                createVuetify(),
                createI18n({ legacy: false, locale: "en", missingWarn: false, fallbackWarn: false }),
            ],
        },
    });
}

describe("empty states", () => {
    it("says there are no structures when the world genuinely has none", () => {
        const wrapper = mountList({ files: [] });
        expect(wrapper.find('[data-test="structure-empty"]').exists()).toBe(true);
        expect(wrapper.find('[data-test="structure-cannot-scan"]').exists()).toBe(false);
    });

    it("says this build cannot look, distinct from the world having no structures", () => {
        const wrapper = mountList({ files: [], canScan: false });
        expect(wrapper.find('[data-test="structure-cannot-scan"]').exists()).toBe(true);
        expect(wrapper.find('[data-test="structure-empty"]').exists()).toBe(false);
    });

    it("says nothing has been rendered yet when the render list is empty", () => {
        const wrapper = mountList({ files: [file()] });
        expect(wrapper.find('[data-test="structure-rendered-empty"]').exists()).toBe(true);
    });
});

describe("discovery and grouping", () => {
    it("groups discovered files by namespace", () => {
        const wrapper = mountList({
            files: [
                file({ id: "a", namespace: "minecraft", name: "village plains" }),
                file({ id: "b", namespace: "mymodpack", name: "boss arena" }),
            ],
        });
        const namespaces = wrapper.findAll('[data-test="structure-namespace"]').map((n) => n.text());
        expect(namespaces).toEqual(["minecraft", "mymodpack"]);
    });

    it("renders a structure when its button is pressed, and marks it rendered", async () => {
        const target = file();
        const wrapper = mountList({ files: [target] });
        const button = wrapper.find('[data-test="structure-render"]');
        expect(button.text()).toContain("Render this structure");
        await button.trigger("click");
        expect(structureStore.rendered).toHaveLength(1);
        expect(structureStore.rendered[0]?.structureId).toBe(target.id);
    });

    it("keeps exactly one render per structure when rendered twice", () => {
        const target = file();
        recordRender({
            id: "r1",
            structureId: target.id,
            name: target.name,
            dataRoot: target.path,
            renderedAt: "2026-01-01T00:00:00.000Z",
        });
        recordRender({
            id: "r2",
            structureId: target.id,
            name: target.name,
            dataRoot: target.path,
            renderedAt: "2026-01-02T00:00:00.000Z",
        });
        expect(structureStore.rendered).toHaveLength(1);
        expect(structureStore.rendered[0]?.id).toBe("r2");
    });
});

describe("search", () => {
    it("filters discovered structures by name", async () => {
        const wrapper = mountList({
            files: [
                file({ id: "a", namespace: "minecraft", name: "village plains" }),
                file({ id: "b", namespace: "minecraft", name: "boss arena" }),
            ],
        });
        const search = wrapper.find('[data-test="structure-discovered-search"] input');
        await search.setValue("boss");
        await wrapper.vm.$nextTick();
        const rows = wrapper.findAll('[data-test="structure-file-row"]');
        expect(rows).toHaveLength(1);
    });

    it("filters rendered structures by name", async () => {
        recordRender({
            id: "r1",
            structureId: "minecraft:gate",
            name: "gate",
            dataRoot: "world/gate.nbt",
            renderedAt: "2026-01-01T00:00:00.000Z",
        });
        recordRender({
            id: "r2",
            structureId: "minecraft:tower",
            name: "tower",
            dataRoot: "world/tower.nbt",
            renderedAt: "2026-01-01T00:00:00.000Z",
        });
        const wrapper = mountList({ files: [] });
        const search = wrapper.find('[data-test="structure-rendered-search"] input');
        await search.setValue("gate");
        await wrapper.vm.$nextTick();
        const rows = wrapper.findAll('[data-test="structure-rendered-row"]');
        expect(rows).toHaveLength(1);
        expect(rows[0]?.text()).toContain("gate");
    });
});

describe("bulk delete", () => {
    beforeEach(() => {
        recordRender({
            id: "r1",
            structureId: "minecraft:gate",
            name: "gate",
            dataRoot: "world/gate.nbt",
            renderedAt: "2026-01-01T00:00:00.000Z",
        });
        recordRender({
            id: "r2",
            structureId: "minecraft:tower",
            name: "tower",
            dataRoot: "world/tower.nbt",
            renderedAt: "2026-01-01T00:00:00.000Z",
        });
    });

    it("deletes only the filtered set, never past an active filter", async () => {
        const wrapper = mountList({ files: [] });
        const search = wrapper.find('[data-test="structure-rendered-search"] input');
        await search.setValue("gate");
        await wrapper.vm.$nextTick();

        await wrapper.find('[data-test="structure-select-filtered"]').trigger("click");
        await wrapper.find('[data-test="structure-remove-selected"]').trigger("click");
        await flushPromises();
        // The gate names what is about to go. Read off the sentence the gate is handed
        // rather than the rendered card, because that card is teleported out of this
        // wrapper and the point being checked is the count, not where it is drawn.
        expect(wrapper.findComponent(ConfigSuperConfirm).props("action")).toContain(
            "This deletes 1 rendered structures",
        );

        const switches = wrapper.findAllComponents(VSwitch);
        expect(switches.length).toBeGreaterThanOrEqual(2);
        await switches[0]!.setValue(true);
        await switches[1]!.setValue(true);
        await flushPromises();
        wrapper.findComponent(VSlider).vm.$emit("update:modelValue", 100);
        await flushPromises();

        expect(structureStore.rendered).toHaveLength(1);
        expect(structureStore.rendered[0]?.name).toBe("tower");
    });

    it("shows an honest count before deleting, and reports how many were deleted", async () => {
        const wrapper = mountList({ files: [] });
        await wrapper.find('[data-test="structure-select-filtered"]').trigger("click");
        await wrapper.find('[data-test="structure-remove-selected"]').trigger("click");
        await flushPromises();
        // The gate names what is about to go. Read off the sentence the gate is handed
        // rather than the rendered card, because that card is teleported out of this
        // wrapper and the point being checked is the count, not where it is drawn.
        expect(wrapper.findComponent(ConfigSuperConfirm).props("action")).toContain(
            "This deletes 2 rendered structures",
        );

        const switches = wrapper.findAllComponents(VSwitch);
        expect(switches.length).toBeGreaterThanOrEqual(2);
        await switches[0]!.setValue(true);
        await switches[1]!.setValue(true);
        await flushPromises();
        wrapper.findComponent(VSlider).vm.$emit("update:modelValue", 100);
        await flushPromises();
        expect(wrapper.find('[data-test="structure-removed"]').text()).toContain("Deleted 2");
        expect(structureStore.rendered).toHaveLength(0);
    });
});

describe("open", () => {
    it("emits open rather than acting on it directly", async () => {
        recordRender({
            id: "r1",
            structureId: "minecraft:gate",
            name: "gate",
            dataRoot: "world/gate.nbt",
            renderedAt: "2026-01-01T00:00:00.000Z",
        });
        const wrapper = mountList({ files: [] });
        await wrapper.find('[data-test="structure-open"]').trigger("click");
        const emitted = wrapper.emitted("open");
        expect(emitted).toBeTruthy();
        expect((emitted?.[0]?.[0] as { id: string }).id).toBe("r1");
    });
});

describe("failure state", () => {
    it("reports an unreadable store rather than pretending it is empty", () => {
        structureStore.failure = "boom";
        const wrapper = mountList({ files: [] });
        expect(wrapper.find('[data-test="structure-failure"]').text()).toContain("boom");
    });
});
