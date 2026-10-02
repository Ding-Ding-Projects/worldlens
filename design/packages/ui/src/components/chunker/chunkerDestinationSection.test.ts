// @vitest-environment jsdom

/**
 * The review step shows one destination's section: the one the picker holds.
 *
 * This is the other half of the packaged-build defect recorded in
 * `chunkerRouteSections.test.ts`. That file proves the picker now tells the page which route
 * was chosen; this one proves the page renders that route and only that route, so a
 * conversion pointed at GitHub's runners can never be configured through the local-container
 * section that was on screen in the report.
 *
 * It drives the real screen rather than reasoning about the template, because the two things
 * that can go wrong here are both invisible in the source: a branch that renders alongside its
 * sibling rather than instead of it, and a `route` that never moved. Walking the steps the way
 * a person does exercises both.
 *
 * ## And the layout guard, which cannot be measured here
 *
 * The second reported defect was the container panel's "Container memory limit (GiB)" label
 * painted over the "Refresh available choices" button above it. jsdom has no layout engine -
 * every `getBoundingClientRect` is zeros - so an overlap is not measurable in this
 * environment and a test that asserted an empty intersection here would pass on any markup
 * at all, including the broken markup. The structural assertion below is what is genuinely
 * checkable: the button no longer sits as a bare inline child with nothing between it and
 * the field, and the panel declares the spacing that separates them. The pixels are checked
 * against the real built application instead.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";

import ChunkerScreen from "./ChunkerScreen.vue";
// Read as text through Vite rather than through `node:fs`: `import.meta.url` is not a file
// URL under the transform pipeline, and this keeps the assertion pointed at the exact file
// the component test above just mounted.
import containerPanelSource from "./ChunkerContainerPanel.vue?raw";
import { saveChunkerRoute } from "./chunkerRouteStore.js";
import type { ChunkerRoute } from "./chunkerRoute.js";

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as never;
});

/** Every destination's section, and the marker that proves it is the one on screen. */
const SECTIONS = {
    "github-actions": '[data-test="chunker-actions-panel"]',
    docker: '[data-test="chunker-container-panel"]',
    ssh: '[data-test="chunker-container-panel"]',
} as const;

async function reviewStepFor(route: ChunkerRoute) {
    // The screen reads its opening route from the same store the picker writes to, which is
    // both how a restored route reaches the page and the least invasive way to put the screen
    // on a chosen destination without reaching inside it.
    saveChunkerRoute(route);

    const screen = mount(ChunkerScreen, {
        global: {
            plugins: [
                createVuetify({ components, directives }),
                createI18n({ legacy: false, locale: "en", messages: { en: {} } }),
            ],
        },
    });

    // Walk from the source step to the review step the way a person does, rather than
    // setting the step directly: a section that only renders on the wrong step would
    // otherwise never be noticed.
    for (let hop = 0; hop < 5; hop += 1) {
        const next = screen
            .findAll("button")
            .find((button) => button.text().trim() === "Next");
        expect(next, `no Next button on hop ${hop}`).toBeDefined();
        await next!.trigger("click");
        await screen.vm.$nextTick();
    }
    expect(screen.find('[data-test="chunker-step-review"]').exists()).toBe(true);
    return screen;
}

describe("the review step renders the chosen destination", () => {
    for (const [kind, selector] of Object.entries(SECTIONS)) {
        it(`shows only the ${kind} section`, async () => {
            const route =
                kind === "github-actions"
                    ? ({ kind: "github-actions", owner: null, repo: null } as const)
                    : kind === "docker"
                      ? ({ kind: "docker", image: null } as const)
                      : ({ kind: "ssh", targetId: null, label: null } as const);

            const screen = await reviewStepFor(route);

            expect(screen.find(selector).exists()).toBe(true);
            for (const other of new Set(Object.values(SECTIONS))) {
                if (other === selector) continue;
                expect(
                    screen.find(other).exists(),
                    `${kind} also rendered ${other}`,
                ).toBe(false);
            }
            screen.unmount();
        });
    }

    it("renders no destination section at all for this computer", async () => {
        const screen = await reviewStepFor({ kind: "local" });
        for (const selector of new Set(Object.values(SECTIONS))) {
            expect(screen.find(selector).exists()).toBe(false);
        }
        screen.unmount();
    });

    it("swaps the section when the route changes, without a reload", async () => {
        const screen = await reviewStepFor({ kind: "docker", image: null });
        expect(screen.find('[data-test="chunker-container-panel"]').exists()).toBe(true);

        // Move the route the way the picker's restored `update:route` event does. Nothing is
        // remounted and no step moves: the section simply changes with it.
        (screen.vm as unknown as { route: ChunkerRoute }).route = {
            kind: "github-actions",
            owner: null,
            repo: null,
        };
        await screen.vm.$nextTick();

        expect(screen.find('[data-test="chunker-container-panel"]').exists()).toBe(false);
        expect(screen.find('[data-test="chunker-actions-panel"]').exists()).toBe(true);
        screen.unmount();
    });
});

describe("the container panel's spacing", () => {
    const source = containerPanelSource;

    it("declares the spacing that keeps a floating label off the button above it", () => {
        // Anchored to whole lines rather than matched as substrings, so a commented-out rule
        // or a renamed class cannot satisfy this by containing the old text.
        expect(source).toMatch(/^\s*\.mb-chunker-container__panel \{$/m);
        expect(source).toMatch(/^\s*gap: var\(--md-sys-spacing-4, 16px\);$/m);
    });

    it("does not leave the refresh button as a bare child of the panel", () => {
        // The defect's exact shape: an inline-flex button with no block spacing, immediately
        // followed by the outlined field whose label is translated up over it.
        const refreshLine = source
            .split(/\r?\n/)
            .findIndex((line) => line.includes("chunker.container.refresh"));
        expect(refreshLine).toBeGreaterThan(-1);
        const lines = source.split(/\r?\n/);
        expect(lines[refreshLine - 1]).toMatch(/mb-chunker-container__actions/);
    });
});
