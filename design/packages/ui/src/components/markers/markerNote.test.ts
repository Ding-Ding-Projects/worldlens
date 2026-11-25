/**
 * A marker note is formatted text, and the model that stores it never trusts the editor.
 *
 * This runs in a plain node process on purpose: with no DOM at all, sanitizing has to fail
 * closed by dropping every tag instead of passing the markup through.
 */

import { describe, expect, it } from "vitest";

import {
    createMarker,
    editMarker,
    emptyDraft,
    importStudioMarkers,
    exportStudioMarkers,
    markerSearchText,
    filterStudioMarkers,
} from "./markerStudio.js";

function draftWith(detail: string) {
    return { ...emptyDraft({ x: 1, y: 64, z: 2 }), label: "Base", detail };
}

function made(detail: string) {
    const result = createMarker("overworld", draftWith(detail), { id: "m1", now: "2026-01-01T00:00:00.000Z" });
    if (!result.ok) throw new Error(JSON.stringify(result.problems));
    return result.marker;
}

describe("a note is cleaned where it is saved", () => {
    it("leaves a plain note exactly as typed", () => {
        expect(made("Spawn point\nwith two lines").detail).toBe("Spawn point\nwith two lines");
    });

    it("drops every tag when there is no DOM to sanitize with, rather than passing markup through", () => {
        const marker = made('<p onclick="x()">Hello <strong>world</strong></p><script>alert(1)</script>');
        expect(marker.detail).not.toMatch(/script|onclick/i);
        expect(marker.detail).toContain("Hello");
        expect(marker.detail).toContain("world");
    });

    it("cleans an edit the same way", () => {
        const base = made("first");
        const edited = editMarker(base, { ...draftWith('<img src="x" onerror="y()">second') });
        if (!edited.ok) throw new Error("edit failed");
        expect(edited.marker.detail).not.toMatch(/onerror|<img/i);
        expect(edited.marker.detail).toContain("second");
    });

    it("cleans a note that arrives in an imported file", () => {
        const file = exportStudioMarkers("overworld", [{ ...made("fine"), detail: '<p onclick="x()">imported</p>' }]);
        const { markers, errors } = importStudioMarkers(file, "overworld");
        expect(errors).toEqual([]);
        expect(markers[0]!.detail).not.toMatch(/onclick/i);
        expect(markers[0]!.detail).toContain("imported");
    });
});

describe("a formatted note is searched by its words", () => {
    it("matches the text and never the tags", () => {
        const marker = { ...made("x"), detail: "<p>Diamond <strong>chest</strong></p>" };
        expect(markerSearchText(marker)).toContain("Diamond chest");
        expect(filterStudioMarkers([marker], "chest")).toHaveLength(1);
        expect(filterStudioMarkers([marker], "strong")).toHaveLength(0);
    });
});
