import { describe, expect, it } from "vitest";
import type { RegionChunk } from "./nbtEditorBridge.js";
import { compressionName, legend, local, moveFocus, regionCells } from "./nbtRegionModel.js";

function chunk(
    index: number,
    x: number,
    z: number,
    size: number,
    timestamp: number,
    compressionType = 2,
    readable = true,
    unsupported: string | null = null,
): RegionChunk {
    return { index, x, z, size, compressionType, timestamp, readable, unsupported };
}

describe("region canvas model", () => {
    it("places chunks by their slot inside the region, negative regions included", () => {
        expect(local(33)).toBe(1);
        expect(local(-1)).toBe(31);
        const cells = regionCells([chunk(5, -31, -32, 100, 10)], "size");
        expect(cells).toHaveLength(1024);
        expect(cells[0 * 32 + 1]!.chunk?.index).toBe(5);
        expect(cells[0]!.state).toBe("missing");
    });

    it("shades by size and by last save from the chunks present", () => {
        const chunks = [chunk(0, 0, 0, 100, 1000), chunk(1, 1, 0, 300, 3000)];
        const bySize = regionCells(chunks, "size");
        expect(bySize[0]!.level).toBe(0);
        expect(bySize[1]!.level).toBe(1);
        expect(bySize[0]!.label).toBe("Chunk 0, 0: 100 B");
        const bySaved = regionCells(chunks, "saved");
        expect(bySaved[1]!.level).toBe(1);
        expect(legend(chunks, "size")).toEqual(["100 B", "300 B"]);
    });

    it("marks chunks that cannot be opened and says why", () => {
        const cells = regionCells(
            [chunk(0, 0, 0, 10, 1, 4, false, "LZ4 chunks are not opened yet")],
            "compression",
        );
        expect(cells[0]!.state).toBe("unsupported");
        expect(cells[0]!.label).toContain("LZ4");
        expect(compressionName(130)).toBe("zlib, in a .mcc file");
        expect(compressionName(4)).toBe("LZ4");
    });

    it("moves focus with the arrow keys and stops at the edges", () => {
        expect(moveFocus(0, "ArrowLeft")).toBe(0);
        expect(moveFocus(0, "ArrowRight")).toBe(1);
        expect(moveFocus(0, "ArrowDown")).toBe(32);
        expect(moveFocus(1023, "ArrowDown")).toBe(1023);
        expect(moveFocus(40, "Home")).toBe(32);
        expect(moveFocus(40, "End")).toBe(63);
        expect(moveFocus(40, "x")).toBeNull();
    });
});
