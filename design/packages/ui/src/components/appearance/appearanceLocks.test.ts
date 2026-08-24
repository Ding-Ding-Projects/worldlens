import { describe, expect, it } from "vitest";
import { appearancePropertyLockTarget, appearancePropertyLockTargets } from "./appearanceLocks.js";
import { emptyRecord } from "./appearanceRecord.js";
import { TYPOGRAPHY_PROPERTIES } from "./typographySpec.js";
import { SURFACE_PROPERTIES } from "./appearanceRecord.js";

describe("appearance property lock targets", () => {
    it("uses a stable path without putting a credential into appearance data", () => {
        const lock = appearancePropertyLockTarget("tab:one", "fontSize", "hover");
        expect(lock.path).toBe("element:tab:one/state:hover/fontSize");
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
        expect(targets.some((entry) => entry.path === "element:app.tab/state:hover/gap")).toBe(
            true,
        );
        expect(targets.some((entry) => entry.path === "element:app.tab/state:focus/gap")).toBe(
            false,
        );
    });
});
