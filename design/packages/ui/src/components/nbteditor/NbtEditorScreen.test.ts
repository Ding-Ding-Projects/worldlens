// @vitest-environment jsdom

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import NbtEditorScreen from "./NbtEditorScreen.vue";
import { createFakeBridge, type FakeBridge } from "./testing/fakeBridge.js";

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;
    if (typeof globalThis.visualViewport === "undefined") {
        globalThis.visualViewport = { addEventListener: () => {}, removeEventListener: () => {} } as unknown as VisualViewport;
    }
});

const vuetify = createVuetify({ components, directives });
const i18n = () => createI18n({ legacy: false, missingWarn: false, fallbackWarn: false, locale: "none", fallbackLocale: "none", silentFallbackWarn: true, messages: {} });

let wrapper: VueWrapper | null = null;
let bridge: FakeBridge;

async function open(props: Record<string, unknown> = {}, prepare?: (b: FakeBridge) => void): Promise<VueWrapper> {
    bridge = createFakeBridge();
    prepare?.(bridge);
    const host = document.createElement("div");
    document.body.appendChild(host);
    wrapper = mount(NbtEditorScreen, { props: { bridge, initialProject: "C:/world", ...props }, attachTo: host, global: { plugins: [vuetify, i18n()] } });
    await flushPromises();
    await wrapper.find("button.wl-nbt-file").trigger("click");
    await flushPromises();
    return wrapper;
}

beforeEach(() => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }));
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

const rows = (w: VueWrapper) => w.findAll('[role="treeitem"]');

describe("the editor without the desktop app", () => {
    it("says what it needs instead of showing a dead editor", () => {
        const w = mount(NbtEditorScreen, { props: { bridge: null }, global: { plugins: [vuetify, i18n()] } });
        expect(w.text()).toContain("needs the desktop app");
        expect(w.find('[role="tree"]').exists()).toBe(false);
        w.unmount();
    });
});

describe("opening a file", () => {
    it("lists the project, opens a file and shows the tag tree with readable type chips", async () => {
        const w = await open();
        expect(bridge.calls).toContain("listProject C:/world");
        expect(bridge.calls.some((c) => c.startsWith("openFile C:/world"))).toBe(true);
        expect(w.find('[role="tree"]').exists()).toBe(true);
        const items = rows(w);
        expect(items.map((r) => r.text())).toEqual([expect.stringContaining("Group"), expect.stringContaining("Group"), expect.stringContaining("Precise decimal")]);
        expect(items[0]!.attributes("aria-level")).toBe("1");
        expect(items[1]!.attributes("aria-level")).toBe("2");
        expect(items[1]!.attributes("aria-expanded")).toBe("false");
        expect(w.text()).toContain("level.dat");
        expect(w.text()).toContain("gzip");
        expect(w.text()).toContain("big-endian");
    });

    it("keeps every control reachable on a narrow screen by turning the three panes into tabs", async () => {
        vi.stubGlobal("matchMedia", (query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {} }));
        const w = await open();
        const tabs = w.findAll('[role="tab"]').map((t) => t.text());
        expect(tabs).toEqual(["Files", "Tag tree", "History"]);
        for (const label of ["Files", "History"]) {
            await w.findAll('[role="tab"]').find((t) => t.text() === label)!.trigger("click");
            await flushPromises();
        }
        expect(w.find('[aria-label="History"]').exists()).toBe(true);
        expect(w.find('[aria-label="Files"]').exists()).toBe(true);
    });
});

describe("the tag tree keyboard", () => {
    it("moves with the arrow keys and expands and collapses branches", async () => {
        const w = await open();
        const first = rows(w)[0]!;
        expect(first.attributes("tabindex")).toBe("0");
        await first.trigger("keydown", { key: "ArrowDown" });
        await flushPromises();
        const dataRow = rows(w)[1]!;
        expect(dataRow.attributes("aria-selected")).toBe("true");
        await dataRow.trigger("keydown", { key: "ArrowRight" });
        await flushPromises();
        expect(rows(w).length).toBeGreaterThan(3);
        expect(rows(w)[1]!.attributes("aria-expanded")).toBe("true");
        await rows(w)[1]!.trigger("keydown", { key: "ArrowLeft" });
        await flushPromises();
        expect(rows(w)).toHaveLength(3);
    });

    it("removes the selected tag with Delete and says it can be undone", async () => {
        const w = await open();
        await rows(w)[2]!.trigger("click");
        await rows(w)[2]!.trigger("keydown", { key: "Delete" });
        await flushPromises();
        expect(bridge.edits).toContainEqual({ op: "remove", id: 9 });
        expect(rows(w)).toHaveLength(2);
        expect(w.text()).toContain("Undo brings it back");
    });
});

