// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import CreativeStudio from "./CreativeStudio.vue";

describe("CreativeStudio", () => {
    it("mounts the layer controls and changes the live preview from an inline result control", async () => {
        const wrapper = mount(CreativeStudio, { props: { targetLabel: "Logo" } });
        const textButton = wrapper.findAll("button").find((button) => button.text() === "Add text");
        expect(textButton).toBeDefined();
        await textButton!.trigger("click");
        expect(wrapper.text()).toContain("Text");
        const opacity = wrapper.get('input[type="range"]');
        await opacity.setValue("0.25");
        await opacity.trigger("input");
        expect(wrapper.html()).toContain('opacity="0.25"');
    });

    it("keeps the regex builder beside layer search and reports empty matches honestly", async () => {
        const wrapper = mount(CreativeStudio);
        const regex = wrapper.find('button[aria-label="Toggle layer regex builder"]');
        expect(regex.exists()).toBe(true);
        await regex.trigger("click");
        expect(wrapper.text()).toContain("Regex mode uses the local JavaScript engine");
        await wrapper.get('input[type="search"]').setValue("does-not-exist");
        expect(wrapper.text()).toContain("No layer matches this search.");
    });

    it("keeps failed import state visible and does not replace the previous preview", async () => {
        const wrapper = mount(CreativeStudio);
        const input = wrapper.find('input[aria-label="Import creative document"]');
        const invalid = new File(["not json"], "broken.json", { type: "application/json" });
        Object.defineProperty(input.element, "files", { value: [invalid] });
        await input.trigger("change");
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(wrapper.text()).toContain("not valid JSON");
        expect(wrapper.text()).toContain("Live SVG preview");
    });
});
