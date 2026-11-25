/**
 * @vitest-environment jsdom
 *
 * The rich text field, driven the way the application drives it: through a stand-in for the
 * bundled editor that records what the field asks of it.
 *
 * The real editor is exercised separately in `tinymceLoader.test.ts`. Here the loader is
 * replaced so these tests can read the exact configuration the field passes (the theme skin, the
 * interface language, the licence route, the absence of any Tiny host) and can feed the field
 * hostile markup as though the editor had produced it.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";

import { setLanguageMode } from "../setup/setupI18n.js";

interface FakeEditor {
    content: string;
    removed: boolean;
    handlers: Map<string, () => void>;
    modeCalls: string[];
    optionCalls: Array<[string, unknown]>;
    on(names: string, handler: () => void): void;
    getContent(args?: { format?: string }): string;
    setContent(html: string): void;
    remove(): void;
    mode: { set(mode: string): void };
    options: { set(name: string, value: unknown): void };
    fire(name: string): void;
}

interface Created {
    config: Record<string, unknown>;
    editor: FakeEditor;
    initialContent: string;
}

const harness = vi.hoisted(() => ({
    created: [] as Array<{
        config: Record<string, unknown>;
        editor: unknown;
        initialContent: string;
    }>,
    failLoad: false,
}));

vi.mock("./tinymceLoader.js", () => {
    class Editor {
        content = "";
        removed = false;
        handlers = new Map<string, () => void>();
        modeCalls: string[] = [];
        optionCalls: Array<[string, unknown]> = [];
        mode = { set: (mode: string) => void this.modeCalls.push(mode) };
        options = { set: (name: string, value: unknown) => void this.optionCalls.push([name, value]) };
        on(names: string, handler: () => void): void {
            for (const name of names.split(" ")) this.handlers.set(name, handler);
        }
        getContent(args?: { format?: string }): string {
            return args?.format === "text" ? this.content.replace(/<[^>]*>/g, "") : this.content;
        }
        setContent(html: string): void {
            this.content = html;
        }
        remove(): void {
            this.removed = true;
        }
        fire(name: string): void {
            this.handlers.get(name)?.();
        }
    }
    return {
        TINYMCE_PINNED_VERSION: "8.11.0",
        TINYMCE_CANTONESE_LANGUAGE: "zh-HK",
        loadTinymce: async () => {
            if (harness.failLoad) throw new Error("chunk missing");
            return {
                init: async (config: { target: HTMLTextAreaElement; setup?: (editor: unknown) => void }) => {
                    const editor = new Editor();
                    editor.content = config.target.value;
                    config.setup?.(editor);
                    harness.created.push({ config, editor, initialContent: config.target.value });
                    return [editor];
                },
            };
        },
    };
});

import RichTextField from "./RichTextField.vue";

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
    harness.created.length = 0;
    harness.failLoad = false;
    setLanguageMode("en");
});

afterEach(() => {
    setLanguageMode("en");
});

function themedVuetify(name: "light" | "dark" = "light") {
    return createVuetify({
        theme: {
            defaultTheme: name,
            themes: {
                light: { dark: false, colors: { surface: "#ffffff", "on-surface": "#111111" } },
                dark: { dark: true, colors: { surface: "#101010", "on-surface": "#eeeeee" } },
            },
        },
    });
}

function mountField(props: Record<string, unknown> = {}, vuetify = themedVuetify()) {
    const wrapper = mount(RichTextField, {
        props: { modelValue: "", label: "Note", ...props } as never,
        global: {
            plugins: [vuetify, createI18n({ legacy: false, locale: "en", missingWarn: false, fallbackWarn: false })],
        },
    });
    return { wrapper, vuetify };
}

function latest(): Created {
    const entry = harness.created.at(-1);
    if (!entry) throw new Error("the editor was never created");
    return entry as unknown as Created;
}

function emitted(wrapper: ReturnType<typeof mountField>["wrapper"]): string[] {
    return (wrapper.emitted("update:modelValue") ?? []).map((args) => args[0] as string);
}

describe("mounting", () => {
    it("starts the bundled editor on its own textarea, labelled for assistive technology", async () => {
        const { wrapper } = mountField({ modelValue: "<p>Hello <strong>world</strong></p>", label: "Marker note" });
        await flushPromises();

        const textarea = wrapper.find("textarea");
        expect(wrapper.find("label").text()).toBe("Marker note");
        expect(wrapper.find("label").attributes("for")).toBe(textarea.attributes("id"));
        expect(latest().config.target).toBe(textarea.element);
        expect(latest().config.iframe_aria_text).toBe("Marker note");
        expect(latest().initialContent).toBe("<p>Hello <strong>world</strong></p>");
        expect(wrapper.attributes("data-state")).toBe("ready");
        wrapper.unmount();
    });

    it("says the editor is loading while it loads", async () => {
        const { wrapper } = mountField();
        expect(wrapper.find('[role="status"]').text()).toContain("Loading the text editor");
        await flushPromises();
        expect(wrapper.find('[role="status"]').exists()).toBe(false);
        wrapper.unmount();
    });

    it("turns a legacy plain note into paragraphs so line breaks and angle brackets survive", async () => {
        const { wrapper } = mountField({ modelValue: "Line one\nA < B & C" });
        await flushPromises();
        expect(latest().initialContent).toBe("<p>Line one</p><p>A &lt; B &amp; C</p>");
        wrapper.unmount();
    });

    it("removes the editor when the field goes away", async () => {
        const { wrapper } = mountField();
        await flushPromises();
        const { editor } = latest();
        wrapper.unmount();
        expect(editor.removed).toBe(true);
    });
});

describe("configuration: bundled, offline and licensed", () => {
    it("uses the GPL route and names no Tiny host, key or fetched asset", async () => {
        const { wrapper } = mountField();
        await flushPromises();
        const { config } = latest();

        expect(config.license_key).toBe("gpl");
        expect(config.language_load).toBe(false);
        expect(config).not.toHaveProperty("api_key");
        expect(config).not.toHaveProperty("skin_url");
        expect(config).not.toHaveProperty("language_url");
        expect(config).not.toHaveProperty("external_plugins");
        expect(config).not.toHaveProperty("images_upload_url");
        expect(config.skin).toBe("oxide");
        expect(config.content_css).toBe("default");

        const text = JSON.stringify({ ...config, target: undefined });
        expect(text).not.toMatch(/tiny\.cloud|cdn\.tiny|https?:\/\//i);
        wrapper.unmount();
    });

    it("loads no image or media plugin, so nothing can be uploaded or fetched from a third party", async () => {
        const { wrapper } = mountField();
        await flushPromises();
        const plugins = String(latest().config.plugins).split(" ");
        expect(plugins).not.toContain("image");
        expect(plugins).not.toContain("media");
        expect(plugins).toContain("lists");
        expect(plugins).toContain("link");
        expect(plugins).toContain("help");
        wrapper.unmount();
    });
});

describe("what the field emits", () => {
    it("round-trips formatted text from the editor", async () => {
        const { wrapper } = mountField({ modelValue: "<p>Start</p>" });
        await flushPromises();
        const { editor } = latest();

        editor.content = "<p>Changed <em>text</em></p><ul><li>one</li></ul>";
        editor.fire("input");
        expect(emitted(wrapper)).toEqual(["<p>Changed <em>text</em></p><ul><li>one</li></ul>"]);
        wrapper.unmount();
    });

    it("strips scripts, event handlers and script URLs before they leave the field", async () => {
        const { wrapper } = mountField();
        await flushPromises();
        const { editor } = latest();

        editor.content =
            '<p onclick="steal()">Hi</p><script>alert(1)</script><img src="x" onerror="alert(2)">' +
            '<a href="javascript:alert(3)">link</a><iframe src="https://example.invalid"></iframe>';
        editor.fire("change");

        const out = emitted(wrapper).at(-1) ?? "";
        expect(out).toContain("Hi");
        expect(out).not.toMatch(/<script|onclick|onerror|javascript:|<iframe/i);
        wrapper.unmount();
    });

    it("stores an emptied editor as an empty note", async () => {
        const { wrapper } = mountField({ modelValue: "<p>Something</p>" });
        await flushPromises();
        const { editor } = latest();

        editor.content = "<p><br></p>";
        editor.fire("input");
        expect(emitted(wrapper).at(-1)).toBe("");
        wrapper.unmount();
    });

    it("applies a changed value from outside without echoing it back", async () => {
        const { wrapper } = mountField({ modelValue: "<p>One</p>" });
        await flushPromises();
        const { editor } = latest();

        await wrapper.setProps({ modelValue: "<p>Two</p>" });
        expect(editor.content).toBe("<p>Two</p>");
        expect(emitted(wrapper)).toEqual([]);
        wrapper.unmount();
    });
});

describe("disabled", () => {
    it("states the exact reason beside the field and starts the editor read-only", async () => {
        const { wrapper } = mountField({ disabled: true, disabledReason: "Notes are locked while the map is rendering." });
        await flushPromises();

        const reason = wrapper.find('[data-test="rich-text-disabled-reason"]');
        expect(reason.text()).toBe("Notes are locked while the map is rendering.");
        expect(wrapper.find("textarea").attributes("aria-describedby")).toContain(reason.attributes("id"));
        expect(latest().config.readonly).toBe(true);
        expect(latest().config.disabled).toBe(true);
        wrapper.unmount();
    });

    it("switches the live editor between read-only and editing", async () => {
        const { wrapper } = mountField({ disabled: false });
        await flushPromises();
        const { editor } = latest();

        await wrapper.setProps({ disabled: true, disabledReason: "Locked." });
        await wrapper.setProps({ disabled: false, disabledReason: "" });
        expect(editor.modeCalls).toEqual(["readonly", "design"]);
        expect(editor.optionCalls).toEqual([
            ["disabled", true],
            ["disabled", false],
        ]);
        wrapper.unmount();
    });
});

describe("follows the application theme and language", () => {
    it("starts in the light skin and rebuilds in the dark one around the same content", async () => {
        const { wrapper, vuetify } = mountField({ modelValue: "<p>Keep me</p>" });
        await flushPromises();
        const first = latest();
        expect(first.config.skin).toBe("oxide");
        expect(first.config.content_css).toBe("default");
        expect(wrapper.attributes("data-theme")).toBe("light");

        first.editor.content = "<p>Edited before the switch</p>";
        vuetify.theme.change("dark");
        await flushPromises();

        expect(first.editor.removed).toBe(true);
        expect(harness.created).toHaveLength(2);
        const second = latest();
        expect(second.config.skin).toBe("oxide-dark");
        expect(second.config.content_css).toBe("dark");
        expect(second.initialContent).toBe("<p>Edited before the switch</p>");
        expect(wrapper.attributes("data-theme")).toBe("dark");
        wrapper.unmount();
    });

    it("starts in the dark skin when the theme is already dark", async () => {
        const { wrapper } = mountField({}, themedVuetify("dark"));
        await flushPromises();
        expect(latest().config.skin).toBe("oxide-dark");
        wrapper.unmount();
    });

    it("uses the Cantonese interface in Cantonese mode and English otherwise", async () => {
        const { wrapper } = mountField();
        await flushPromises();
        expect(latest().config).not.toHaveProperty("language");

        setLanguageMode("yue");
        await flushPromises();
        expect(latest().config.language).toBe("zh-HK");

        setLanguageMode("bilingual");
        await flushPromises();
        expect(latest().config).not.toHaveProperty("language");
        wrapper.unmount();
    });
});

describe("when the editor cannot load", () => {
    it("says so and stays editable as raw formatted text, still sanitized", async () => {
        harness.failLoad = true;
        const { wrapper } = mountField({ modelValue: "<p>Keep this</p>" });
        await flushPromises();

        expect(wrapper.attributes("data-state")).toBe("failed");
        expect(wrapper.find('[role="alert"]').text()).toContain("could not load");

        const textarea = wrapper.find("textarea");
        expect(textarea.attributes("readonly")).toBeUndefined();
        expect((textarea.element as HTMLTextAreaElement).value).toBe("<p>Keep this</p>");

        await textarea.setValue('<p onclick="x()">Edited</p><script>alert(1)</script>');
        const out = emitted(wrapper).at(-1) ?? "";
        expect(out).toContain("Edited");
        expect(out).not.toMatch(/<script|onclick/i);
        wrapper.unmount();
    });
});
