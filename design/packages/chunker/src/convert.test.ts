import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { buildLevelDatNbt } from "@worldlens/worldgen";
import { describe, expect, it } from "vitest";

import { convertWorld, dimensionFolderRenames, planConversion } from "./convert.js";

async function javaWorld(): Promise<string> {
    const folder = await mkdtemp(join(tmpdir(), "chunker-convert-"));
    await mkdir(join(folder, "region"), { recursive: true });
    await writeFile(
        join(folder, "level.dat"),
        gzipSync(buildLevelDatNbt({ seed: 5, name: "Source", spawnX: 0, spawnY: 64, spawnZ: 0 })),
    );
    return folder;
}

describe("planConversion", () => {
    it("refuses a target version that is not a release", async () => {
        const source = await javaWorld();
        const planned = await planConversion({
            sourceFolder: source,
            targetFolder: join(source, "..", "out-" + Date.now()),
            targetEdition: "java",
            targetVersion: "24w14a",
        });
        expect(planned.ok).toBe(false);
    });

    it("refuses to write into a folder that already exists", async () => {
        const source = await javaWorld();
        const planned = await planConversion({
            sourceFolder: source,
            targetFolder: source,
            targetEdition: "java",
            targetVersion: "1.21",
        });
        expect(planned.ok).toBe(false);
        if (planned.ok) return;
        expect(planned.reason).toContain("already");
    });

    it("refuses an inverted prune rectangle", async () => {
        const source = await javaWorld();
        const planned = await planConversion({
            sourceFolder: source,
            targetFolder: join(source + "-out"),
            targetEdition: "java",
            targetVersion: "1.21",
            bounds: { minChunkX: 10, minChunkZ: 0, maxChunkX: -10, maxChunkZ: 0 },
        });
        expect(planned.ok).toBe(false);
    });
});

describe("convertWorld", () => {
    it("hands a cross-edition conversion back with its plan rather than half-doing it", async () => {
        const source = await javaWorld();
        const result = await convertWorld({
            sourceFolder: source,
            targetFolder: source + "-bedrock",
            targetEdition: "bedrock",
            targetVersion: "1.21",
        });
        expect(result.kind).toBe("needs-external-converter");
        if (result.kind !== "needs-external-converter") return;
        expect(result.plan.crossEdition).toBe(true);
        expect(result.plan.sourceEdition).toBe("java");
    });

    it("copies a same-edition world and applies settings", async () => {
        const source = await javaWorld();
        const target = source + "-copy";
        const result = await convertWorld({
            sourceFolder: source,
            targetFolder: target,
            targetEdition: "java",
            targetVersion: "1.21",
            settings: { name: "Converted" },
        });

        expect(result.kind).toBe("converted");
        if (result.kind !== "converted") return;
        expect(result.settings?.name).toBe("Converted");
        expect(result.regionsWritten).toBe(0);
    });

    it("returns a refusal as a value when the source is not a world at all", async () => {
        const result = await convertWorld({
            sourceFolder: join(tmpdir(), "chunker-not-a-world-" + Date.now()),
            targetFolder: join(tmpdir(), "chunker-out-" + Date.now()),
            targetEdition: "java",
            targetVersion: "1.21",
        });
        expect(result.kind).toBe("refused");
    });
});

describe("dimensionFolderRenames", () => {
    it("renames the nether folder to the end folder", () => {
        const renames = dimensionFolderRenames({ "minecraft:the_nether": "minecraft:the_end" });
        expect(renames.get("DIM-1")).toBe("DIM1");
    });

    it("declines to merge a dimension into the overworld, which lives at the world root", () => {
        const renames = dimensionFolderRenames({ "minecraft:the_nether": "minecraft:overworld" });
        expect(renames.size).toBe(0);
    });

    it("ignores a dimension it does not know", () => {
        const renames = dimensionFolderRenames({ "somemod:moon": "minecraft:the_end" });
        expect(renames.size).toBe(0);
    });
});
