import { describe, expect, it } from "vitest";
import { acceptsPagesState } from "./pagesState.js";
import type { ProjectPagesStateRecord } from "./ProjectEditor.vue";

const base: ProjectPagesStateRecord = {
    key: "C:\\WORLD\\0p1",
    state: "pending",
    renderId: "render-1",
    projectSnapshot: "snapshot-a",
    generation: 4,
};

describe("acceptsPagesState", () => {
    it("rejects completion from project A after the active key moves to B", () => {
        expect(acceptsPagesState("C:\\WORLD\\0p2", base, { ...base, state: "published" })).toBe(false);
    });

    it("rejects an old completion after off invalidates its generation", () => {
        expect(acceptsPagesState("C:\\WORLD\\0p1", { ...base, state: "off", generation: 5 }, { ...base, state: "published" })).toBe(false);
    });

    it("rejects a same-render-id completion when the project snapshot changed", () => {
        expect(acceptsPagesState("C:\\WORLD\\0p1", base, { ...base, state: "published", projectSnapshot: "snapshot-b" })).toBe(false);
    });
});
