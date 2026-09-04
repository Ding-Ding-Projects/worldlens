import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BlueNBT, NBTWriter } from "@worldlens/nbt";
import { Key } from "@worldlens/shared";
import { ResourcePath } from "../src/resources/ResourcePath.js";
import {
    BANNER_BLOCK_ENTITY_TOKEN,
    BANNER_COLOR,
    BANNER_COLOR_CURRENT,
    BANNER_PATTERN_CURRENT,
    BannerBlockEntity,
    bannerRenderLayers,
    clearBannerPatternDiagnostics,
    getBannerPatternDiagnostics,
    registerBannerBlockEntitySchemas,
} from "../src/world/mca/blockentity/BannerBlockEntity.js";

type PatternEntry = {
    Pattern?: string;
    Color?: number | string;
    pattern?: string;
    color?: number | string;
};

type BannerFixture = {
    "legacy-1.12": { Patterns: PatternEntry[] };
    "current-namespaced-components": { patterns: PatternEntry[] };
    "future-identifier-preservation": { Patterns: PatternEntry[] };
};

const fixture = JSON.parse(
    readFileSync(new URL("./fixtures/banner/banner-patterns.json", import.meta.url), "utf8"),
) as BannerFixture;

function bannerNbt(
    fieldName: "Patterns" | "patterns",
    entries: readonly PatternEntry[],
    writeEntry: (writer: NBTWriter, entry: PatternEntry) => void = (writer, entry) => {
        writer.beginCompound();
        if (entry.Pattern !== undefined) writer.name("Pattern").valueString(entry.Pattern);
        if (entry.pattern !== undefined) writer.name("pattern").valueString(entry.pattern);
        if (entry.Color !== undefined) {
            writer.name("Color");
            if (typeof entry.Color === "number") writer.valueInt(entry.Color);
            else writer.valueString(entry.Color);
        }
        if (entry.color !== undefined) {
            writer.name("color");
            if (typeof entry.color === "number") writer.valueInt(entry.color);
            else writer.valueString(entry.color);
        }
        writer.endCompound();
    },
): Uint8Array {
    const writer = new NBTWriter();
    writer.beginCompound();
    writer.name(fieldName).beginList(entries.length);
    for (const entry of entries) writeEntry(writer, entry);
    writer.endList();
    writer.endCompound();
    writer.close();
    return writer.toUint8Array();
}

function readBanner(bytes: Uint8Array): BannerBlockEntity {
    const nbt = new BlueNBT();
    registerBannerBlockEntitySchemas(nbt);
    return nbt.read(bytes, BANNER_BLOCK_ENTITY_TOKEN);
}

function writeBanner(entity: BannerBlockEntity): Uint8Array {
    entity.id = new Key("minecraft:banner");
    entity.customName = "Banner acceptance round-trip";
    const nbt = new BlueNBT();
    registerBannerBlockEntitySchemas(nbt);
    return nbt.writeToBytes(entity, BANNER_BLOCK_ENTITY_TOKEN);
}

function layers(entity: BannerBlockEntity): [string, number | string][] {
    return entity.getPatterns().map((layer) => [String(layer.getPattern()), layer.getColor()]);
}

