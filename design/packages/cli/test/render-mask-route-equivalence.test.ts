/**
 * A cross-route proof for the one ordered `render-mask` value the map editor owns.
 *
 * This deliberately crosses package boundaries instead of asking a UI helper whether a
 * renderer is "exact":
 *
 *  1. the UI's config model writes the FieldMeta value into HOCON;
 *  2. the local CLI reads the validated HOCON and constructs its real CombinedMask;
 *  3. the Actions config writer carries the same HOCON through both unsharded and sharded
 *     output, preserving project layers before its runtime-owned subtraction layers.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { descriptorFor, parseConfigText, type MapConfig, type PlainValue } from "@worldlens/config";
import { describe, expect, it } from "vitest";
import { combinedMaskFromConfig } from "../src/maps.js";
import {
    fieldValue,
    openConfigFile,
    setFieldValue,
} from "../../ui/src/components/config/configModel.js";
import { planShards } from "../../render-actions/src/plan/plan.js";
import {
    renderMaskSubtractions,
    writeShardConfig,
} from "../../render-actions/src/config/renderConfig.js";
import type {
    RegionMeasurement,
    WorldMeasurement,
} from "../../render-actions/src/world/measure.js";

const MAP_DESCRIPTOR = descriptorFor("map");
const RENDER_MASK_FIELD = MAP_DESCRIPTOR.fields.find((field) => field.path === "render-mask");

if (RENDER_MASK_FIELD === undefined) {
    throw new Error("The map descriptor has no render-mask FieldMeta.");
}

/** A measured four-region world is enough to make the Actions route write a shard boundary. */
function measuredWorld(): WorldMeasurement {
    const regions: RegionMeasurement[] = [
        { fileName: "r.0.0.mca", x: 0, z: 0, chunkCount: 1024, bytes: 4_200_000 },
        { fileName: "r.1.0.mca", x: 1, z: 0, chunkCount: 1024, bytes: 4_200_000 },
        { fileName: "r.0.1.mca", x: 0, z: 1, chunkCount: 1024, bytes: 4_200_000 },
        { fileName: "r.1.1.mca", x: 1, z: 1, chunkCount: 1024, bytes: 4_200_000 },
    ];

    return {
        regionDirectory: "/test-world/region",
        dimension: "minecraft:overworld",
        regions,
        regionBounds: { x: { min: 0, max: 1 }, z: { min: 0, max: 1 } },
        blockBounds: { x: { min: 0, max: 1023 }, z: { min: 0, max: 1023 } },
        chunkCount: 4096,
        bytes: regions.reduce((total, region) => total + region.bytes, 0),
        bytesPerChunk: 4101.5625,
        regionGridFillRatio: 1,
    };
}

function parsedMap(text: string): MapConfig {
    const parsed = parseConfigText(MAP_DESCRIPTOR, text);
    if (!parsed.ok || parsed.value === null) {
        throw new Error(
            `Expected valid map HOCON, got: ${parsed.issues.map((issue) => issue.message).join("; ")}`,
        );
    }
    return parsed.value;
}

