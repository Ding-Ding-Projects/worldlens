/**
 * The two things a converter has to get right before any of its conversions matter: it must
 * say what it cannot do rather than hiding it, and it must say what a conversion costs before
 * running it rather than after.
 */

import { describe, expect, it } from "vitest";

import {
    CONVERSION_CATEGORIES,
    conversionOffered,
    encodeBase64,
    encodeHex,
    jsonToCsv,
    lossinessOf,
} from "./fileConversion.js";

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("the catalogue", () => {
    it("names every category the contract does, present or not", () => {
        // Written out rather than derived from what happens to work. A list built from the
        // available adapters would look complete while covering one category in eight.
        expect(CONVERSION_CATEGORIES.map((c) => c.id)).toEqual([
            "images",
            "documents",
            "audio",
            "video",
            "archives",
            "structured-data",
            "code-text",
            "binary-encodings",
        ]);
    });

    it("gives every unavailable category a reason, and every available one none", () => {
        // A gap with no reason reads as something nobody considered, rather than as a
        // decision somebody made.
        for (const category of CONVERSION_CATEGORIES) {
            if (category.available) {
                expect(category.unavailableReason).toBe(null);
                expect(category.targets.length).toBeGreaterThan(0);
            } else {
                expect(category.unavailableReason).not.toBe(null);
                expect((category.unavailableReason ?? "").length).toBeGreaterThan(20);
            }
        }
    });

    it("refuses a target before a file is chosen, not after", () => {
        // Accepting a file and then refusing it wastes somebody's expectation as well as
        // their time.
        expect(conversionOffered("images", "image/png")).toBe(true);
        expect(conversionOffered("audio", "audio/mp3")).toBe(false);
        expect(conversionOffered("images", "image/tiff")).toBe(false);
        expect(conversionOffered("nonsense", "image/png")).toBe(false);
    });
});

describe("saying what a conversion costs", () => {
    it("warns that JPEG destroys transparency, and that going back will not restore it", () => {
        const notice = lossinessOf("image/png", "image/jpeg");
        expect(notice.lossy).toBe(true);
        expect(notice.what.join(" ")).toMatch(/transparency/);
        expect(notice.what.join(" ")).toMatch(/cannot be recovered/);
    });

    it("warns that only the first frame of an animation survives", () => {
        expect(lossinessOf("image/gif", "image/png").what.join(" ")).toMatch(/first frame/);
    });

    it("says nothing is lost when nothing is", () => {
        // A warning on a lossless conversion teaches people to ignore the warnings.
        expect(lossinessOf("image/png", "image/png").lossy).toBe(false);
    });
});

describe("binary encodings", () => {
    it("produces bytes, so a caller can write a real file", () => {
        const result = encodeBase64(new Uint8Array([104, 105]));
        expect(result.ok === true && decode(result.bytes)).toBe("aGk=");
    });

    it("writes hex lowercase and padded", () => {
        const result = encodeHex(new Uint8Array([0, 15, 255]));
        expect(result.ok === true && decode(result.bytes)).toBe("000fff");
    });
});

describe("JSON to CSV", () => {
    it("lines up columns across rows that do not all have the same keys", () => {
        const result = jsonToCsv('[{"a":1},{"b":2}]');
        expect(result.ok === true && decode(result.bytes)).toBe("a,b\n1,\n,2\n");
    });

    it("quotes a value containing a comma rather than breaking the row", () => {
        const result = jsonToCsv('[{"a":"x,y"}]');
        expect(result.ok === true && decode(result.bytes)).toBe('a\n"x,y"\n');
    });

    it("refuses nesting instead of flattening it", () => {
        // "[object Object]" in a cell is a file that looks converted and is not, which is
        // worse than a refusal because nobody re-checks a conversion that appeared to work.
        const result = jsonToCsv('[{"a":{"b":1}}]');
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.reason).toMatch(/nested/);
    });

    it("refuses input that is not JSON, and says so in its own words", () => {
        const result = jsonToCsv("not json");
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.reason).toMatch(/not JSON/);
    });

    it("refuses an empty array rather than writing an empty file", () => {
        expect(jsonToCsv("[]").ok).toBe(false);
    });
});
