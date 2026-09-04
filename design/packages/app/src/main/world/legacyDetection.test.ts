/**
 * Telling a pre-flattening world from a modern one.
 *
 * This mattered more than it looks. The app read `DataVersion` correctly and then both
 * of its callers discarded it, so nothing could tell the two apart - and the renderer's
 * lowest decoder accepted old chunks and misparsed them into empty ones rather than
 * refusing. A world from 1.12.2 therefore rendered as black squares with a green run and
 * clean logs, and no surface anywhere could have said why.
 */

import { describe, expect, it } from "vitest";

import { LAST_PRE_FLATTENING_DATA_VERSION, isLegacyDataVersion } from "./catalog.js";

const REGIONS = { overworld: 12 };
const NO_REGIONS = {};

describe("recognising a pre-flattening world", () => {
    it("calls 1.12.2 legacy", () => {
        expect(isLegacyDataVersion(LAST_PRE_FLATTENING_DATA_VERSION, REGIONS)).toBe(true);
    });

    it("calls 1.13 modern, at the exact boundary", () => {
        // 1.13 is 1519. The boundary is the whole point: one either side of it decides
        // which decoder reads every chunk in the world.
        expect(isLegacyDataVersion(LAST_PRE_FLATTENING_DATA_VERSION + 1, REGIONS)).toBe(false);
        expect(isLegacyDataVersion(1519, REGIONS)).toBe(false);
    });

    it("calls a modern world modern", () => {
        expect(isLegacyDataVersion(3700, REGIONS)).toBe(false);
    });

    it("treats a world with regions but no DataVersion as legacy", () => {
        // A missing DataVersion is not "modern". Worlds old enough predate the field
        // entirely, and every modern world writes one - so with chunks present and no
        // version, legacy is the safe reading rather than the optimistic one.
        expect(isLegacyDataVersion(null, REGIONS)).toBe(true);
    });

    it("says it does not know, rather than guessing, when there is nothing to go on", () => {
        // An empty folder is not a legacy world and not a modern one. Answering either
        // would put a confident label on a question nobody asked yet.
        expect(isLegacyDataVersion(null, NO_REGIONS)).toBe(null);
        expect(isLegacyDataVersion(null, { overworld: 0 })).toBe(null);
    });
});
