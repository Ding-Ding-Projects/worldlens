import { describe, expect, it } from "vitest";
import { compareVersions, isStrictlyNewerVersion } from "./version.js";

describe("update version comparison", () => {
    it("orders core versions without losing large numeric components", () => {
        expect(compareVersions("1.10.0", "1.9.9")).toBe(1);
        expect(compareVersions("999999999999999999.0.0", "1000000000000000000.0.0")).toBe(-1);
        expect(compareVersions("v0.2.0", "0.2.0")).toBe(0);
    });

    it("orders prereleases before their final release", () => {
        expect(compareVersions("1.0.0-rc.2", "1.0.0-rc.10")).toBe(-1);
        expect(compareVersions("1.0.0-rc.1", "1.0.0")).toBe(-1);
        expect(compareVersions("1.0.0", "1.0.0-rc.1")).toBe(1);
    });

    it("rejects unsupported version strings instead of guessing", () => {
        expect(compareVersions("1.0", "1.0.0")).toBeNull();
        expect(compareVersions("1.0.0+build", "1.0.0")).toBeNull();
        expect(isStrictlyNewerVersion("0.1.0", "0.1.0")).toBe(false);
    });
});
