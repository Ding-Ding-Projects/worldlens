import { describe, expect, it } from "vitest";
import { addSpatialPoint, spatialGeometry, spatialProblem, type SpatialSelection } from "./spatialSelection.js";
const identity = { projectId: "project-a", mapId: "overworld", dimension: "minecraft:overworld" };
const selection = (kind: SpatialSelection["kind"]): SpatialSelection => ({ identity, kind, vertices: [] });
describe("spatial selection", () => {
    it("rejects a point from another dimension without modifying the draft", () => {
        const draft = selection("polygon");
        expect(() => addSpatialPoint(draft, { x: 1, y: 64, z: 2 }, { ...identity, dimension: "minecraft:the_nether" })).toThrow("map changed");
        expect(draft.vertices).toEqual([]);
    });
    it("builds a rectangle at the first corner height", () => {
        let draft = addSpatialPoint(selection("rectangle"), { x: 1, y: 64, z: 2 }, identity);
        draft = addSpatialPoint(draft, { x: 10, y: 80, z: 12 }, identity);
        expect(spatialGeometry(draft)).toEqual([{ x: 1, y: 64, z: 2 }, { x: 10, y: 64, z: 2 }, { x: 10, y: 64, z: 12 }, { x: 1, y: 64, z: 12 }]);
        expect(spatialProblem(draft)).toBeNull();
        expect(() => addSpatialPoint(draft, { x: 9, y: 64, z: 9 }, identity)).toThrow("full");
    });
    it("rejects a degenerate area and a circle crossing world bounds", () => {
        expect(spatialProblem({ ...selection("rectangle"), vertices: [{ x: 1, y: 64, z: 2 }, { x: 1, y: 64, z: 8 }] })).toContain("non-zero");
        expect(spatialProblem({ ...selection("circle"), vertices: [{ x: 29_999_999, y: 64, z: 0 }, { x: 29_999_990, y: 64, z: 0 }] })).toContain("outside");
    });
    it("keeps paths open and derives a bounded circle from center and radius point", () => {
        const vertices = [{ x: 0, y: 64, z: 0 }, { x: 10, y: 64, z: 0 }];
        expect(spatialGeometry({ ...selection("path"), vertices })).toEqual(vertices);
        const circle = spatialGeometry({ ...selection("circle"), vertices });
        expect(circle).toHaveLength(48);
        expect(circle.every(point => Math.abs(Math.hypot(point.x, point.z) - 10) < 1e-10)).toBe(true);
    });
});
