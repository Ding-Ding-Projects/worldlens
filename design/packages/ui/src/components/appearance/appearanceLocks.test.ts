import { describe, expect, it } from "vitest";
import {
    appearancePropertyLockTarget,
    appearancePropertyLockTargets,
    legacyAppearancePropertyLockPath,
} from "./appearanceLocks.js";
import { emptyRecord } from "./appearanceRecord.js";
import { TYPOGRAPHY_PROPERTIES } from "./typographySpec.js";
import { SURFACE_PROPERTIES } from "./appearanceRecord.js";

describe("appearance property lock targets", () => {
    it("uses a stable path without putting a credential into appearance data", () => {
        const lock = appearancePropertyLockTarget("tab:one", "fontSize", "hover");
        expect(lock.path).toBe("appearance/7:tab:one/11:state:hover/8:fontSize");
        expect(JSON.stringify(lock)).not.toMatch(/password|secret|totp|credential/i);
    });

    it("covers every base typography and surface property", () => {
        const targets = appearancePropertyLockTargets("app.tab", emptyRecord());
        expect(targets).toHaveLength(TYPOGRAPHY_PROPERTIES.length + SURFACE_PROPERTIES.length);
        expect(new Set(targets.map((entry) => entry.path)).size).toBe(targets.length);
    });

    it("adds independent state targets only for declared layers", () => {
        const record = emptyRecord();
        record.states.hover = { surface: { gap: 4 } };
        const targets = appearancePropertyLockTargets("app.tab", record);
        expect(
            targets.some((entry) => entry.path === "appearance/7:app.tab/11:state:hover/3:gap"),
        ).toBe(true);
        expect(targets.some((entry) => entry.path === "element:app.tab/state:focus/gap")).toBe(
            false,
        );
    });

    it("cannot collide when ids contain separators and still recognizes legacy paths", () => {
        const left = appearancePropertyLockTarget("a/b", "c", "hover");
        const right = appearancePropertyLockTarget("a", "b", "hover");
        expect(left.path).not.toBe(right.path);
        expect(legacyAppearancePropertyLockPath("a/b", "c", "hover")).toBe(
            "element:a/b/state:hover/c",
        );
        expect(() => appearancePropertyLockTarget("x".repeat(257), "gap")).toThrow();
    });
});