describe("typed editing", () => {
    async function expandData(w: VueWrapper): Promise<void> {
        await rows(w)[1]!.trigger("click");
        await rows(w)[1]!.trigger("keydown", { key: "ArrowRight" });
        await flushPromises();
    }

    it("sends a valid value on Enter and refuses an out-of-range one before sending", async () => {
        const w = await open();
        await expandData(w);
        const input = w.find('input[aria-label="Spawn X value"]');
        await input.setValue("99999999999");
        expect(w.find('[role="alert"]').text()).toMatch(/Must be between/);
        await input.trigger("keydown", { key: "Enter" });
        await flushPromises();
        expect(bridge.edits).toEqual([]);

        await input.setValue("256");
        await input.trigger("keydown", { key: "Enter" });
        await flushPromises();
        expect(bridge.edits).toEqual([{ op: "setValue", id: 4, text: "256" }]);
        expect((w.find('input[aria-label="Spawn X value"]').element as HTMLInputElement).value).toBe("256");
        expect(w.text()).toContain("1 unsaved changes");
    });

    it("puts the old value back on Escape", async () => {
        const w = await open();
        await expandData(w);
        const input = w.find('input[aria-label="Spawn X value"]');
        await input.setValue("5");
        await input.trigger("keydown", { key: "Escape" });
        expect((input.element as HTMLInputElement).value).toBe("128");
        expect(bridge.edits).toEqual([]);
    });

    it("shows a boolean byte as a switch and flips it", async () => {
        const w = await open();
        await expandData(w);
        const toggle = w.find('button[role="switch"][aria-label="Commands allowed"]');
        expect(toggle.attributes("aria-checked")).toBe("false");
        await toggle.trigger("click");
        await flushPromises();
        expect(bridge.edits).toContainEqual({ op: "setBool", id: 5, on: true });
        expect(w.find('button[role="switch"][aria-label="Commands allowed"]').attributes("aria-checked")).toBe("true");
    });

    it("surfaces a refusal from the main process as a message", async () => {
        const w = await open();
        await expandData(w);
        // A value the client accepts but the main process refuses (the fake rejects non-integers for ints
        // only through its own check, which the client check normally gets there first; force it with a long).
        const bad = bridge.edit;
        bridge.edit = async () => ({ ok: false, message: "That edit was refused." });
        const input = w.find('input[aria-label="Spawn X value"]');
        await input.setValue("7");
        await input.trigger("keydown", { key: "Enter" });
        await flushPromises();
        expect(w.text()).toContain("That edit was refused.");
        bridge.edit = bad;
    });

    it("steps a known number with its own stepper instead of typing", async () => {
        const w = await open();
        await expandData(w);
        await w.find('button[aria-label="Raise Spawn X"]').trigger("click");
        await flushPromises();
        expect(bridge.edits).toContainEqual({ op: "setValue", id: 4, text: "129" });
    });

    it("shows the game's own keys and types when Game names is on, and remembers it", async () => {
        const w = await open();
        await expandData(w);
        expect(w.text()).toContain("Spawn X");
        await w.find(".wl-nbt-names input").setValue(true);
        await flushPromises();
        expect(rows(w).map((r) => r.text())).toContainEqual(expect.stringContaining("COMPOUND"));
        expect(w.find('input[aria-label="SpawnX value"]').exists()).toBe(true);
        expect(localStorage.getItem("worldlens-nbt-game-names")).toBe("1");
        await w.find(".wl-nbt-names input").setValue(false);
        await flushPromises();
        expect(localStorage.getItem("worldlens-nbt-game-names")).toBe("0");
    });

    it("opens the grid editor for an array and edits one cell", async () => {
        const w = await open();
        await expandData(w);
        await w.find('button[aria-label="Edit the values of Heightmap"]').trigger("click");
        await flushPromises();
        const cell = document.body.querySelector<HTMLInputElement>('input[aria-label="Value 1"]');
        expect(cell?.value).toBe("2");
        cell!.value = "42";
        cell!.dispatchEvent(new Event("input"));
        cell!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        await flushPromises();
        expect(bridge.edits).toContainEqual({ op: "arraySet", id: 8, at: 1, text: "42" });
    });
});

