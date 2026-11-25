// @vitest-environment jsdom

/**
 * The list of tours Help and Settings both show: one button per tour, and each one rings the
 * shell's doorbell with exactly the tour it names.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import TourList from "./TourList.vue";
import { onTutorialLaunchRequested, resetTutorialLaunchRequests } from "./tutorialLaunch.js";
import { TUTORIAL_TOUR_IDS, type TutorialTourId } from "./tutorialSteps.js";

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;
});

const vuetify = createVuetify({ components, directives });

let wrapper: VueWrapper | null = null;

beforeEach(() => {
    resetTutorialLaunchRequests();
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
});

function mountList(): { requested: TutorialTourId[] } {
    const requested: TutorialTourId[] = [];
    const Host = {
        components: { TourList },
        setup() {
            onTutorialLaunchRequested((tour) => requested.push(tour));
        },
        template: "<TourList />",
    };
    wrapper = mount(Host, {
        global: {
            plugins: [
                vuetify,
                createI18n({
                    legacy: false,
                    locale: "en",
                    missingWarn: false,
                    fallbackWarn: false,
                    messages: { en: {} },
                }),
            ],
        },
        attachTo: document.body,
    });
    return { requested };
}

async function settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
        await nextTick();
        await Promise.resolve();
    }
}

describe("the tour list", () => {
    it("has a labelled heading and one button per tour", () => {
        mountList();

        expect(wrapper?.text()).toContain("Guided tours");
        const buttons = wrapper?.findAll("[data-tour-launch]") ?? [];
        expect(buttons.map((button) => button.attributes("data-tour-launch"))).toEqual([
            ...TUTORIAL_TOUR_IDS,
        ]);
    });

    it('labels the overall tour "Take a tour" and the others "Take a tour: <name>"', () => {
        mountList();

        const label = (tour: string): string | undefined =>
            wrapper?.find(`[data-tour-launch="${tour}"]`).text();
        expect(label("overall")).toBe("Take a tour");
        expect(label("map")).toBe("Take a tour: Map");
        expect(label("toolkit")).toBe("Take a tour: General tools");
        expect(label("settings")).toBe("Take a tour: Settings");
    });

    it("each button asks for exactly its own tour", async () => {
        const { requested } = mountList();

        for (const tour of TUTORIAL_TOUR_IDS) {
            await wrapper?.find(`[data-tour-launch="${tour}"]`).trigger("click");
            await settle();
        }

        expect(requested).toEqual([...TUTORIAL_TOUR_IDS]);
    });
});
