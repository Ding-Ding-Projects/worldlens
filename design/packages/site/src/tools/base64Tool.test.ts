// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { I18n } from "../i18n/I18n.js";
import { Preferences } from "../platform/Preferences.js";
import { mountBase64Tool } from "./base64Tool.js";

function memory(): Storage {
    const map = new Map<string, string>();
    return {
        get length() { return map.size; },
        clear() { map.clear(); },
        getItem(k) { return map.get(k) ?? null; },
        key(i) { return [...map.keys()][i] ?? null; },
        removeItem(k) { map.delete(k); },
        setItem(k, v) { map.set(k, v); },
    };
}

function setup() {
    const storage = memory();
    const i18n = new I18n(new Preferences(storage));
    const root = mountBase64Tool(i18n, storage);
    document.body.replaceChildren(root);
    const textarea = root.querySelector("textarea")!;
    const type = (value: string) => {
        textarea.value = value;
        textarea.dispatchEvent(new Event("input"));
    };
    const buttons = (label: string) => [...root.querySelectorAll("button")].find((b) => b.textContent === label)!;
    return { root, type, buttons, i18n };
}

describe("the Base64 tool on the site", () => {
    it("encodes as you type, marks the exact bad character, and undoes a typing run as one step", () => {
        const { root, type, buttons } = setup();
        type("B");
        type("Bayville");
        expect(root.querySelector("output")!.textContent).toBe("QmF5dmlsbGU=");
        buttons("Decode").click();
        type("QmF5*mlsbGU=");
        expect(root.querySelector(".mb-tool-error")!.textContent).toContain("character 5");
        expect(root.querySelector("mark")!.textContent).toBe("*");
        expect((root.querySelector("output") as HTMLElement).hidden).toBe(true);
        // Undo steps back through: the typed Base64, the switch to Decode, then the typing run.
        buttons("Undo").click();
        expect(root.querySelector("textarea")!.value).toBe("Bayville");
        buttons("Undo").click();
        expect(root.querySelector("output")!.textContent).toBe("QmF5dmlsbGU=");
        buttons("Undo").click();
        expect(root.querySelector("textarea")!.value).toBe("");
        buttons("Redo").click();
        expect(root.querySelector("textarea")!.value).toBe("Bayville");
    });

    it("shows decoded markup as text, never as an element", () => {
        const { root, type, buttons } = setup();
        buttons("Decode").click();
        type(btoa('<svg onload="alert(1)"></svg>'));
        expect(root.querySelector("svg")).toBeNull();
        expect(root.querySelector("[onload]")).toBeNull();
        expect(root.querySelector(".mb-tool-preview pre")!.textContent).toContain("<svg onload");
    });

    it("follows the language setting", () => {
        const { root, i18n } = setup();
        i18n.setMode("yue");
        expect(root.textContent).toContain("編碼");
        expect(root.textContent).toContain("嚴格解碼");
    });
});
