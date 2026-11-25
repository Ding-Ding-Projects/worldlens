// @vitest-environment jsdom
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import TypeGeneratorScreen from "./TypeGeneratorScreen.vue";
import { createInProcessTransport, createTypeGenClient } from "./typeGenClient.js";
import { TYPEGEN_FIXED } from "../../copy/surfaces/typegen.js";
import { hubForMember } from "../shell/toolHubs.js";
import { findJob } from "../shell/jobRegistry.js";
import { PRODUCTION_APP_PAGE_IDS } from "../palette/productionPageInventory.js";

globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
} as unknown as typeof ResizeObserver;

const mountScreen = () =>
    mount(TypeGeneratorScreen, {
        props: { client: createTypeGenClient(createInProcessTransport()), debounceMs: 0 },
        attachTo: document.body,
        global: { plugins: [createVuetify(), createI18n({ legacy: false, locale: "en", missingWarn: false, fallbackWarn: false, messages: { en: {} } })] },
    });

async function settle(): Promise<void> {
    for (let i = 0; i < 6; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        await flushPromises();
    }
}

describe("the Generate surface", () => {
    it("generates live, shows the inspector, and derives option controls from the engine", async () => {
        const wrapper = mountScreen();
        await settle();
        expect(wrapper.find("[data-test='empty']").exists()).toBe(true);
        await wrapper.find("[data-test='source-text'] textarea").setValue('{"title":"x","count":2}');
        await settle();
        expect(wrapper.find("[data-test='status']").text()).toMatch(/Generated \d+ lines/);
        expect(wrapper.text()).toContain("interface Root");
        expect(wrapper.find("[data-test='inspector']").text()).toContain("Root");
        const options = wrapper.find("[data-test='language-options']");
        expect(options.find("[data-option='just-types']").exists()).toBe(true);
        expect(options.find("[data-option='just-types'] input[type='checkbox']").exists()).toBe(true);
        wrapper.unmount();
    });

    it("shows a parse error instead of stale output, and names why TypeScript input is off", async () => {
        const wrapper = mountScreen();
        await settle();
        await wrapper.find("[data-test='source-text'] textarea").setValue('{"a": ');
        await settle();
        expect(wrapper.find("[data-test='generate-error']").text()).toMatch(/JSON:/);
        expect(wrapper.find("[data-test='status']").exists()).toBe(false);
        expect(wrapper.find("[data-test='typescript-reason']").text()).toContain("TypeScript compiler");
        wrapper.unmount();
    });

    it("turns a switch into a regenerated result", async () => {
        const wrapper = mountScreen();
        await settle();
        await wrapper.find("[data-test='source-text'] textarea").setValue('{"a":1}');
        await settle();
        expect(wrapper.text()).toContain("Convert");
        await wrapper.find("[data-option='just-types'] input").setValue(true);
        await settle();
        expect(wrapper.text()).not.toContain("Convert");
        wrapper.unmount();
    });
});

describe("the JSON editor", () => {
    it("edits the shared document with undo and redo", async () => {
        const wrapper = mountScreen();
        await settle();
        await wrapper.find("[data-test='source-text'] textarea").setValue('{"name":"Ada"}');
        await wrapper.findAll("[role='tab']")[1]?.trigger("click");
        await settle();
        const editor = wrapper.find("[data-test='json-editor']");
        const nameValue = editor.find("input[aria-label='Value at /name']");
        expect((nameValue.element as HTMLInputElement).value).toBe("Ada");
        await nameValue.setValue("Grace");
        await settle();
        expect((wrapper.find("[data-test='source-text'] textarea").element as HTMLTextAreaElement).value).toContain("Grace");
        expect(editor.find("[data-test='je-history-hint']").text()).toContain("Edit value");
        await editor.find("[data-test='je-undo']").trigger("click");
        await settle();
        expect((editor.find("input[aria-label='Value at /name']").element as HTMLInputElement).value).toBe("Ada");
        await editor.find("[data-test='je-redo']").trigger("click");
        await settle();
        expect((editor.find("input[aria-label='Value at /name']").element as HTMLInputElement).value).toBe("Grace");
        wrapper.unmount();
    });

    it("validates against a schema and pauses on invalid text", async () => {
        const wrapper = mountScreen();
        await settle();
        const schema = JSON.stringify({ type: "object", properties: { age: { type: "integer" } }, required: ["age"] });
        await wrapper.find("[data-test='kind-select']").trigger("click");
        await wrapper.find("[data-test='source-text'] textarea").setValue('{"age":"old"}');
        await wrapper.findAll("[role='tab']")[1]?.trigger("click");
        await settle();
        const editor = wrapper.find("[data-test='json-editor']");
        expect(editor.find("[data-test='je-schema']").text()).toContain("nothing is being validated");
        (wrapper.findComponent({ name: "JsonEditorPanel" }).vm as unknown as { $emit(e: string, v: string): void }).$emit("update:schemaText", schema);
        await settle();
        expect(editor.find("[data-test='je-schema']").text()).toMatch(/1 problems/);
        await wrapper.find("[data-test='source-text'] textarea").setValue('{"age": ');
        await settle();
        expect(editor.find("[data-test='je-parse-error']").exists()).toBe(true);
        wrapper.unmount();
    });
});

describe("registration and copy", () => {
    it("is a tool in the Universal features hub, a job and a palette page", () => {
        expect(hubForMember("typeGenerator")?.id).toBe("toolkit");
        expect(findJob("typeGenerator")?.labelFallback).toBe("Type generator");
        expect(PRODUCTION_APP_PAGE_IDS).toContain("typeGenerator");
    });

    it("has English and Cantonese for every key the screens use", () => {
        const dir = dirname(fileURLToPath(import.meta.url));
        const used = new Set<string>();
        for (const file of readdirSync(dir)) {
            if (!/\.(vue|ts)$/.test(file) || file.endsWith(".test.ts")) continue;
            for (const match of readFileSync(join(dir, file), "utf8").matchAll(/['"](typegen\.[A-Za-z0-9.]+)['"]/g)) used.add(match[1] as string);
        }
        const missing = [...used].filter((key) => !(key in TYPEGEN_FIXED));
        expect(missing).toEqual([]);
        for (const [key, value] of Object.entries(TYPEGEN_FIXED)) {
            expect(value.en.length, key).toBeGreaterThan(0);
            expect(value.yue.length, key).toBeGreaterThan(0);
        }
    });
});