describe("render-mask route equivalence", () => {
    it("carries the UI-authored ordered layers through local CLI and Actions config output", async () => {
        /*
         * This is the value the card/editor emits. It has a positive box, a subtractive circle,
         * then a re-added smaller box, so merely comparing independent shapes would miss an
         * order regression.
         */
        const authored: PlainValue[] = [
            {
                type: "bluemap:box",
                subtract: false,
                "min-x": 0,
                "max-x": 120,
                "min-y": -64,
                "max-y": 320,
                "min-z": 0,
                "max-z": 120,
            },
            {
                type: "bluemap:circle",
                subtract: true,
                "center-x": 60,
                "center-z": 60,
                radius: 24,
                "min-y": -64,
                "max-y": 320,
            },
            {
                type: "bluemap:box",
                subtract: false,
                "min-x": 55,
                "max-x": 65,
                "min-y": -64,
                "max-y": 320,
                "min-z": 55,
                "max-z": 65,
            },
        ];

        // UI schema + serializer: the FieldMeta is the same one mounted by the map card.
        const initial = openConfigFile(MAP_DESCRIPTOR, "maps/world.conf", "render-mask: []\n");
        const uiFile = setFieldValue(initial, RENDER_MASK_FIELD, authored);
        expect(uiFile.issues.filter((issue) => issue.severity === "error")).toEqual([]);
        expect(fieldValue(uiFile, RENDER_MASK_FIELD)).toEqual(authored);

        const localMap = parsedMap(uiFile.text);
        expect(localMap["render-mask"]).toEqual(authored);

        // Local CLI conversion: proof of ordered "Render it / Cut it out / Render it" semantics.
        const localMask = combinedMaskFromConfig(localMap["render-mask"]);
        expect(localMask.test(10, 40, 10)).toBe(true);
        expect(localMask.test(40, 40, 60)).toBe(false);
        expect(localMask.test(60, 40, 60)).toBe(true);
        expect(localMask.test(150, 40, 150)).toBe(false);

        const root = await mkdtemp(join(tmpdir(), "worldlens-render-mask-route-"));
        try {
            const plan = planShards(measuredWorld(), {
                mapId: "world",
                budgetSeconds: 120,
                forceShards: 4,
                lowresTileSize: 500,
                lodFactor: 5,
                lodCount: 3,
            });
            expect(plan.shards.length).toBeGreaterThan(1);

            const baseOptions = {
                plan,
                worldDirectory: join(root, "world"),
                dataDirectory: join(root, "data"),
                storageRoot: join(root, "out", "maps"),
                webRoot: join(root, "out"),
                mapName: "Overworld",
                acceptDownload: true,
                renderThreadCount: 2,
                mapConfig: uiFile.text,
                mapConfigSource: "project" as const,
                mapConfigReason: "route-equivalence test",
            };

            // An unsharded Actions invocation must carry the authored list unchanged.
            const unshardedDirectory = join(root, "unsharded-config");
            await writeShardConfig({
                ...baseOptions,
                shard: null,
                configDirectory: unshardedDirectory,
            });
            const unsharded = parsedMap(
                await readFile(join(unshardedDirectory, "maps", "world.conf"), "utf8"),
            );
            expect(unsharded["render-mask"]).toEqual(localMap["render-mask"]);

            // A shard appends its own outside-subtraction boxes *after* the project list;
            // it must never replace or reorder the map-card layers.
            const shardedDirectory = join(root, "sharded-config");
            await writeShardConfig({
                ...baseOptions,
                shard: plan.shards[0]!,
                configDirectory: shardedDirectory,
            });
            const shardedText = await readFile(
                join(shardedDirectory, "maps", "world.conf"),
                "utf8",
            );
            const authoredIndex = shardedText.indexOf(uiFile.text.trim());
            const runtimeIndex = shardedText.indexOf("# Runtime-owned values.");
            expect(authoredIndex).toBeGreaterThanOrEqual(0);
            expect(runtimeIndex).toBeGreaterThan(authoredIndex);

            /*
             * The guided HOCON editor intentionally rejects `+=` (it cannot round-trip a
             * list append safely), while BlueMap's Actions runtime does accept it. Compare
             * the actual generated file's append entries rather than pretending its writer
             * can parse a syntax it correctly refuses. Each exact block is a subtracting box
             * produced from the real shard bounds after the unchanged UI-authored list.
             */
            const expectedAppends = renderMaskSubtractions(plan.shards[0]!.bounds);
            expect(expectedAppends.length).toBeGreaterThan(0);
            for (const append of expectedAppends) expect(shardedText).toContain(append);
            expect((shardedText.match(/render-mask \+= \{/g) ?? []).length).toBe(
                expectedAppends.length,
            );
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
