// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import ConverterScreen from "./ConverterScreen.vue";

describe("the packaged converter surface", () => {
    beforeEach(() => {
        const bridge = {
            dialog: { pickFile: vi.fn().mockResolvedValue("C:/input/data.json"), pickFolder: vi.fn().mockResolvedValue("C:/output") },
            converter: {
                catalog: vi.fn().mockResolvedValue([{ id: "data-json", name: "JSON data", category: "structured-data", sourceExtensions: ["json"], targetExtensions: ["json", "yaml", "csv"], bundled: true, available: true, unavailableReason: null, lossiness: "lossless" }, { id: "pdf-core", name: "PDF document tools", category: "documents-pdf", sourceExtensions: ["pdf"], targetExtensions: ["pdf"], bundled: false, available: false, unavailableReason: "The bundled PDF adapter is unavailable.", lossiness: "may-change-metadata" }]),
                inspect: vi.fn().mockResolvedValue({ ok: true, path: "C:/input/data.json", bytes: 12, adapter: { id: "data-json", name: "JSON data", category: "structured-data", sourceExtensions: ["json"], targetExtensions: ["json", "yaml", "csv"], bundled: true, available: true, unavailableReason: null, lossiness: "lossless" }, message: "Detected JSON data." }),
                enqueue: vi.fn().mockResolvedValue({ ok: true, queue: { version: 1, paused: false, items: [] } }),
                queue: vi.fn().mockResolvedValue({ version: 1, paused: false, items: [] }),
                pause: vi.fn().mockResolvedValue({ version: 1, paused: true, items: [] }),
                resume: vi.fn().mockResolvedValue({ version: 1, paused: false, items: [] }),
                cancel: vi.fn().mockResolvedValue(true),
                openInEditor: vi.fn().mockResolvedValue({ ok: true, message: "Opened in Visual Studio Code." }),
            },
        };
        Object.defineProperty(window, "worldlens", { configurable: true, value: bridge });
        Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => "[]", setItem: () => undefined } });
    });

    it("renders every category and keeps unavailable adapters visible", async () => {
        const wrapper = mount(ConverterScreen, { global: { plugins: [createVuetify(), createI18n({ legacy: false, locale: "en", messages: { en: {} } })] } });
        await flushPromises();
        expect(wrapper.text()).toContain("Documents / PDF");
        expect(wrapper.text()).toContain("Structured data / spreadsheets");
        expect(wrapper.text()).toContain("The bundled PDF adapter is unavailable.");
    });

    it("uses the native source and destination pickers, then queues the real conversion", async () => {
        const wrapper = mount(ConverterScreen, { global: { plugins: [createVuetify(), createI18n({ legacy: false, locale: "en", messages: { en: {} } })] } });
        await flushPromises();
        const choose = wrapper.findAll("button").find((button) => button.text().includes("Choose source file"));
        expect(choose).toBeDefined();
        await choose!.trigger("click");
        await flushPromises();
        expect(wrapper.text()).toContain("Detected JSON data.");
        expect(wrapper.text()).toContain("Choose output folder");
    });
});
