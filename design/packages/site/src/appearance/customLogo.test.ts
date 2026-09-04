/**
 * Mostly about refusing things, since that is where a file picker earns its keep.
 *
 * The interesting cases are a file whose name lies about its contents, an SVG offered as an
 * image, and a stored value that has been edited since this code wrote it.
 */

import { describe, expect, it } from "vitest";

import { Preferences } from "../platform/Preferences.js";
import {
    CustomLogo,
    MAX_LOGO_BYTES,
    sniffImageType,
    validateLogo,
} from "./customLogo.js";

function memoryStorage(): Storage {
    const map = new Map<string, string>();
    return {
        get length() {
            return map.size;
        },
        clear: () => map.clear(),
        getItem: (k) => map.get(k) ?? null,
        key: (i) => [...map.keys()][i] ?? null,
        removeItem: (k) => void map.delete(k),
        setItem: (k, v) => void map.set(k, v),
    } as Storage;
}

const png = (extra = 8) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, ...new Array<number>(extra).fill(0)]);
const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0]);
const svg = () => new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

const logo = () => new CustomLogo(new Preferences(memoryStorage()));

describe("recognising what a file actually is", () => {
    it("reads the bytes, not the name", () => {
        expect(sniffImageType(png())).toBe("image/png");
        expect(sniffImageType(jpeg())).toBe("image/jpeg");
    });

    it("does not recognise an SVG", () => {
        // Deliberately. It is a document that can carry script and remote references, and a
        // visitor's own file rendered into this page is exactly where that matters.
        expect(sniffImageType(svg())).toBe(null);
    });
});

describe("judging a file", () => {
    it("accepts a real PNG", () => {
        const result = validateLogo(png(), "image/png", "mark.png");
        expect(result.ok).toBe(true);
        expect(result.ok === true && result.choice.kind).toBe("custom");
    });

    it("refuses a file whose name disagrees with its contents", () => {
        // Usually a renamed file, occasionally something worse. Either way worth saying out
        // loud rather than quietly accepting.
        const result = validateLogo(jpeg(), "image/png", "mark.png");
        expect(result.ok === false && result.reason).toBe("bytes-do-not-match-type");
    });

    it("refuses an SVG and says why", () => {
        const result = validateLogo(svg(), "image/svg+xml", "mark.svg");
        expect(result.ok === false && result.reason).toBe("unsupported-type");
        expect(result.ok === false && result.detail).toMatch(/script/);
    });

    it("refuses an empty file", () => {
        expect(validateLogo(new Uint8Array(0), "image/png", "x.png").ok).toBe(false);
    });

    it("refuses one too large, and says what the limit is in the same sentence", () => {
        // A limit stated after the refusal is a second thing to go and find.
        const big = new Uint8Array(MAX_LOGO_BYTES + 1);
        big.set([0x89, 0x50, 0x4e, 0x47]);
        const result = validateLogo(big, "image/png", "big.png");
        expect(result.ok === false && result.reason).toBe("too-large");
        expect(result.ok === false && result.detail).toMatch(/limit is/);
    });

    it("never accepts partially", () => {
        // A half-accepted logo would leave the site showing something nobody chose.
        const store = logo();
        store.useCustom(svg(), "image/svg+xml", "x.svg");
        expect(store.choice).toEqual({ kind: "preset", id: "default" });
    });
});

describe("what is remembered", () => {
    it("starts on the shipped mark", () => {
        expect(logo().choice).toEqual({ kind: "preset", id: "default" });
    });

    it("keeps an accepted image, and resets in one action", () => {
        const store = logo();
        expect(store.useCustom(png(), "image/png", "mark.png").ok).toBe(true);
        expect(store.choice.kind).toBe("custom");
        store.reset();
        expect(store.choice).toEqual({ kind: "preset", id: "default" });
    });

    it("falls back rather than throwing on a value edited since it was written", () => {
        // Storage can be edited by hand or truncated by a browser reclaiming space. A site
        // that refuses to render because its logo preference is malformed has turned a
        // cosmetic problem into an outage.
        const storage = memoryStorage();
        storage.setItem("appearance.customLogo", '{"kind":"custom","dataUri":"javascript:alert(1)"}');
        const store = new CustomLogo(new Preferences(storage));
        expect(store.choice).toEqual({ kind: "preset", id: "default" });
    });

    it("refuses an unknown preset from storage", () => {
        const storage = memoryStorage();
        storage.setItem("appearance.customLogo", '{"kind":"preset","id":"whatever"}');
        expect(new CustomLogo(new Preferences(storage)).choice).toEqual({
            kind: "preset",
            id: "default",
        });
    });
});
