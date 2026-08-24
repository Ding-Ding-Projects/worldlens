import { describe, expect, it } from "vitest";
import { paletteEnterIntent } from "./paletteActivation.js";
import type { PaletteDestination } from "./paletteItems.js";

const destination: PaletteDestination = {
    kind: "destination",
    resultClass: "destination",
    id: "page.world",
    group: "Pages",
    title: "Make a map",
    description: "The map guide.",
    keywords: ["world"],
    location: ["Pages", "Make a map"],
    where: "Opens the guide.",
    go: () => {},
};

describe("palette keyboard activation", () => {
    it("refuses a disabled result and preserves exact recovery copy", () => {
        const item = { ...destination, disabled: { reason: "No map is open.", recovery: "Open a map first." } };
        expect(paletteEnterIntent(item)).toEqual({
            kind: "blocked",
            reason: "No map is open.",
            recovery: "Open a map first.",
        });
    });

    it("activates an enabled destination", () => {
        expect(paletteEnterIntent(destination)).toEqual({ kind: "activate", item: destination });
    });
});
