// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import ProviderText from "./ProviderText.vue";

const i18n = () => createI18n({ legacy: false, locale: "en", missingWarn: false, fallbackWarn: false, messages: { en: {} } });
const render = (source: string | null, base: string | null = null) => mount(ProviderText, { props: { source, label: "Release notes for 1.2.0", base }, global: { plugins: [i18n()] } });

describe("the provider text renderer", () => {
    it("renders Markdown as elements in a labelled region", () => {
        const w = render("### Fixed :bug:\n\n- **Tiles** load faster\n- see [the docs](docs/a.md)", "https://github.com/o/r/blob/main/");
        expect(w.find("[role=region]").attributes("aria-label")).toBe("Release notes for 1.2.0");
        expect(w.find("h5").text()).toBe("Fixed 🐛");
        expect(w.find("li strong").text()).toBe("Tiles");
        const link = w.find("a");
        expect(link.attributes("href")).toBe("https://github.com/o/r/blob/main/docs/a.md");
        expect(link.attributes("rel")).toContain("noopener");
        expect(link.attributes("target")).toBe("_blank");
    });

    it("never turns provider text into markup or script", () => {
        const w = render('<img src=x onerror="window.pwned=1"> [x](javascript:window.pwned=1) <a href="https://e.com">a</a>');
        expect(w.find("img").exists()).toBe(false);
        expect(w.findAll("a").length).toBe(0);
        expect(w.text()).toContain("<img src=x onerror=");
        expect((window as unknown as { pwned?: number }).pwned).toBeUndefined();
    });

    it("shows an honest empty state", () => {
        expect(render("").text()).toBe("No notes were provided.");
        expect(render(null).text()).toBe("No notes were provided.");
    });

    it("names images instead of loading them", () => {
        const w = render("![render of spawn](https://example.com/s.png)");
        expect(w.find("img").exists()).toBe(false);
        expect(w.find(".wl-ptext__image").text()).toBe("Image: render of spawn");
    });
});
