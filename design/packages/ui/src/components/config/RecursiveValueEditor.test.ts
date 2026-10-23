// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { shallowMount } from "@vue/test-utils";
import RecursiveValueEditor from "./RecursiveValueEditor.vue";
vi.mock("../mcserver/workflowText.js", () => ({ workflowText: (en: string) => en }));
describe("recursive typed configuration values", () => {
    it("preserves sibling objects and boolean types while editing one nested value", () => {
        const source = { enabled: true, nested: { limit: 4 }, unknown: ["kept"] };
        const wrapper = shallowMount(RecursiveValueEditor, {
            props: { modelValue: source, label: "config" },
        });
        const nested = wrapper
            .findAllComponents({ name: "RecursiveValueEditor" })
            .find((child) => child.props("label") === "nested")!;
        nested.vm.$emit("update:modelValue", { limit: 7 });
        expect(wrapper.emitted("update:modelValue")?.[0]?.[0]).toEqual({
            enabled: true,
            nested: { limit: 7 },
            unknown: ["kept"],
        });
        expect(source.nested.limit).toBe(4);
    });
    it("adds typed account records to an empty record table", async () => {
        const wrapper = shallowMount(RecursiveValueEditor, {
            props: {
                modelValue: [],
                label: "Operators",
                recordTemplate: { uuid: "", name: "", level: 4, bypassesPlayerLimit: false },
            },
            global: { renderStubDefaultSlot: true },
        });
        expect(wrapper.find("v-table-stub").exists()).toBe(true);
        await wrapper
            .findAllComponents({ name: "VBtn" })
            .find((btn) => btn.text() === "Add")!
            .trigger("click");
        expect(wrapper.emitted("update:modelValue")?.[0]?.[0]).toEqual([
            { uuid: "", name: "", level: 4, bypassesPlayerLimit: false },
        ]);
    });
    it("keeps null distinct from an empty string", () => {
        const wrapper = shallowMount(RecursiveValueEditor, {
            props: { modelValue: null, label: "nullable" },
        });
        wrapper.findComponent({ name: "VSelect" }).vm.$emit("update:modelValue", "boolean");
        expect(wrapper.emitted("update:modelValue")?.[0]?.[0]).toBe(false);
    });
});