describe("BannerBlockEntity typed pattern compatibility", () => {
    it("keeps fixture layers ordered and supports all 16 legacy and current colors", () => {
        const legacy = readBanner(
            bannerNbt("Patterns", [
                ...fixture["legacy-1.12"].Patterns,
                ...Object.values(BANNER_COLOR).map((color, index) => ({
                    Pattern: `fixture_${index}`,
                    Color: color,
                })),
            ]),
        );
        expect(layers(legacy).slice(0, 2)).toEqual([
            ["bs", 15],
            ["cre", 4],
        ]);
        expect(layers(legacy).slice(2).map(([, color]) => color)).toEqual(
            Object.values(BANNER_COLOR),
        );

        const current = readBanner(
            bannerNbt("patterns", [
                ...fixture["current-namespaced-components"].patterns,
                ...Object.values(BANNER_COLOR_CURRENT).map((color, index) => ({
                    pattern: Object.values(BANNER_PATTERN_CURRENT)[index]!,
                    color,
                })),
            ]),
        );
        expect(layers(current).slice(0, 3)).toEqual([
            ["minecraft:stripe_bottom", 15],
            ["minecraft:creeper", 4],
            ["minecraft:triangles_top", 11],
        ]);
        expect(layers(current).slice(3).map(([, color]) => color)).toEqual(
            Object.values(BANNER_COLOR_CURRENT),
        );
    });

    it("accepts both legacy and current NBT field forms", () => {
        expect(
            layers(
                readBanner(
                    bannerNbt("Patterns", fixture["legacy-1.12"].Patterns),
                ),
            ),
        ).toEqual([
            ["bs", 15],
            ["cre", 4],
        ]);
        expect(
            layers(
                readBanner(
                    bannerNbt("patterns", fixture["current-namespaced-components"].patterns),
                ),
            ),
        ).toEqual([
            ["minecraft:stripe_bottom", 15],
            ["minecraft:creeper", 4],
            ["minecraft:triangles_top", 11],
        ]);
    });

    it("rejects a malformed layer instead of inventing a default", () => {
        const bytes = bannerNbt(
            "Patterns",
            [{ Pattern: "bs", Color: 15 }],
            (writer) => {
                writer.beginCompound();
                writer.name("Pattern").valueString("bs");
                writer.name("Color").beginCompound();
                writer.endCompound();
                writer.endCompound();
            },
        );
        // This used to require `readBanner` to throw. The parser is deliberately lenient now:
        // `LenientListAdapter` drops the one bad layer and records a payload-free diagnostic,
        // rather than failing the whole banner and taking the layers either side of it down
        // with it. That is a better answer to the same question, so the assertion moved
        // rather than being deleted.
        //
        // The rule this actually protects is unchanged and is the reason the case exists: a
        // malformed layer must not come back as a *valid-looking* one. Colour 0 is black and
        // a real value, so a silently defaulted layer would be indistinguishable from a
        // banner the player really dyed black.
        clearBannerPatternDiagnostics();
        const entity = readBanner(bytes);

        // `writeEntry` replaces the per-entry writer, so this fixture holds exactly one layer
        // and that layer is the malformed one. Empty is therefore the whole list, and it is
        // what separates the two outcomes: a defaulted layer would come back as a real pair
        // such as `["minecraft:bricks", 0]`, which is a banner somebody could have dyed.
        expect(layers(entity), "the malformed layer must be dropped, not defaulted").toEqual([]);
        expect(getBannerPatternDiagnostics()).toContain(
            "Dropped one malformed banner pattern layer (IOException).",
        );
    });

    it("preserves unknown future identifiers and colors through a round trip", () => {
        const entity = readBanner(
            bannerNbt("Patterns", fixture["future-identifier-preservation"].Patterns),
        );
        expect(layers(entity)).toEqual([
            ["future_minecraft_pattern", 42],
            ["b", 1],
        ]);
        expect(layers(readBanner(writeBanner(entity)))).toEqual(layers(entity));
    });

    it("resolves current pattern identifiers as resource paths and caches the lookup", () => {
        const path = new ResourcePath(Object.values(BANNER_PATTERN_CURRENT)[0]!);
        const resource = { id: path.getFormatted() };
        let lookups = 0;
        const resolve = () =>
            path.getResource(() => {
                lookups++;
                return resource;
            });

        expect(path.getNamespace()).toBe("minecraft");
        expect(path.getValue()).toBe("base");
        expect(resolve()).toBe(resource);
        expect(resolve()).toBe(resource);
        expect(lookups).toBe(1);
    });

    it("resolves ordered layers to banner resource paths and dye tints", () => {
        const entity = readBanner(
            bannerNbt("Patterns", fixture["legacy-1.12"].Patterns),
        );
        expect(
            bannerRenderLayers(entity).map((layer) => [
                layer.texture.getFormatted(),
                layer.tint,
            ]),
        ).toEqual([
            ["minecraft:entity/banner/stripe_bottom", [0.114, 0.114, 0.129]],
            ["minecraft:entity/banner/creeper", [0.996, 0.847, 0.239]],
        ]);
    });

    it("keeps unknown future layers addressable without inventing a tint", () => {
        const entity = readBanner(
            bannerNbt("Patterns", fixture["future-identifier-preservation"].Patterns),
        );
        expect(bannerRenderLayers(entity).map((layer) => [
            layer.texture.getFormatted(),
            layer.tint,
        ])).toEqual([
            ["minecraft:entity/banner/future_minecraft_pattern", [1, 1, 1]],
            ["minecraft:entity/banner/banner_base", [0.976, 0.502, 0.114]],
        ]);
    });
});
