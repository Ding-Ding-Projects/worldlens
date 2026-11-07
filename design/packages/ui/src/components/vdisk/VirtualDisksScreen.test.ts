// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import VirtualDisksScreen from "./VirtualDisksScreen.vue";

const GIB = 1024 ** 3;

// Vuetify's tabs measure themselves; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
} as unknown as typeof ResizeObserver;

function install(overrides: Record<string, unknown> = {}) {
    const vdisk = {
        status: vi.fn().mockResolvedValue({ available: true, reason: null, routes: { virtdisk: true, storage: true, diskpart: true, hyperv: false } }),
        list: vi.fn().mockResolvedValue([
            { path: "D:\\Worlds\\Bayville.vhdx", format: "vhdx", fileBytes: 2.6 * GIB, virtualBytes: 64 * GIB, attached: true, diskNumber: 3, readOnly: false, letters: ["E"], inLibrary: true, missing: false },
            { path: "G:\\Archive\\legacy.vhd", format: "vhd", fileBytes: 18 * GIB, virtualBytes: null, attached: false, diskNumber: null, readOnly: false, letters: [], inLibrary: true, missing: false },
        ]),
        history: vi.fn().mockResolvedValue([]),
        addToLibrary: vi.fn().mockResolvedValue({ added: [], refused: [] }),
        removeFromLibrary: vi.fn().mockResolvedValue([]),
        script: vi.fn().mockResolvedValue(""),
        run: vi.fn().mockResolvedValue({ ok: false, cancelled: true, route: "diskpart", message: "Cancelled at the Windows permission prompt. Nothing was changed.", script: "" }),
        quickPack: vi.fn(),
        cancelPack: vi.fn(),
        prepareMapDisk: vi.fn(),
        onProgress: vi.fn().mockReturnValue(() => undefined),
        ...overrides,
    };
    Object.defineProperty(window, "worldlens", { configurable: true, value: { vdisk, dialog: { pickFile: vi.fn(), pickFolder: vi.fn() } } });
    return vdisk;
}

const mountScreen = () =>
    mount(VirtualDisksScreen, { global: { plugins: [createVuetify(), createI18n({ legacy: false, locale: "en", missingWarn: false, fallbackWarn: false, messages: { en: {} } })] } });

describe("the virtual disk manager screen", () => {
    beforeEach(() => {
        install();
    });

    it("lists the library with attach state and names every route, Hyper-V included", async () => {
        const wrapper = mountScreen();
        await flushPromises();
        expect(wrapper.text()).toContain("Bayville.vhdx");
        expect(wrapper.text()).toContain("Attached E:");
        expect(wrapper.text()).toContain("Hyper-V module · not installed");
        expect(wrapper.text()).toContain("works without Hyper-V");
    });

    it("shows the exact script for the chosen operation", async () => {
        const wrapper = mountScreen();
        await flushPromises();
        expect(wrapper.find(".wl-vdisk__script").text()).toContain("Mount-DiskImage -ImagePath 'D:\\Worlds\\Bayville.vhdx'");
    });

    it("reports a declined permission prompt as cancelled rather than done", async () => {
        const vdisk = install();
        const wrapper = mountScreen();
        await flushPromises();
        const run = wrapper.findAll("button").find((b) => b.text().includes("Windows asks once"));
        await run!.trigger("click");
        await flushPromises();
        expect(vdisk.run).toHaveBeenCalled();
        expect(wrapper.text()).toContain("Nothing was changed");
        expect(wrapper.text()).not.toContain("Done through");
    });

    it("says it needs Windows when the manager is unavailable", async () => {
        install({ status: vi.fn().mockResolvedValue({ available: false, reason: "Virtual disks are a Windows feature.", routes: { virtdisk: false, storage: false, diskpart: false, hyperv: false } }), list: vi.fn().mockResolvedValue([]) });
        const wrapper = mountScreen();
        await flushPromises();
        expect(wrapper.text()).toContain("Virtual disks are a Windows feature.");
        expect(wrapper.text()).toContain("No virtual disks yet");
    });

    it("filters by format", async () => {
        const wrapper = mountScreen();
        await flushPromises();
        const chip = wrapper.findAll(".v-chip").find((c) => c.text() === "VHD");
        await chip!.trigger("click");
        expect(wrapper.text()).toContain("legacy.vhd");
        expect(wrapper.find(".wl-vdisk__table").text()).not.toContain("Bayville.vhdx");
    });
});
