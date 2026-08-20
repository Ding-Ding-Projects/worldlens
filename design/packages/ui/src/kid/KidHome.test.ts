// @vitest-environment jsdom

/**
 * `activity` was a typed prop with no source: `KidShell.vue` declared it, `KidHome.vue` rendered
 * a row for each entry in it, and `App.vue` never once passed `:activity="..."` down to
 * `KidShell` - so the prop was always `undefined`, the row it fed was always empty, and the row
 * of doc comment naming "preview, backups and CI" as its source was aspirational rather than
 * true. Removed rather than left wired to nothing (see `KidHome.vue`'s own doc comment on why).
 *
 * This is the negative-regression side of that removal: it proves the component works correctly
 * with no such prop at all, and that the renders-only empty state is reported from `renderRows` alone
 * once `activity` stops existing to (silently) contribute to that same check.
 */
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import KidHome from "./KidHome.vue";

const vuetify = createVuetify({ components, directives });

function i18n() {
    return createI18n({
        legacy: false,
        missingWarn: false,
        fallbackWarn: false,
        locale: "none",
        fallbackLocale: "none",
        silentFallbackWarn: true,
        messages: {},
    });
}

function home(props: Partial<InstanceType<typeof KidHome>["$props"]> = {}) {
    return mount(KidHome, {
        global: { plugins: [vuetify, i18n()] },
        props: {
            catalogues: [],
            renderRows: [],
            ...props,
        },
    });
}

describe("KidHome, with the dead activity prop gone", () => {
    it("no longer declares an activity prop at all", () => {
        // `$props` on a mounted instance reflects the component's own resolved prop set; an
        // `activity` key on it would mean the prop came back rather than merely that nobody
        // supplied a value for it this time.
        const wrapper = home();
        expect(Object.prototype.hasOwnProperty.call(wrapper.vm.$props, "activity")).toBe(false);
    });

    it("names the panel and empty state as renders only, with no broader activity claim", () => {
        const wrapper = home({ renderRows: [] });

        expect(wrapper.text()).toContain("Renders right now");
        expect(wrapper.text()).toContain("No renders are running right now. Press GO to start one.");
        expect(wrapper.text()).not.toContain("What this app is doing right now");
        // Only one kind of row can exist in this panel now - the running-render one - so the
        // absence of the "quiet" message is exactly the presence of a render row, checked
        // directly rather than through a second, removed data source.
        expect(wrapper.findAll(".wl-kid-home__row")).toHaveLength(0);
    });

    it("still shows the quiet message as false the moment a real render row exists", () => {
        const wrapper = home({
            // `renderId` differs from `label`: a resolved world name, not the id fallback -
            // see `KidHome.renderRowLabel.test.ts` for the placeholder-vs-resolved cases.
            renderRows: [{ state: "running", percent: 42, label: "overworld", renderId: "overworld-0a974df3a729" }],
        });

        expect(wrapper.text()).not.toContain("No renders are running right now. Press GO to start one.");
        expect(wrapper.findAll(".wl-kid-home__row")).toHaveLength(1);
    });

    it("routes duplicate display names by each profile's stable id", async () => {
        const wrapper = home({
            profiles: [
                { id: "first", name: "My map", meta: "This computer", remote: false },
                { id: "second", name: "My map", meta: "https://example.test", remote: true },
            ],
        });

        const rows = wrapper.findAll(".wl-kid-home__row");
        expect(rows).toHaveLength(2);
        await rows[1]?.trigger("click");
        expect(wrapper.emitted("openProfile")).toEqual([["second"]]);
    });

    it("passing an activity prop from a stale caller does nothing - it is not a declared prop any more", () => {
        // Vue attaches an unknown prop as a plain HTML/fallthrough attribute rather than reading
        // it as component state, so this proves the removal is real rather than merely that the
        // TypeScript type disappeared while runtime behaviour quietly kept honouring it.
        const wrapper = home({
            // @ts-expect-error - deliberately passing the removed prop, to prove it is inert.
            activity: [{ key: "stale", feature: "Backups", meta: "unused" }],
        });

        expect(wrapper.text()).not.toContain("Backups");
        expect(wrapper.findAll(".wl-kid-home__row")).toHaveLength(0);
    });
});
