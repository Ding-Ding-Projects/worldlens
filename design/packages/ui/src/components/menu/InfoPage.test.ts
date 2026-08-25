// @vitest-environment jsdom

/**
 * The Info page, mounted.
 *
 * Two things this page does are invisible to a type checker and easy to lose in a later
 * edit, so they are pinned here.
 *
 * The first is the application's own version. The preload has exposed `getVersion()` over
 * `app:version` since the bridge was written and nothing ever called it, so the number a
 * person would quote in a bug report reached no screen at all. It is fetched after mount
 * and it is feature-detected: this package also runs in a browser tab, where there is no
 * preload to ask, and the difference between "this build has no version" and "nobody here
 * can be asked" is the whole point of showing nothing rather than an empty label.
 *
 * The second is what happens to the locale's own markup on the way to the DOM. Every
 * translation of `info.content` opens with an unlabelled `<img>` pointing at the 200px
 * logo, and the page renders it at 40% of the sheet width. The component names that image
 * and points it at the circular 512px copy that already ships beside it; both are silent
 * DOM edits that no other test would notice going missing.
 */

import { afterEach, describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import InfoPage from "./InfoPage.vue";
import { productDisplayName } from "../../stores/productName.js";

/**
 * A stand-in for `info.content`, in the shape every real translation has: an unlabelled
 * logo, a `{version}` the locale interpolates itself, and an external link.
 *
 * Deliberately short. The point is the DOM edits, and the real strings are three tables of
 * `<kbd>` keys that would say nothing more about them.
 */
const CONTENT =
    '<img src="assets/logo.png" style="width: 40%">' +
    "<p>Generated with BlueMap {version}</p>" +
    '<p><a href="https://bluecolo.red/bluemap">BlueMap</a></p>';

function i18n(content: string | null = CONTENT) {
    return createI18n({
        legacy: false,
        missingWarn: false,
        fallbackWarn: false,
        locale: content === null ? "none" : "en",
        fallbackLocale: "none",
        silentFallbackWarn: true,
        messages: content === null ? {} : { en: { info: { content } } },
    });
}

/**
 * This page renders real Vuetify components (a divider and the docs button), so the plugin
 * has to be installed for the same reason `MainMenu.test.ts` installs it: without it every
 * mount throws "[Vuetify] Could not find defaults instance" before a single assertion runs,
 * and all thirteen tests in this file fail for one reason that has nothing to do with any of
 * them. They were failing exactly that way before this line existed.
 */
const vuetify = createVuetify({ components, directives });

/** Installs a preload, or removes it, exactly as the component feature-detects one. */
function setBridge(bridge: BridgeStub | null): void {
    const scope = globalThis as { worldlens?: unknown };
    if (bridge === null) delete scope.worldlens;
    else scope.worldlens = bridge;
}

/**
 * What a preload can offer this page. Both methods are optional and independently absent,
 * because a browser tab has neither and an older shell can have the version without the
 * build provenance, and the page has to stay honest in all four combinations.
 */
type BridgeStub = {
    getVersion?: () => Promise<string>;
    getBuildProvenance?: () => Promise<{ version: string; builtAt: string | null }>;
};

async function render(bridge: BridgeStub | null, content?: string | null) {
    setBridge(bridge);
    const wrapper = mount(InfoPage, { global: { plugins: [vuetify, i18n(content)] } });
    await flushPromises();
    return wrapper;
}

afterEach(() => {
    setBridge(null);
    productDisplayName.value = "Worldlens";
});

describe("when this build was made", () => {
    const version = () => Promise.resolve("0.4.2");

    it("states the recorded instant, in local time, to the second, with the zone named", async () => {
        const wrapper = await render({
            getVersion: version,
            getBuildProvenance: () =>
                Promise.resolve({ version: "0.4.2", builtAt: "2026-08-25T04:53:17.000Z" }),
        });

        const text = wrapper.text();
        // Formatted through Intl in whatever timezone this test runs in, so the assertion is
        // on the parts that must survive that rather than on one machine's rendering: the
        // year, seconds resolution, and a named zone. A line reading "14:32" with no zone is
        // not something a reader in another country can act on, which is why the zone is
        // asserted rather than assumed.
        expect(text).toContain("2026");
        expect(text).toMatch(/\d{1,2}:\d{2}:\d{2}/);
        expect(text).toMatch(/(GMT|UTC|[A-Z]{2,5}T)/);
        wrapper.unmount();
    });

    it("says the time was not recorded when the build genuinely has none", async () => {
        const wrapper = await render({
            getVersion: version,
            getBuildProvenance: () => Promise.resolve({ version: "0.4.2", builtAt: null }),
        });

        expect(wrapper.text()).toContain("not recorded");
        wrapper.unmount();
    });

    it("never substitutes the current time for a build that recorded none", async () => {
        // The assertion this whole feature exists for. `null` is an honest answer, and the
        // tempting repair - falling back to `new Date()` - would render the moment somebody
        // opened this page as a fact about when the build was made. It would also look
        // completely correct on screen, which is what makes it worth a test rather than a
        // comment.
        const thisYear = String(new Date().getFullYear());
        const wrapper = await render({
            getVersion: version,
            getBuildProvenance: () => Promise.resolve({ version: "0.4.2", builtAt: null }),
        });

        const line = wrapper.findAll(".mb-info-page__version").at(-1);
        expect(line?.text()).not.toContain(thisYear);
        wrapper.unmount();
    });

    it("says nothing when the shell is too old to have the method", async () => {
        // Not the same state as "the build has no recorded time", and it must not render as
        // it: nobody here has been asked, so there is nothing to report either way.
        const wrapper = await render({ getVersion: version });

        expect(wrapper.text()).not.toContain("not recorded");
        wrapper.unmount();
    });

    it("stays quiet rather than repeating the fault when the channel itself fails", async () => {
        const wrapper = await render({
            getVersion: version,
            getBuildProvenance: () => Promise.reject(new Error("channel is broken")),
        });

        expect(wrapper.text()).not.toContain("channel is broken");
        wrapper.unmount();
    });
});

describe("the application's own version", () => {
    it("states the version the shell reports", async () => {
        const wrapper = await render({ getVersion: () => Promise.resolve("0.4.2") });

        expect(wrapper.text()).toContain("Worldlens 0.4.2");
        wrapper.unmount();
    });

    it("uses the cosmetic display name in About without changing the version", async () => {
        productDisplayName.value = "My Map Desk";
        const wrapper = await render({ getVersion: () => Promise.resolve("0.4.2") });

        expect(wrapper.text()).toContain("My Map Desk 0.4.2");
        wrapper.unmount();
    });

    it("says nothing at all in a browser tab, rather than an empty label", async () => {
        const wrapper = await render(null);

        expect(wrapper.find(".mb-info-page__version").exists()).toBe(false);
        expect(wrapper.text()).not.toContain("Worldlens");
        wrapper.unmount();
    });

    it("says nothing when a preload exists without that method", async () => {
        const wrapper = await render({});

        expect(wrapper.find(".mb-info-page__version").exists()).toBe(false);
        wrapper.unmount();
    });

    it("stays quiet when the shell answers with a blank string", async () => {
        const wrapper = await render({ getVersion: () => Promise.resolve("   ") });

        expect(wrapper.find(".mb-info-page__version").exists()).toBe(false);
        wrapper.unmount();
    });

    it("reports a refusal in the shell's own words, without the IPC plumbing", async () => {
        const wrapper = await render({
            getVersion: () =>
                Promise.reject(
                    new Error(
                        "Error invoking remote method 'app:version': Error: the main process is still starting",
                    ),
                ),
        });

        expect(wrapper.text()).toContain(
            "This build could not report its version: the main process is still starting",
        );
        expect(wrapper.text()).not.toContain("invoking remote method");
        wrapper.unmount();
    });

    it("shows the version beside the locale content, not instead of it", async () => {
        const wrapper = await render({ getVersion: () => Promise.resolve("0.4.2") });

        expect(wrapper.text()).toContain("Generated with BlueMap");
        expect(wrapper.text()).toContain("Worldlens 0.4.2");
        wrapper.unmount();
    });
});

describe("what the locale markup becomes", () => {
    it("names the logo and points it at the copy that is already circular", async () => {
        const wrapper = await render(null);
        const image = wrapper.get("img");

        expect(image.attributes("src")).toBe("assets/logoCircle512.png");
        expect(image.attributes("alt")).toBe("Worldlens logo: a block world under a map lens");
        wrapper.unmount();
    });

    it("leaves an image a translation points somewhere else alone", async () => {
        const wrapper = await render(null, '<img src="assets/steve.png" alt="A player head">');
        const image = wrapper.get("img");

        expect(image.attributes("src")).toBe("assets/steve.png");
        expect(image.attributes("alt")).toBe("A player head");
        wrapper.unmount();
    });

    it("still opens external links outside the application window", async () => {
        const wrapper = await render(null);
        const link = wrapper.get("a");

        expect(link.attributes("target")).toBe("_blank");
        expect(link.attributes("rel")).toBe("noopener noreferrer");
        wrapper.unmount();
    });

    it("falls back to the bare title when the locale carries no content", async () => {
        const wrapper = await render(null, null);

        expect(wrapper.find(".mb-info-page").exists()).toBe(false);
        expect(wrapper.text()).toContain("Info");
        wrapper.unmount();
    });
});

describe("reaching the docs browser", () => {
    it("offers a button that asks to be taken to the docs browser", async () => {
        const wrapper = await render(null);

        expect(wrapper.text()).toContain("Browse the documentation");
        wrapper.unmount();
    });

    it("emits open-docs rather than navigating itself, so the shell decides how to get there", async () => {
        const wrapper = await render(null);

        await wrapper.get(".mb-info-page__docs-button").trigger("click");

        expect(wrapper.emitted("open-docs")).toHaveLength(1);
        wrapper.unmount();
    });
});
