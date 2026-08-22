import { describe, expect, it } from "vitest";

import {
    FLAVOUR_CARDS,
    clampMemoryToMachine,
    filterVersions,
    flavourCard,
    groupVersions,
    memorySliderMax,
    stepIndex,
} from "./wizardModel.js";
import type { CatalogueVersionEntry } from "./serverStore.js";

function entry(version: string, stability: "release" | "snapshot" = "release"): CatalogueVersionEntry {
    return { version, stability, javaFeature: 21, downloadUrl: null, sha256: null };
}

describe("FLAVOUR_CARDS", () => {
    it("has a card for every server flavour the model knows about", () => {
        const ids = FLAVOUR_CARDS.map((card) => card.id);
        expect(ids).toContain("vanilla");
        expect(ids).toContain("paper");
        expect(ids).toContain("velocity");
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("flavourCard looks one up by id", () => {
        expect(flavourCard("paper")?.name).toBe("Paper");
        expect(flavourCard("vanilla")?.cataloguedId).toBe("vanilla");
        expect(flavourCard("spigot")?.cataloguedId).toBeNull();
    });
});

describe("groupVersions", () => {
    it("splits release and snapshot, releases first", () => {
        const groups = groupVersions([entry("1.21.1"), entry("25w01a", "snapshot")]);
        expect(groups.map((g) => g.stability)).toEqual(["release", "snapshot"]);
    });

    it("omits an empty group entirely", () => {
        const groups = groupVersions([entry("1.21.1")]);
        expect(groups).toHaveLength(1);
    });
});

describe("filterVersions", () => {
    const versions = [entry("1.21.1"), entry("1.20.4"), entry("25w01a", "snapshot")];

    it("plain text is a case-insensitive substring match", () => {
        expect(filterVersions(versions, "1.21", false).map((v) => v.version)).toEqual(["1.21.1"]);
    });

    it("regex mode uses the pattern", () => {
        expect(filterVersions(versions, "^1\\.2[01]", true).map((v) => v.version).sort()).toEqual([
            "1.20.4",
            "1.21.1",
        ]);
    });

    it("an invalid pattern matches nothing rather than throwing", () => {
        expect(filterVersions(versions, "(", true)).toEqual([]);
    });

    it("an empty query returns everything unfiltered", () => {
        expect(filterVersions(versions, "", false)).toHaveLength(3);
    });
});

describe("clampMemoryToMachine", () => {
    it("keeps a value inside the safe window", () => {
        expect(clampMemoryToMachine(2048, 16384)).toBe(2048);
    });

    it("clamps a request above what the machine can spare", () => {
        expect(clampMemoryToMachine(16000, 16384)).toBeLessThan(16384);
    });

    it("never proposes less than 512", () => {
        expect(clampMemoryToMachine(1, 16384)).toBe(512);
    });
});

describe("memorySliderMax", () => {
    it("reserves at least a quarter of the machine", () => {
        expect(memorySliderMax(8192)).toBe(6144);
    });

    it("reserves at least 1024 on a small machine", () => {
        expect(memorySliderMax(2048)).toBe(1024);
    });
});

describe("stepIndex", () => {
    it("orders the wizard steps", () => {
        expect(stepIndex("flavour")).toBe(0);
        expect(stepIndex("review")).toBeGreaterThan(stepIndex("flavour"));
    });
});
