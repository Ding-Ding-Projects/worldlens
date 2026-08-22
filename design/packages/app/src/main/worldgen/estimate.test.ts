import { describe, expect, it } from "vitest";

import { estimateGeneration, formatEstimatedBytes, formatEstimatedSeconds } from "./estimate.js";

describe("estimateGeneration", () => {
    it("multiplies chunk count by the dimension count", () => {
        const extent = { kind: "radius" as const, radiusChunks: 0, minChunkX: 0, minChunkZ: 0, maxChunkX: 0, maxChunkZ: 0 };
        const one = estimateGeneration(extent, 1);
        const three = estimateGeneration(extent, 3);
        expect(three.chunkCount).toBe(one.chunkCount * 3);
        expect(three.estimatedBytes).toBe(one.estimatedBytes * 3);
    });

    it("floors dimension count at 1 even when given 0", () => {
        const extent = { kind: "radius" as const, radiusChunks: 0, minChunkX: 0, minChunkZ: 0, maxChunkX: 0, maxChunkZ: 0 };
        expect(estimateGeneration(extent, 0).chunkCount).toBe(1);
    });

    it("produces positive estimated time for a nonzero chunk count", () => {
        const extent = { kind: "radius" as const, radiusChunks: 5, minChunkX: 0, minChunkZ: 0, maxChunkX: 0, maxChunkZ: 0 };
        const estimate = estimateGeneration(extent, 1);
        expect(estimate.estimatedSeconds).toBeGreaterThan(0);
    });
});

describe("formatEstimatedBytes", () => {
    it("formats bytes, KB, MB, and GB", () => {
        expect(formatEstimatedBytes(500)).toBe("500 B");
        expect(formatEstimatedBytes(2048)).toBe("2.0 KB");
        expect(formatEstimatedBytes(5 * 1024 * 1024)).toBe("5.0 MB");
        expect(formatEstimatedBytes(3 * 1024 * 1024 * 1024)).toBe("3.0 GB");
    });
});

describe("formatEstimatedSeconds", () => {
    it("formats seconds, minutes, and hours", () => {
        expect(formatEstimatedSeconds(30)).toBe("30s");
        expect(formatEstimatedSeconds(90)).toBe("1m 30s");
        expect(formatEstimatedSeconds(3700)).toBe("1h 1m");
    });
});
