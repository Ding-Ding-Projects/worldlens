import { describe, expect, it } from "vitest";
import { effectiveMapId, resolveRenderMaps } from "./mapIdentity.js";

describe("engine output map identity", () => {
    it("matches pinned Java filename sanitization and preserves display identity", () => {
        expect(resolveRenderMaps([{ id: "sample-world", world: "/world" }], "upstream-java"))
            .toEqual([{ id: "sample_world", world: "/world", name: "sample-world" }]);
    });
    it("rejects engine collisions before any writes", () => {
        expect(() => resolveRenderMaps([{ id: "a-b", world: "/a" }, { id: "a_b", world: "/b" }], "upstream-java"))
            .toThrow("collide");
    });
    it("retains unaffected Java IDs and TypeScript identity", () => {
        expect(effectiveMapId("overworld_1", "upstream-java")).toBe("overworld_1");
        expect(effectiveMapId("a-b", "typescript")).toBe("a-b");
    });
    it("resolves every map independently without mutating requests", () => {
        const input = [{ id: "a-b", world: "/a", name: "A" }, { id: "c-d", world: "/b", name: "B" }];
        expect(resolveRenderMaps(input, "upstream-java").map(map => map.id)).toEqual(["a_b", "c_d"]);
        expect(input[0]?.id).toBe("a-b");
    });
    it("rejects unsafe and duplicate source IDs", () => {
        expect(() => resolveRenderMaps([{ id: "../a", world: "/a" }], "upstream-java")).toThrow();
        expect(() => resolveRenderMaps([{ id: "a", world: "/a" }, { id: "a", world: "/b" }], "typescript")).toThrow();
    });
});
