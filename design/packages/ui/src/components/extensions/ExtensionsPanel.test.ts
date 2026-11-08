// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import ExtensionsPanel from "./ExtensionsPanel.vue";
import { flattenMarkers } from "./extensionBridge.js";

beforeAll(() => {
    globalThis.ResizeObserver ??= class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;
});
afterEach(() => {
    delete (window as unknown as { worldlens?: unknown }).worldlens;
});

const plugins = () => [createVuetify(), createI18n({ legacy: false, locale: "en", missingWarn: false, fallbackWarn: false, messages: { en: {} } })];
const base = { version: "1.0.0", problems: [], limits: { timeoutMs: 10000, maxOutputBytes: 1048576 }, runtime: "node" };

function install() {
    let csvOn = true;
    const list = () => [
        { ...base, id: "marker-csv", name: "Markers as CSV", description: "Writes markers as CSV.", builtIn: true, enabled: csvOn, needsConsent: false, permissions: [{ id: "read-markers", text: "Read the markers of the open map." }], commands: [{ id: "export", title: "Markers as CSV", input: "markers" }] },
        { ...base, id: "word-count", name: "Word count", description: "Counts words.", builtIn: false, enabled: false, needsConsent: true, permissions: [], commands: [{ id: "go", title: "Count", input: "none" }] },
    ];
    const bridge = {
        list: vi.fn(async () => list()),
        setEnabled: vi.fn(async (id: string, on: boolean) => {
            if (id === "marker-csv") csvOn = on;
            return null;
        }),
        run: vi.fn().mockResolvedValue({ ok: true, message: "Counted.", stderr: "", ms: 12, output: { kind: "text", name: "count.txt", text: "3" } }),
        import: vi.fn(),
        openFolder: vi.fn(),
    };
    Object.defineProperty(window, "worldlens", { configurable: true, value: { extensions: bridge } });
    return bridge;
}

describe("the extension manager", () => {
    it("shows each extension's permissions and limits, and searches them", async () => {
        install();
        const w = mount(ExtensionsPanel, { global: { plugins: plugins() } });
        await flushPromises();
        expect(w.text()).toContain("Read the markers of the open map.");
        expect(w.text()).toContain("Stopped after 10 s or 1024 KB of output.");
        await w.find("input[type=text]").setValue("count");
        await flushPromises();
        expect(w.findAll("article")).toHaveLength(1);
    });

    it("asks for consent before turning on an added extension, then runs it", async () => {
        const bridge = install();
        const w = mount(ExtensionsPanel, { global: { plugins: plugins() } });
        await flushPromises();
        expect(w.text()).toContain("Its permissions are new or changed");
        const card = w.findAll("article")[1]!;
        await card.find("input[type=checkbox]").setValue(true);
        await flushPromises();
        expect(bridge.setEnabled).not.toHaveBeenCalled();
        expect(w.text()).toContain("Agree to these permissions?");
        expect(w.text()).toContain("No permissions: it receives no map data.");
        await w.findAll("button").find((b) => b.text() === "Agree and turn on")!.trigger("click");
        expect(bridge.setEnabled).toHaveBeenCalledWith("word-count", true);
    });

    it("says to open a map rather than sending an empty one", async () => {
        const bridge = install();
        const w = mount(ExtensionsPanel, { global: { plugins: plugins() } });
        await flushPromises();
        await w.findAll("button").find((b) => b.text() === "Markers as CSV")!.trigger("click");
        await flushPromises();
        expect(bridge.run).not.toHaveBeenCalled();
        expect(w.text()).toContain("Open a map first");
    });

    it("flattens a marker tree to plain rows without markup", () => {
        const rows = flattenMarkers({ label: "root", markers: [], markerSets: [{ label: "Spawn", markers: [{ label: "<b>Hall</b>", type: "poi", position: { x: 1.234, y: 64, z: -2 } }] }] });
        expect(rows).toEqual([{ set: "Spawn", label: "Hall", type: "poi", x: 1.23, y: 64, z: -2 }]);
    });
});
