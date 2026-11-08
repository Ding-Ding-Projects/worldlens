// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { h } from "vue";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import InfoButton from "./InfoButton.vue";

beforeAll(() => {
    globalThis.ResizeObserver ??= class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;
    globalThis.visualViewport ??= { width: 1024, height: 768, addEventListener: () => {}, removeEventListener: () => {} } as unknown as VisualViewport;
});
afterEach(() => {
    document.body.innerHTML = "";
});

const plugins = () => [createVuetify(), createI18n({ legacy: false, locale: "en", missingWarn: false, fallbackWarn: false, messages: { en: {} } })];
const guide = { purpose: "Fills the text to four characters.", defaultValue: "On.", recovery: "Turn it back on." };

describe("the per-control information button", () => {
    it("names the control it explains and opens its guide with a working example", async () => {
        const w = mount(InfoButton, { attachTo: document.body, props: { control: "Padding", guide, resettable: true }, slots: { playground: () => h("code", "TWE=") }, global: { plugins: plugins() } });
        const button = w.find("[data-test=info-button]");
        expect(button.attributes("aria-label")).toBe("About Padding");
        expect(button.attributes("aria-expanded")).toBe("false");
        await button.trigger("click");
        await flushPromises();
        const panel = document.querySelector("[data-test=info-guide]")!;
        expect(panel.getAttribute("aria-label")).toBe("About Padding");
        expect(panel.textContent).toContain("Fills the text to four characters.");
        expect(panel.textContent).toContain("Default");
        expect(panel.textContent).toContain("If something goes wrong");
        expect(panel.textContent).toContain("TWE=");
        expect(panel.textContent).not.toContain("What is checked");
    });

    it("resets the control through its host", async () => {
        const w = mount(InfoButton, { attachTo: document.body, props: { control: "Padding", guide, resettable: true }, global: { plugins: plugins() } });
        await w.find("[data-test=info-button]").trigger("click");
        await flushPromises();
        const reset = Array.from(document.querySelectorAll("[data-test=info-guide] button")).find((b) => b.textContent?.includes("Reset to default")) as HTMLButtonElement;
        reset.click();
        await flushPromises();
        expect(w.emitted("reset")).toHaveLength(1);
    });
});
