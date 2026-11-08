// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import ExternalEditorPanel from "./ExternalEditorPanel.vue";

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

function install(editors: { id: string; name: string; path: string; kind: string; source: string }[]) {
    const bridge = {
        list: vi.fn().mockResolvedValue({ editors, chosen: editors[0]?.id ?? null }),
        choose: vi.fn().mockResolvedValue(true),
        add: vi.fn().mockResolvedValue({ ok: true, message: "Added MyEditor and chose it." }),
        remove: vi.fn().mockResolvedValue(undefined),
        open: vi.fn(),
        openInVsCode: vi.fn(),
        openText: vi.fn(),
    };
    Object.defineProperty(window, "worldlens", { configurable: true, value: { editors: bridge } });
    return bridge;
}

describe("the external editor settings", () => {
    it("lists what was found with paths, chooses one and says what that means", async () => {
        const bridge = install([
            { id: "vscode", name: "Visual Studio Code", path: "C:\\Program Files\\Microsoft VS Code\\Code.exe", kind: "vscode", source: "detected" },
            { id: "notepadpp", name: "Notepad++", path: "C:\\Program Files\\Notepad++\\notepad++.exe", kind: "other", source: "detected" },
        ]);
        const w = mount(ExternalEditorPanel, { global: { plugins: plugins() } });
        await flushPromises();
        expect(w.text()).toContain("C:\\Program Files\\Notepad++\\notepad++.exe");
        expect(w.text()).not.toContain("Get Visual Studio Code");
        await w.findAll("input[type=radio]")[1]!.setValue(true);
        await flushPromises();
        expect(bridge.choose).toHaveBeenCalledWith("notepadpp");
        expect(w.text()).toContain("Notepad++ opens project folders and files from now on.");
    });

    it("says plainly when nothing is found and offers VS Code's download page", async () => {
        install([]);
        const w = mount(ExternalEditorPanel, { global: { plugins: plugins() } });
        await flushPromises();
        expect(w.text()).toContain("No external editor was found on this computer.");
        expect(w.find("a[href='https://code.visualstudio.com/download']").exists()).toBe(true);
    });

    it("explains that editors need the desktop app outside it", () => {
        const w = mount(ExternalEditorPanel, { global: { plugins: plugins() } });
        expect(w.text()).toContain("External editors are chosen in the desktop app");
    });
});
