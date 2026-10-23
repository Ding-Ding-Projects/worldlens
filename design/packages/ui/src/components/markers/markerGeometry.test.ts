import { describe, expect, it } from "vitest";
import { createMarker, emptyDraft, markerProblems, toViewerMarkerData } from "./markerStudio.js";
describe("drawn marker rendering data", () => {
    it("supplies visible colour and the selected terrain height", () => {
        const made = createMarker("map", { ...emptyDraft({ x: 10, y: 74, z: 20 }), label: "Area", colour: "#123456", kind: "shape", points: [{x:10,y:74,z:20},{x:20,y:74,z:20},{x:20,y:74,z:30}] });
        if (!made.ok) throw new Error("Fixture invalid");
        expect(toViewerMarkerData(made.marker)).toMatchObject({ shapeY: 74, fillColor: {r:18,g:52,b:86,a:0.28}, lineColor: {a:1} });
    });
    it("preserves explicit extrusion height instead of replacing it with a flat polygon", () => {
        const made = createMarker("map", { ...emptyDraft({ y:64 }), label:"Tower",kind:"extrude",points:[{x:0,y:64,z:0},{x:10,y:64,z:0},{x:10,y:64,z:10}],extra:{shapeMinY:64,shapeMaxY:84} });
        if (!made.ok) throw new Error("Fixture invalid");
        expect(toViewerMarkerData(made.marker)).toMatchObject({shapeMinY:64,shapeMaxY:84});
    });
    it("reports missing extrusion vertices without throwing", () => {
        expect(markerProblems({...emptyDraft(),label:"Empty",kind:"extrude"})).toEqual(expect.arrayContaining([expect.objectContaining({field:"geometry"})]));
    });
});
