// @vitest-environment node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const read = (file: string): string => readFileSync(resolve(here, file), "utf8");

/** Hand-written, fail-closed inventory for this appearance lane. */
const INVENTORY = [
    [
        "chrome metadata",
        "appearanceRecord.ts",
        ["icon", "badge", "separator", "shape", "density", "motion"],
    ],
    ["spacing", "appearanceRecord.ts", ["gap", "marginInline", "marginBlock"]],
    [
        "pseudo states",
        "appearanceRecord.ts",
        ["hover", "focus", "selected", "expanded", "collapsed", "disabled", "pressed", "active"],
    ],
    [
        "property locks",
        "appearanceLocks.ts",
        ["appearancePropertyLockTargets", "APPEARANCE_LOCK_SURFACE"],
    ],
    [
        "rainbow",
        "rainbow.ts",
        ["RAINBOW_SENTINEL", "RAINBOW_SPEED_DURATIONS", "prefers-reduced-motion"],
    ],
    ["self registration", "AppearanceEditor.vue", ["useRegisteredTarget", "appearance.editor"]],
    [
        "choice search",
        "AppearanceChoiceField.vue",
        ["ConfigSearchField", "listbox", "No choice matches"],
    ],
] as const;

function assertInventory(source: string, required: readonly string[]): void {
    for (const needle of required) {
        if (
            !new RegExp(
                `(?:^|[^A-Za-z0-9_])${needle.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}(?:$|[^A-Za-z0-9_])`,
                "m",
            ).test(source)
        ) {
            throw new Error(`Missing appearance contract item: ${needle}`);
        }
    }
}

describe("appearance completeness inventory", () => {
    it.each(INVENTORY)("keeps %s present", (_name, file, required) => {
        assertInventory(read(file), required);
    });

    it("has a negative regression that turns red when an asserted item disappears", () => {
        const source = read("appearanceRecord.ts");
        const broken = source.replace(/\bicon\b/g, "iconRemoved");
        expect(() => assertInventory(broken, ["icon"])).toThrow("Missing appearance contract item");
        expect(() => assertInventory(source, ["icon"])).not.toThrow();
    });
});
