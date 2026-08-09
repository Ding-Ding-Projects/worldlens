/**
 * The redesign handoff makes a stronger promise than ordinary WCAG: the rail, catalogue cards
 * and Work job strip must be a literal 21:1 in the contrast theme. Role-pair tests alone cannot
 * prove that after a component applies opacity or a translucent state layer, so keep the actual
 * composite arithmetic and the scoped CSS escape hatches together here.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { CONTRAST_SCHEME } from "@worldlens/shared";
import { describe, expect, it } from "vitest";
import { compositeOver, contrastRatio, rgb, type Rgb } from "../appearance/colorSpaces.js";

function fromHex(hex: string, alpha = 1): Rgb {
    return rgb(
        Number.parseInt(hex.slice(1, 3), 16) / 255,
        Number.parseInt(hex.slice(3, 5), 16) / 255,
        Number.parseInt(hex.slice(5, 7), 16) / 255,
        alpha,
    );
}

function role(name: keyof typeof CONTRAST_SCHEME): Rgb {
    return fromHex(CONTRAST_SCHEME[name]);
}

function source(name: string): string {
    return readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), "utf8");
}

const SURFACE = role("surface");
const ON_SURFACE = role("on-surface");
const PRIMARY_CONTAINER = role("primary-container");
const ON_PRIMARY_CONTAINER = role("on-primary-container");

function expectMaximum(label: string, foreground: Rgb, background: Rgb): void {
    expect(
        contrastRatio(foreground, background),
        `${label} must stay at the literal contrast-theme target`,
    ).toBeCloseTo(21, 10);
}

describe("rewrite contrast acceptance", () => {
    it("shows why the old alpha and yellow/error paths cannot satisfy a literal 21:1 claim", () => {
        expect(
            contrastRatio(
                compositeOver({ ...ON_PRIMARY_CONTAINER, alpha: 0.88 }, PRIMARY_CONTAINER),
                PRIMARY_CONTAINER,
            ),
        ).toBeLessThan(21);
        expect(
            contrastRatio(
                compositeOver({ ...ON_PRIMARY_CONTAINER, alpha: 0.72 }, PRIMARY_CONTAINER),
                PRIMARY_CONTAINER,
            ),
        ).toBeLessThan(21);
        expect(
            contrastRatio(compositeOver({ ...ON_SURFACE, alpha: 0.08 }, SURFACE), SURFACE),
        ).toBeLessThan(21);
        expect(
            contrastRatio(role("on-secondary-container"), role("secondary-container")),
        ).toBeLessThan(21);
        expect(contrastRatio(role("on-error-container"), role("error-container"))).toBeLessThan(21);
    });

    it("keeps every claimed rail, catalogue, and job-strip reading pair at 21:1", () => {
        const pairs: readonly [string, Rgb, Rgb][] = [
            ["rail label", ON_SURFACE, SURFACE],
            ["rail hover and bell", ON_PRIMARY_CONTAINER, PRIMARY_CONTAINER],
            ["catalogue card", ON_SURFACE, SURFACE],
            ["catalogue hero", ON_PRIMARY_CONTAINER, PRIMARY_CONTAINER],
            ["catalogue avatar", ON_PRIMARY_CONTAINER, PRIMARY_CONTAINER],
            ["job strip tab", ON_SURFACE, SURFACE],
            ["job strip active tab", ON_PRIMARY_CONTAINER, PRIMARY_CONTAINER],
            ["job strip group chip", ON_PRIMARY_CONTAINER, PRIMARY_CONTAINER],
        ];

        for (const [label, foreground, background] of pairs)
            expectMaximum(label, foreground, background);
    });

    it("contains contrast-only opaque overrides instead of weakening ordinary theme states", () => {
        const rail = source("AppRail.vue");
        const home = source("HomeCatalogues.vue");
        const work = source("WorkPane.vue");

        expect(rail).toMatch(
            /:global\(\.v-theme--contrast\) \.wl-rail-item:hover \.wl-rail-pill,[\s\S]*background: rgb\(var\(--v-theme-primary-container\)\);[\s\S]*color: rgb\(var\(--v-theme-on-primary-container\)\);/,
        );
        expect(rail).toContain(":global(.v-theme--contrast) .wl-rail-action .wl-rail-badge");

        expect(home).toMatch(
            /:global\(\.v-theme--contrast\) \.wl-hero__blurb,[\s\S]*:global\(\.v-theme--contrast\) \.wl-chip[\s\S]*opacity: 1;/,
        );
        expect(home).toContain(".wl-card__avatar:not(.wl-card__avatar--share)");
        expect(home).toContain("background: rgb(var(--v-theme-primary-container));");

        for (const declaration of [
            "--v-hover-opacity: 0;",
            "--v-focus-opacity: 0;",
            "--v-pressed-opacity: 0;",
            "--v-dragged-opacity: 0;",
            "--v-activated-opacity: 0;",
        ])
            expect(work).toContain(declaration);
        expect(work).toContain(".mb-tabs-strip__tab--active");
        expect(work).toContain(".mb-tabs-strip__group-head .v-chip");
        expect(work).toContain("opacity: 0 !important;");
    });
});
