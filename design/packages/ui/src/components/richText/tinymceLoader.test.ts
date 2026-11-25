/**
 * @vitest-environment jsdom
 *
 * The real bundled editor, with nothing replaced.
 *
 * `RichTextField.test.ts` stands in for the editor to read what the field asks of it. This file
 * loads the package itself and proves the pieces the field relies on are really there: the
 * pinned version, the plugins the toolbar names, the skins and the Cantonese language pack that
 * register as bundled resources rather than as files to fetch, and an editor that really
 * initialises and returns content, with no request to any host.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import manifestText from "../../../package.json?raw";
import { loadTinymce, TINYMCE_PINNED_VERSION } from "./tinymceLoader.js";

const manifest = JSON.parse(manifestText) as { dependencies: Record<string, string> };

beforeAll(() => {
    // jsdom has no matchMedia, which TinyMCE reads while it detects the device type.
    globalThis.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    })) as unknown as typeof globalThis.matchMedia;
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("the bundled TinyMCE", () => {
    it("is the exact version package.json pins", async () => {
        const tinymce = await loadTinymce();
        expect(`${tinymce.majorVersion}.${tinymce.minorVersion}`).toBe(TINYMCE_PINNED_VERSION);
        expect(manifest.dependencies.tinymce).toBe(TINYMCE_PINNED_VERSION);
    });

    it("loads once and hands every caller the same instance", async () => {
        expect(await loadTinymce()).toBe(await loadTinymce());
    });

    it("registers every plugin the toolbar uses", async () => {
        const tinymce = await loadTinymce();
        for (const name of ["lists", "link", "autolink", "table", "charmap", "searchreplace", "wordcount", "fullscreen", "help"]) {
            expect(tinymce.PluginManager.get(name), `plugin ${name}`).toBeTypeOf("function");
        }
    });

    it("registers both skins and the editor stylesheets as bundled resources", async () => {
        const tinymce = await loadTinymce();
        for (const resource of [
            "ui/oxide/skin.css",
            "ui/oxide-dark/skin.css",
            "content/default/content.css",
            "content/dark/content.css",
        ]) {
            expect(tinymce.Resource.get(resource), resource).toBeTypeOf("string");
        }
    });

    it("carries the Cantonese interface language without fetching it", async () => {
        const tinymce = await loadTinymce();
        expect(tinymce.util.I18n.hasCode("zh-HK")).toBe(true);
    });
});

describe("a real editor", () => {
    it("initialises on a textarea offline and returns the content it was given", async () => {
        const tinymce = await loadTinymce();
        const requests: string[] = [];
        const realFetch = globalThis.fetch;
        globalThis.fetch = ((input: RequestInfo | URL) => {
            requests.push(String(input));
            return realFetch(input);
        }) as typeof fetch;
        const open = vi.spyOn(XMLHttpRequest.prototype, "open").mockImplementation((_method: string, url: string | URL) => {
            requests.push(String(url));
        });

        const textarea = document.createElement("textarea");
        textarea.value = "<p>Hello <strong>world</strong></p>";
        document.body.append(textarea);

        try {
            const [editor] = await tinymce.init({
                target: textarea,
                license_key: "gpl",
                promotion: false,
                language_load: false,
                skin: "oxide-dark",
                content_css: "dark",
                plugins: "lists link table",
                menubar: false,
            });
            expect(editor).toBeDefined();
            expect(editor!.getContent()).toBe("<p>Hello <strong>world</strong></p>");
            editor!.setContent("<ul><li>one</li></ul>");
            expect(editor!.getContent()).toContain("<li>one</li>");
            editor!.remove();
        } finally {
            globalThis.fetch = realFetch;
            open.mockRestore();
            textarea.remove();
        }

        expect(requests.filter((url) => /tiny/i.test(url))).toEqual([]);
        expect(requests).toEqual([]);
    }, 20_000);

    it("shows its interface in Cantonese from the bundled pack alone", async () => {
        const tinymce = await loadTinymce();
        const textarea = document.createElement("textarea");
        document.body.append(textarea);
        try {
            const [editor] = await tinymce.init({
                target: textarea,
                license_key: "gpl",
                promotion: false,
                language: "zh-HK",
                language_load: false,
                plugins: "lists",
                menubar: false,
            });
            expect(tinymce.util.I18n.getCode()).toBe("zh-HK");
            expect(tinymce.util.I18n.translate("Bold")).not.toBe("Bold");
            editor!.remove();
        } finally {
            tinymce.util.I18n.setCode("en");
            textarea.remove();
        }
    }, 20_000);
});
