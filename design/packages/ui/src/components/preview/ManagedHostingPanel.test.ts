// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { shallowMount, flushPromises } from "@vue/test-utils";
import Panel from "./ManagedHostingPanel.vue";
vi.mock("../mcserver/workflowText.js", () => ({ workflowText: (en: string) => en }));
describe("immutable image upload review", () => {
    it("invalidates review when destination, image, context or render changes", async () => {
        let build = 0;
        const upload = vi.fn(async () => ({
            ok: true,
            value: { reference: "docker.io/new/maps:latest", digest: "sha256:uploaded" },
        }));
        vi.stubGlobal("worldlens", {
            managedHosting: {
                exportContext: async () => ({
                    ok: true,
                    value: { contextFingerprint: "context-one", state: "exported" },
                }),
                build: async () => ({
                    ok: true,
                    value: { imageId: `image-${++build}`, contextFingerprint: "context-one" },
                }),
                upload,
            },
        });
        const wrapper = shallowMount(Panel, {
            props: { renderId: "render-one" },
            global: { renderStubDefaultSlot: true },
        });
        // Path inputs are PathField (a text field with a browse button); the rest stay VTextField.
        const field = (label: string) =>
            [
                ...wrapper.findAllComponents({ name: "VTextField" }),
                ...wrapper.findAllComponents({ name: "PathField" }),
            ].find((item) => item.props("label") === label)!;
        const button = (label: string) =>
            wrapper.findAllComponents({ name: "VBtn" }).find((item) => item.text() === label)!;
        field("New export folder").vm.$emit("update:modelValue", "C:/export-one");
        await flushPromises();
        await button("Export verified context").trigger("click");
        await flushPromises();
        await button("Build image").trigger("click");
        await flushPromises();
        const checkbox = wrapper.findComponent({ name: "VCheckbox" });
        for (const [label, value] of [
            ["Namespace", "new"],
            ["Repository", "maps"],
            ["Tag", "release-one"],
        ] as const) {
            checkbox.vm.$emit("update:modelValue", true);
            await flushPromises();
            field(label).vm.$emit("update:modelValue", value);
            await flushPromises();
            expect(checkbox.props("modelValue")).toBe(false);
            expect(button("Upload image").props("disabled")).toBe(true);
        }
        checkbox.vm.$emit("update:modelValue", true);
        await flushPromises();
        await button("Build image").trigger("click");
        await flushPromises();
        expect(checkbox.props("modelValue")).toBe(false);
        checkbox.vm.$emit("update:modelValue", true);
        await flushPromises();
        await button("Upload image").trigger("click");
        await flushPromises();
        expect(upload).toHaveBeenCalledWith({
            imageId: "image-2",
            destination: {
                registry: "docker.io",
                namespace: "new",
                repository: "maps",
                tag: "release-one",
            },
            confirmed: true,
        });
        checkbox.vm.$emit("update:modelValue", true);
        await flushPromises();
        await wrapper.setProps({ renderId: "render-two" });
        expect(checkbox.props("modelValue")).toBe(false);
        wrapper.unmount();
    });
});
