// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import Base64Screen from "./Base64Screen.vue";
import { Base64History, DEFAULT_WORKSPACE, STORAGE_KEY, convert } from "./base64Store.js";

globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
} as unknown as typeof ResizeObserver;

const mountScreen = () =>
    mount(Base64Screen, { global: { plugins: [createVuetify(), createI18n({ legacy: false, locale: "en", missingWarn: false, fallbackWarn: false, messages: { en: {} } })] } });

function memoryStorage(): Storage {
    const map = new Map<string, string>();
    return {
        getItem: (k) => map.get(k) ?? null,
        setItem: (k, v) => void map.set(k, v),
        removeItem: (k) => void map.delete(k),
        clear: () => map.clear(),
        key: () => null,
        get length() {
            return map.size;
        },
    };
}

describe("text conversion", () => {
    it("encodes with every option and never returns partial output on a bad decode", () => {
        expect(convert({ ...DEFAULT_WORKSPACE, input: "foob" })).toMatchObject({ ok: true, output: "Zm9vYg==" });
        expect(convert({ ...DEFAULT_WORKSPACE, input: "foob", padding: false })).toMatchObject({ ok: true, output: "Zm9vYg" });
        const mime = convert({ ...DEFAULT_WORKSPACE, alphabet: "mime", input: "x".repeat(100) });
        expect(mime.ok && mime.output.split("\r\n")[0]!.length).toBe(76);
        const bad = convert({ ...DEFAULT_WORKSPACE, direction: "decode", input: "Zm9v*mE=" });
        expect(bad).toMatchObject({ ok: false, reason: "invalid", offset: 4 });
        expect(convert({ ...DEFAULT_WORKSPACE, input: "" })).toMatchObject({ ok: false, reason: "empty" });
        expect(convert({ ...DEFAULT_WORKSPACE, encoding: "latin1", input: "世" })).toMatchObject({ ok: false, reason: "encoding" });
    });
});

describe("history", () => {
    it("keeps unlimited undo and redo, and across a restart only when inputs are kept", () => {
        const storage = memoryStorage();
        const first = new Base64History(storage);
        for (let i = 0; i < 300; i += 1) first.change({ ...DEFAULT_WORKSPACE, input: `v${i}` });
        expect(first.past.length).toBe(300);
        first.undo();
        expect(first.current.input).toBe("v298");
        // Default: nothing typed is written to disk.
        expect(storage.getItem(STORAGE_KEY)).not.toContain("v298");
        expect(new Base64History(storage).canUndo).toBe(false);

        first.setKeepInputs(true);
        const restarted = new Base64History(storage);
        expect(restarted.current.input).toBe("v298");
        expect(restarted.canRedo).toBe(true);
        expect(restarted.redo().input).toBe("v299");
        expect(restarted.undo().input).toBe("v298");
    });

    it("records names, sizes and hashes, not payloads, and clears everything", () => {
        const storage = memoryStorage();
        const h = new Base64History(storage);
        h.record({ kind: "text", direction: "encode", variant: "Standard", inputName: "Typed text", inputBytes: 3, outputName: null, outputBytes: 4, sha256: "ab", ok: true, message: "" });
        expect(JSON.parse(storage.getItem(STORAGE_KEY)!).history[0].inputName).toBe("Typed text");
        h.clear();
        expect(new Base64History(storage).entries).toEqual([]);
    });
});

describe("the Base64 screen", () => {
    beforeEach(() => {
        localStorage.clear();
        Object.defineProperty(window, "worldlens", { configurable: true, value: undefined });
    });

    it("encodes as you type and points at the exact bad character when decoding", async () => {
        const wrapper = mountScreen();
        await wrapper.find("textarea").setValue("Bayville");
        expect(wrapper.find("output").text()).toBe("QmF5dmlsbGU=");
        await wrapper.findAll("button").find((b) => b.text() === "Decode")!.trigger("click");
        await wrapper.find("textarea").setValue("QmF5*mlsbGU=");
        expect(wrapper.find(".wl-b64__error").text()).toContain("character 5");
        expect(wrapper.find("mark").text()).toBe("*");
        expect(wrapper.find("output").exists()).toBe(false);
    });

    it("undoes and redoes a run of typing as one step", async () => {
        const wrapper = mountScreen();
        const area = wrapper.find("textarea");
        await area.setValue("a");
        await area.setValue("ab");
        await area.setValue("abc");
        await wrapper.findAll("button").find((b) => b.text() === "Undo")!.trigger("click");
        expect((wrapper.find("textarea").element as HTMLTextAreaElement).value).toBe("");
        await wrapper.findAll("button").find((b) => b.text() === "Redo")!.trigger("click");
        expect((wrapper.find("textarea").element as HTMLTextAreaElement).value).toBe("abc");
    });

    it("previews decoded images with a plain img and SVG as hex, never as markup", async () => {
        const wrapper = mountScreen();
        await wrapper.findAll("button").find((b) => b.text() === "Decode")!.trigger("click");
        URL.createObjectURL = vi.fn(() => "blob:x");
        URL.revokeObjectURL = vi.fn();
        await wrapper.find("textarea").setValue(btoa("\x89PNG\r\n\x1a\nrest"));
        await flushPromises();
        expect(wrapper.find("[data-test=base64-preview] img").exists()).toBe(true);
        await wrapper.find("textarea").setValue(btoa('<svg onload="alert(1)"></svg>'));
        await flushPromises();
        expect(wrapper.find("[data-test=base64-preview] svg").exists()).toBe(false);
        expect(wrapper.find("[data-test=base64-preview] img").exists()).toBe(false);
        expect(wrapper.find("[onload]").exists()).toBe(false);
        expect(wrapper.find("[data-test=base64-preview] pre").text()).toContain("<svg onload");
    });

    it("explains that files download under the same names without the desktop app", async () => {
        const wrapper = mountScreen();
        await wrapper.findAll("[role=tab]").find((b) => b.text() === "Files")!.trigger("click");
        expect(wrapper.text()).toContain("name.ext.base64.txt");
        expect(wrapper.text()).toContain("report.pdf.base64.txt → report.pdf");
    });
});
