// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import NbtInventoryView from "./NbtInventoryView.vue";
import type { DocumentInfo, NbtEditorBridge, NodeView } from "./nbtEditorBridge.js";
import { itemMonogram, newItemSnbt } from "./nbtInventoryModel.js";

const n = (id: number, kind: NodeView["kind"], name: string | null, text = ""): NodeView => ({
    id,
    kind,
    name,
    text,
    summary: `${kind}`,
    childCount: 0,
    listKind: null,
    isBool: false,
    valueLength: 0,
});

const tree: Record<number, NodeView[]> = {
    1: [n(2, "int", "DataVersion", "4189"), n(3, "list", "Inventory"), n(4, "list", "EnderItems")],
    3: [n(10, "compound", null)],
    10: [
        n(11, "byte", "Slot", "0"),
        n(12, "string", "id", "minecraft:diamond_pickaxe"),
        n(13, "int", "count", "1"),
        n(14, "compound", "components"),
    ],
    14: [n(15, "compound", "minecraft:enchantments")],
    15: [n(16, "compound", "levels")],
    16: [n(17, "int", "minecraft:efficiency", "5")],
    4: [],
};

const bridge = {
    children: async (_d: string, id: number) => ({
        ok: true,
        value: { total: tree[id]?.length ?? 0, nodes: tree[id] ?? [] },
    }),
} as unknown as NbtEditorBridge;
const doc = {
    docId: "d",
    title: "abc.dat",
    path: "C:/w/playerdata/abc.dat",
    root: n(1, "compound", ""),
} as unknown as DocumentInfo;

function mountIt() {
    return mount(NbtInventoryView, {
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
}

describe("inventory view", () => {
    it("shows each stack in its slot and edits an enchantment level with a stepper", async () => {
        const w = mountIt();
        await flushPromises();
        const hotbar1 = w.find('[aria-label="Hotbar 1: Diamond Pickaxe"]');
        expect(hotbar1.exists()).toBe(true);
        await hotbar1.trigger("click");
        await flushPromises();
        expect(w.find(".wl-inv__title").text()).toBe("Diamond Pickaxe");
        expect(w.text()).toContain("Efficiency");
        await w.find('button[aria-label="Raise Efficiency"]').trigger("click");
        expect(w.emitted("commit")).toContainEqual([17, "6"]);
    });

    it("puts a new stack into an empty slot in the file's layout", async () => {
        const w = mountIt();
        await flushPromises();
        await w.find('[aria-label="Hotbar 2: empty"]').trigger("click");
        await w.find(".wl-inv__input").setValue("minecraft:torch");
        await w
            .findAll("button")
            .find((b) => b.text() === "Put it here")!
            .trigger("click");
        expect(w.emitted("add")).toEqual([[3, "", '{Slot:1b,id:"minecraft:torch",count:1}']]);
    });
});

describe("inventory model", () => {
    it("writes Count as a byte before 1.20.5 and count after", () => {
        expect(newItemSnbt(4, "minecraft:stone", 70, 3700)).toBe(
            '{Slot:4b,id:"minecraft:stone",Count:64b}',
        );
        expect(newItemSnbt(null, "minecraft:stone", 5, 4189)).toBe(
            '{id:"minecraft:stone",count:5}',
        );
        expect(itemMonogram("minecraft:diamond_pickaxe")).toBe("DP");
        expect(itemMonogram("minecraft:torch")).toBe("TO");
    });
});
