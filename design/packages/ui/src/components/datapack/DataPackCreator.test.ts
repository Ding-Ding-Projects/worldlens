// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import DataPackCreator from "./DataPackCreator.vue";

function make() {
    return mount(DataPackCreator, {
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
            stubs: { CommandBuilder: true },
        },
    });
}

globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
} as unknown as typeof ResizeObserver;

describe("DataPackCreator", () => {
    beforeEach(() => localStorage.clear());

    it("adds a recipe, paints the grid and reports what is missing", async () => {
        const w = make();
        await w
            .findAll("button")
            .find((b) => b.text() === "Add")!
            .trigger("click");
        expect(w.text()).toContain("Put at least one item in the grid.");
        const slot = w.find('[aria-label="Slot 5: empty"]');
        await slot.trigger("click");
        expect(w.find('[aria-label="Slot 5: diamond"]').exists()).toBe(true);
        expect(w.text()).not.toContain("Put at least one item in the grid.");
        expect(w.text()).toContain("Choose what it makes.");
        const save = w.findAll("button").find((b) => b.text() === "Save as .zip")!;
        expect(save.attributes("disabled")).toBeDefined();
    });

    it("keeps the draft between visits", async () => {
        const w = make();
        await w
            .findAll("button")
            .find((b) => b.text() === "Add")!
            .trigger("click");
        await flushPromises();
        w.unmount();
        const again = make();
        expect(again.text()).toContain("new_recipe");
        expect(again.text()).toMatch(/Recipes\s*1/);
    });

    it("switches to functions and adds one", async () => {
        const w = make();
        await w
            .findAll('[role="option"]')
            .find((b) => b.text().startsWith("Functions"))!
            .trigger("click");
        await w
            .findAll("button")
            .find((b) => b.text() === "Add")!
            .trigger("click");
        expect(w.text()).toContain("Run every tick");
        expect(w.text()).toContain("No problems found");
    });
});

describe("DataPackCreator predicates", () => {
    beforeEach(() => localStorage.clear());
    it("adds a predicate and writes its file", async () => {
        const w = make();
        await w
            .findAll('[role="option"]')
            .find((b) => b.text().startsWith("Predicates"))!
            .trigger("click");
        await w
            .findAll("button")
            .find((b) => b.text() === "Add")!
            .trigger("click");
        expect(w.text()).toContain("Snap conditions together");
        expect(w.text()).toContain("All of");
        expect(w.text()).toContain("predicate/new_predicate.json");
    });
});

describe("DataPackCreator function editor", () => {
    beforeEach(() => localStorage.clear());
    it("colours commands, flags unknown ones and suggests completions", async () => {
        const w = make();
        await w
            .findAll('[role="option"]')
            .find((b) => b.text().startsWith("Functions"))!
            .trigger("click");
        await w
            .findAll("button")
            .find((b) => b.text() === "Add")!
            .trigger("click");
        const area = w.find("textarea.wl-fn__input");
        await area.setValue("say hi\nsya oops\ntel");
        (area.element as HTMLTextAreaElement).setSelectionRange(18, 18);
        await area.trigger("keyup");
        expect(w.find(".wl-fn__cmd").text()).toBe("say");
        expect(w.find(".wl-fn__bad").text()).toBe("sya");
        const chips = w.findAll(".wl-fn__chip").map((c) => c.text());
        expect(chips).toEqual(expect.arrayContaining(["tellraw", "teleport"]));
    });

    it("adds another registry part, checks its JSON and filters by search", async () => {
        const w = make();
        const option = (label: string) =>
            w.findAll('[role="option"]').find((b) => b.text().startsWith(label))!;
        await option("More parts").trigger("click");
        await w.findAll("button").find((b) => b.text() === "Add")!.trigger("click");
        await flushPromises();
        const json = w.find(".wl-dp__json textarea");
        expect((json.element as HTMLTextAreaElement).value).toContain("set_count");
        await json.setValue("{ nope");
        expect(w.text()).toContain("This is not valid JSON");
        await json.setValue('[{"function":"minecraft:set_count","count":3}]');
        expect(w.text()).not.toContain("This is not valid JSON");

        const search = w.find(".wl-dp__nav .mb-config-search input");
        await search.setValue("new_item_modifier");
        expect(w.findAll('[role="option"]').map((o) => o.text())).toEqual([
            expect.stringContaining("More parts"),
        ]);
        await search.setValue("zzz-nothing");
        expect(w.text()).toContain("Nothing in this pack matches that.");
    });

    it("adds a version overlay that reaches pack.mcmeta", async () => {
        const w = make();
        await w.findAll('[role="option"]').find((b) => b.text().startsWith("Version overlays"))!.trigger("click");
        await w.findAll("button").find((b) => b.text() === "Add an overlay")!.trigger("click");
        await flushPromises();
        const draft = JSON.parse(localStorage.getItem("worldlens-datapack-draft") ?? "{}") as {
            overlays?: { directory: string }[];
        };
        expect(draft.overlays?.[0]?.directory).toBe("overlay");
    });

    it("makes one advancement the parent of another by dragging", async () => {
        const w = make();
        await w.findAll('[role="option"]').find((b) => b.text().startsWith("Advancements"))!.trigger("click");
        const addBtn = () => w.findAll("button").find((b) => b.text() === "Add")!;
        await addBtn().trigger("click");
        await addBtn().trigger("click");
        await flushPromises();
        const nodes = w.findAll(".wl-dp__node");
        expect(nodes).toHaveLength(2);
        await nodes[1]!.trigger("pointerdown");
        await nodes[0]!.trigger("pointerenter");
        await nodes[0]!.trigger("pointerup");
        expect(w.text()).toContain("new_advancement_2 now comes after new_advancement.");
        const nodes2 = w.findAll(".wl-dp__node");
        await nodes2[0]!.trigger("pointerdown");
        await nodes2[1]!.trigger("pointerup");
        expect(w.text()).toContain("cannot be its parent");
    });

    describe("saving into a world", () => {
        afterEach(() => {
            delete (window as unknown as { worldlens?: unknown }).worldlens;
        });

        it("says it needs the desktop app when there is no bridge", () => {
            const w = make();
            expect(w.text()).toContain("Saving into a world needs the desktop app.");
        });

        it("writes the zip into the chosen world through the bridge", async () => {
            const saveDataPack = vi.fn(async () => ({
                ok: true as const,
                value: { path: "/w/datapacks/my_pack.zip", bytes: 22, replaced: false },
            }));
            (window as unknown as { worldlens: unknown }).worldlens = { nbtEditor: { saveDataPack } };
            const w = make();
            expect(w.text()).toContain("Choose a world first.");
            const field = w.findAll("input").find((i) => i.element.closest(".wl-dp") && i.attributes("aria-label") === undefined && (i.element as HTMLInputElement).type === "text" && i.element.closest(".v-text-field")?.textContent?.includes("World folder"));
            expect(field).toBeDefined();
            await field!.setValue("/w");
            await w.findAll("button").find((b) => b.text() === "Save into this world")!.trigger("click");
            await flushPromises();
            expect(saveDataPack).toHaveBeenCalledWith("/w", "my_pack.zip", expect.any(String));
            const sent = (saveDataPack.mock.calls[0] as unknown as [string, string, string])[2];
            expect(atob(sent).slice(0, 2)).toBe("PK");
            expect(w.text()).toContain("Saved /w/datapacks/my_pack.zip.");
        });
    });
});
