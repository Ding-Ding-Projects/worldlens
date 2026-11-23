// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import NbtStructureView from "./NbtStructureView.vue";
import type { DocumentInfo, NbtEditorBridge, NodeView } from "./nbtEditorBridge.js";

const n = (id: number, kind: NodeView["kind"], name: string | null, text = ""): NodeView => ({
    id,
    kind,
    name,
    text,
    summary: "",
    childCount: 0,
    listKind: null,
    isBool: false,
    valueLength: 0,
});
const tree: Record<number, NodeView[]> = {
    1: [n(2, "list", "size"), n(3, "list", "palette"), n(4, "list", "blocks")],
    2: [n(5, "int", null, "2"), n(6, "int", null, "1"), n(7, "int", null, "2")],
};
const snbt: Record<number, string> = {
    3: '[{Name:"minecraft:air"},{Name:"minecraft:stone"}]',
    4: "[{pos:[0,0,0],state:1}]",
};
const bridge = {
    children: async (_d: string, id: number) => ({
        ok: true,
        value: { total: 0, nodes: tree[id] ?? [] },
    }),
    snbt: async (_d: string, id: number) => ({
        ok: true,
        value: { text: snbt[id] ?? "[]", truncated: false },
    }),
} as unknown as NbtEditorBridge;
const doc = {
    docId: "d",
    title: "hut.nbt",
    path: "C:/w/generated/minecraft/structure/hut.nbt",
    root: n(1, "compound", ""),
} as unknown as DocumentInfo;

describe("structure view", () => {
    it("draws the layer, lists the palette with counts, and paints with the keyboard as one edit", async () => {
        const w = mount(NbtStructureView, {
            props: { bridge, doc, revision: 0 },
            global: {
                plugins: [
                    createVuetify({ components, directives }),
                    createI18n({
                        legacy: false,
                        missingWarn: false,
                        fallbackWarn: false,
                        locale: "none",
                        messages: {},
                    }),
                ],
            },
        });
        await flushPromises();
        const cells = w.findAll('[role="gridcell"]');
        expect(cells).toHaveLength(4);
        expect(cells[0]!.attributes("aria-label")).toBe("x 0, z 0: Stone");
        expect(w.text()).toContain("Stone");
        const grid = w.find('[role="grid"]');
        await grid.trigger("keydown", { key: "ArrowRight" });
        await grid.trigger("keydown", { key: " " });
        expect(w.emitted("replace")).toEqual([
            [4, "[{pos:[0,0,0],state:1},{pos:[1,0,0],state:0}]"],
        ]);
    });
});
