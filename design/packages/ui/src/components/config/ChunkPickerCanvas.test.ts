// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import ChunkPickerCanvas from "./ChunkPickerCanvas.vue";
import type { NbtEditorBridge } from "../nbteditor/nbtEditorBridge.js";

const chunk = (x: number, z: number) => ({
    index: z * 32 + x,
    x,
    z,
    size: 1,
    compressionType: 2,
    timestamp: 1,
    readable: true,
    unsupported: null,
});
const bridge = {
    listProject: async () => ({
        ok: true,
        value: {
            projectDir: "/w",
            truncated: false,
            files: [
                {
                    relativePath: "region/r.0.0.mca",
                    name: "r.0.0.mca",
                    group: "region",
                    kind: "region",
                    size: 1,
                },
                {
                    relativePath: "DIM-1/region/r.0.0.mca",
                    name: "r.0.0.mca",
                    group: "nether",
                    kind: "region",
                    size: 1,
                },
            ],
        },
    }),
    listChunks: async (path: string) => ({
        ok: true,
        value: {
            path,
            chunks: path.includes("DIM-1")
                ? [chunk(9, 9)]
                : [chunk(0, 0), chunk(1, 0), chunk(0, 1)],
        },
    }),
} as unknown as NbtEditorBridge;

function make(modelValue: unknown[] = []) {
    return mount(ChunkPickerCanvas, {
        props: {
            bridge,
            worldFolder: "/w",
            dimension: "minecraft:overworld",
            modelValue: modelValue as never,
        },
        global: {
            plugins: [
                createVuetify({ components, directives }),
                createI18n({
                    legacy: false,
                    locale: "en",
                    missingWarn: false,
                    fallbackWarn: false,
                }),
            ],
        },
    });
}

describe("ChunkPickerCanvas", () => {
    it("reads only this dimension's chunks and applies them as mask boxes", async () => {
        const w = make();
        await flushPromises();
        expect(w.text()).toContain("0 of 3 generated chunks picked");
        const apply = w.findAll("button").find((b) => b.text() === "Use these chunks as the mask")!;
        expect(apply.attributes("disabled")).toBeDefined();
        await w
            .findAll("button")
            .find((b) => b.text() === "Select all generated")!
            .trigger("click");
        expect(w.text()).toContain("3 of 3 generated chunks picked");
        await apply.trigger("click");
        const records = w.emitted("apply")![0]![0] as Record<string, number>[];
        expect(records).toEqual([
            { "min-x": 0, "max-x": 31, "min-z": 0, "max-z": 15 },
            { "min-x": 0, "max-x": 15, "min-z": 16, "max-z": 31 },
        ]);
    });

    it("toggles the chunk under the keyboard cursor", async () => {
        const w = make([{ "min-x": 0, "max-x": 15, "min-z": 0, "max-z": 15 }]);
        await flushPromises();
        expect(w.text()).toContain("1 of 3");
        const canvas = w.find("canvas");
        await canvas.trigger("keydown", { key: "ArrowRight" });
        await canvas.trigger("keydown", { key: " " });
        expect(w.text()).toContain("2 of 3");
        expect(w.text()).toContain("Chunk 1, 0: picked");
    });

    it("says when the mask holds shapes it cannot show", async () => {
        const w = make([{ type: "circle", "center-x": 0, "center-z": 0, radius: 9 }]);
        await flushPromises();
        expect(w.text()).toContain("Applying replaces it");
    });
});
