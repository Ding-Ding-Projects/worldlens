import { describe, expect, it, vi } from "vitest";
import { routeKidProfile } from "./profileRoute.js";

describe("the Kids profile route into App", () => {
    it("selects Map even when the stable profile id is already active", () => {
        let activeId = "second";
        const selectMap = vi.fn();

        expect(
            routeKidProfile(
                "second",
                ["first", "second"],
                (id) => {
                    activeId = id;
                },
                selectMap,
            ),
        ).toBe(true);
        expect(activeId).toBe("second");
        expect(selectMap).toHaveBeenCalledTimes(1);
    });

    it("ignores an unknown id without moving the destination", () => {
        const setActive = vi.fn();
        const selectMap = vi.fn();
        expect(routeKidProfile("missing", ["known"], setActive, selectMap)).toBe(false);
        expect(setActive).not.toHaveBeenCalled();
        expect(selectMap).not.toHaveBeenCalled();
    });
});
