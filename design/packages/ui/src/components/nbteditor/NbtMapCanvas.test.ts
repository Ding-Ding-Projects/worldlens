// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import NbtMapCanvas from "./NbtMapCanvas.vue";
import type { DocumentInfo, NbtEditorBridge, NodeView } from "./nbtEditorBridge.js";

const node = (id: number, kind: NodeView["kind"], name: string, text = ""): NodeView => ({
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

function bridge(): NbtEditorBridge {
    const children: Record<number, NodeView[]> = {
        1: [node(2, "compound", "data")],
        2: [node(3, "byteArray", "colors"), node(4, "byte", "scale", "2")],
    };
    return {
        children: async (_d: string, id: number) => ({
            ok: true,
            value: { total: children[id]?.length ?? 0, nodes: children[id] ?? [] },
        }),
        arrayPage: async (_d: string, _id: number, offset: number, limit: number) => ({
            ok: true,
            value: {
                total: 16384,
                offset,
                kind: "byteArray",
                values: new Array(Math.max(0, Math.min(limit, 16384 - offset))).fill("4"),
            },
        }),
    } as unknown as NbtEditorBridge;
}

const doc = {
    docId: "d",
    title: "map_3.dat",
    path: "C:/w/data/map_3.dat",
    root: node(1, "compound", ""),
} as unknown as DocumentInfo;

describe("map art canvas", () => {
    it("reads every pixel, paints at the keyboard cursor and sends one replace edit", async () => {
        const w = mount(NbtMapCanvas, {
            props: { bridge: bridge(), doc, revision: 0 },
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
        expect(w.text()).toContain("Map scale");
        const canvas = w.find("canvas");
        await canvas.trigger("keydown", { key: "ArrowRight" });
        await canvas.trigger("keydown", { key: " " });
        const sent = w.emitted("replace");
        expect(sent).toHaveLength(1);
        const [id, snbt] = sent![0] as [number, string];
        expect(id).toBe(3);
        const values = snbt.slice(3, -1).split(",");
        expect(values).toHaveLength(16384);
        // Grass, normal shade (1 * 4 + 2 = 6) at x 1, y 0; the rest untouched.
        expect(values[1]).toBe("6b");
        expect(values[0]).toBe("4b");
    });
});