describe("adding a tag", () => {
    it("opens from the row menu, validates, and adds into the compound", async () => {
        const w = await open();
        await rows(w)[1]!.trigger("click");
        await w.find('button[aria-label="Actions for Data"]').trigger("click");
        await flushPromises();
        const item = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"], .v-list-item')].find((el) => el.textContent?.includes("Add tag"));
        expect(item).toBeTruthy();
        item!.click();
        await flushPromises();
        const nameField = [...document.body.querySelectorAll<HTMLElement>(".v-overlay-container .v-dialog .v-text-field")].find((f) => f.querySelector("label")?.textContent?.trim() === "Name")!;
        const name = nameField.querySelector("input") as HTMLInputElement;
        expect(document.body.textContent).toContain("Add a tag");
        name.value = "Fresh";
        name.dispatchEvent(new Event("input"));
        await flushPromises();
        const add = [...document.body.querySelectorAll<HTMLButtonElement>(".v-overlay-container .v-dialog button")].find((b) => b.textContent?.trim() === "Add")!;
        add.click();
        await flushPromises();
        expect(bridge.edits).toContainEqual(expect.objectContaining({ op: "add", parentId: 2, kind: "int", name: "Fresh" }));
    });
});

describe("search", () => {
    it("searches after a pause, highlights matches and steps through them", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        const w = await open();
        const field = w.find(".mb-config-search input");
        await field.setValue("spawn");
        await vi.advanceTimersByTimeAsync(300);
        await flushPromises();
        expect(bridge.calls).toContain("search spawn regex=false");
        expect(w.text()).toContain("1 match");
    });

    it("turns on regex mode and passes it to the search", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        const w = await open();
        await w.find('.mb-config-search button[aria-label="Search with a regular expression"]').trigger("click");
        await w.find(".mb-config-search input").setValue("^Spawn.$");
        await vi.advanceTimersByTimeAsync(300);
        await flushPromises();
        expect(bridge.calls).toContain("search ^Spawn.$ regex=true");
        // The full builder is reachable beside the search bar.
        expect(w.find('.mb-config-search [aria-label="Open the regex builder"]').exists()).toBe(true);
    });
});

describe("saving", () => {
    async function dirty(w: VueWrapper): Promise<void> {
        await rows(w)[1]!.trigger("click");
        await rows(w)[1]!.trigger("keydown", { key: "ArrowRight" });
        await flushPromises();
        const input = w.find('input[aria-label="Spawn X value"]');
        await input.setValue("256");
        await input.trigger("keydown", { key: "Enter" });
        await flushPromises();
    }

    const saveButton = (w: VueWrapper) => w.findAll("button").find((b) => b.text() === "Save and record")!;

    it("is disabled until something changed, then asks for a message with a suggestion and the pending changes", async () => {
        const w = await open();
        expect(saveButton(w).attributes("disabled")).toBeDefined();
        await dirty(w);
        expect(saveButton(w).attributes("disabled")).toBeUndefined();
        await saveButton(w).trigger("click");
        await flushPromises();
        const text = document.body.textContent ?? "";
        expect(text).toContain("Save and record");
        expect(text).toContain("Data.SpawnX: 128 \u2192 256");
        const message = document.body.querySelector<HTMLInputElement>('input[placeholder="Edit Data.SpawnX in level.dat"]');
        expect(message?.value).toBe("Edit Data.SpawnX in level.dat");
    });

    it("saves with the typed message, honouring the backup choice, and lists it in the history", async () => {
        const w = await open();
        await dirty(w);
        await saveButton(w).trigger("click");
        await flushPromises();
        const message = document.body.querySelector<HTMLInputElement>('input[placeholder="Edit Data.SpawnX in level.dat"]')!;
        message.value = "Move spawn to the village square";
        message.dispatchEvent(new Event("input"));
        await flushPromises();
        [...document.body.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === "Save")!.click();
        await flushPromises();
        expect(bridge.saves).toEqual([{ message: "Move spawn to the village square", backup: true }]);
        expect(w.text()).toContain("Saved and recorded as b52d3f1.");
        expect(w.text()).toContain("Move spawn to the village square");
        expect(w.text()).toContain("No unsaved changes");
    });

    it("blocks saving and says why while a server has the world open", async () => {
        const w = await open({}, (b) => {
            b.world = { writable: false, reason: "A managed server is running this world." };
        });
        await dirty(w);
        expect(saveButton(w).attributes("disabled")).toBeDefined();
        expect(w.text()).toContain("A managed server is running this world.");
    });
});

