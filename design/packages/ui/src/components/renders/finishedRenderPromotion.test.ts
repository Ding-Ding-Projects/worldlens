import { describe, expect, it, vi } from "vitest";
import { promoteFinishedLocalRenders } from "./finishedRenderPromotion.js";

describe("promoteFinishedLocalRenders", () => {
    it("opens every finished local render exactly through the shared callback", () => {
        const open = vi.fn();
        promoteFinishedLocalRenders(
            [
                { outcome: "running", dataRoot: "/local/running", maps: [{ id: "a" }] },
                { outcome: "finished", dataRoot: "/local/banner", maps: [{ id: "overworld" }] },
                { outcome: "finished", dataRoot: null, maps: [{ id: "missing" }] },
                { outcome: "failed", dataRoot: "/local/failed", maps: [{ id: "b" }] },
            ],
            open,
        );
        expect(open).toHaveBeenCalledTimes(1);
        expect(open).toHaveBeenCalledWith("/local/banner", ["overworld"]);
    });
});
