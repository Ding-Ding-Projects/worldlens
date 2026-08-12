/**
 * The classification rules, proved without touching a DOM or a real file.
 */

import { describe, expect, it } from "vitest";

import { classifyDroppedFile, dropSummary, MAX_DROP_FILE_BYTES, SUPPORTED_DROP_EXTENSIONS } from "./dropModel.js";

describe("classifyDroppedFile", () => {
    it("accepts every supported extension", () => {
        for (const extension of SUPPORTED_DROP_EXTENSIONS) {
            const result = classifyDroppedFile(`castle.${extension}`, 1024);
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.name).toBe(`castle.${extension}`);
                expect(result.kind).toBe(extension === "schem" || extension === "schematic" ? "schematic" : "structure");
            }
        }
    });

    it("refuses an unknown extension and names it in the message", () => {
        const result = classifyDroppedFile("world-screenshot.png", 2048);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.reason).toContain('".png"');
            expect(result.reason).toContain(".nbt");
            expect(result.reason).toContain(".schem");
        }
    });

    it("refuses a file with no extension at all", () => {
        const result = classifyDroppedFile("README", 100);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.reason).toContain("no file extension");
        }
    });

    it("refuses an empty file", () => {
        const result = classifyDroppedFile("empty.nbt", 0);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.reason).toContain("empty");
            expect(result.reason).toContain("empty.nbt");
        }
    });

    it("refuses a file over the size ceiling", () => {
        const result = classifyDroppedFile("huge.schem", MAX_DROP_FILE_BYTES + 1);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.reason).toContain("huge.schem");
            expect(result.reason).toMatch(/MiB/);
        }
    });

    it("accepts a file exactly at the size ceiling", () => {
        const result = classifyDroppedFile("edge.nbt", MAX_DROP_FILE_BYTES);
        expect(result.ok).toBe(true);
    });

    it("is case-insensitive about the extension", () => {
        const result = classifyDroppedFile("Castle.NBT", 10);
        expect(result.ok).toBe(true);
    });
});

describe("dropSummary", () => {
    it("counts accepted and rejected files, preserving reasons", () => {
        const summary = dropSummary([
            { name: "castle.nbt", size: 1024 },
            { name: "wall.schem", size: 2048 },
            { name: "notes.txt", size: 10 },
            { name: "empty.schematic", size: 0 },
        ]);

        expect(summary.accepted).toHaveLength(2);
        expect(summary.accepted.map((a) => a.name)).toEqual(["castle.nbt", "wall.schem"]);

        expect(summary.rejected).toHaveLength(2);
        expect(summary.rejected.map((r) => r.name)).toEqual(["notes.txt", "empty.schematic"]);
        expect(summary.rejected[0]?.reason).toContain(".txt");
        expect(summary.rejected[1]?.reason).toContain("empty");
    });

    it("returns empty groups for an empty drop", () => {
        const summary = dropSummary([]);
        expect(summary.accepted).toHaveLength(0);
        expect(summary.rejected).toHaveLength(0);
    });
});
