/**
 * The marker sheet maps every colour role the design system publishes onto
 * `--md-sys-color-<role>`, read live from Vuetify's `--v-theme-<role>` so the appearance
 * editor and theme switching reach the raw-DOM layers too.
 *
 * Pinned in both directions: a role the design system adds appears here or this fails, and a
 * name here that the design system does not publish fails as well, because a mapping to a
 * `--v-theme-*` variable Vuetify never emits is invalid at computed-value time and falls
 * through to whatever fallback the consumer typed. That silent fall-through is how the hosted
 * sign-in prompt painted baseline purple for months.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { COLOR_ROLES } from "@worldlens/design-system/colors";
import { describe, expect, it } from "vitest";

const sheet = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "markers.scss"), "utf8");
const mapped: Array<[string, string]> = [
    ...sheet.matchAll(/^\s*--md-sys-color-([a-z-]+):\s*([^;]+);/gm),
].map((m) => [m[1] ?? "", (m[2] ?? "").trim()]);

describe("markers.scss colour roles", () => {
    it("maps every design-system role, and nothing that is not one", () => {
        expect(mapped.map(([role]) => role).sort()).toEqual([...COLOR_ROLES].sort());
    });

    it("reads each role live from the Vuetify theme, except the neutral shadow", () => {
        for (const [role, value] of mapped) {
            if (role === "shadow") {
                expect(value).toBe("rgb(0 0 0)");
            } else {
                expect(value, role).toBe(`rgb(var(--v-theme-${role}))`);
            }
        }
    });
});
