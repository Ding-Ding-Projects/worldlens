import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

import { buildLevelDatNbt } from "@worldlens/worldgen";
import { describe, expect, it } from "vitest";

import {
    applySettings,
    readNbtDocument,
    readSettingsFrom,
    readWorldSettings,
    writeNbtDocument,
    writeWorldSettings,
} from "./settings.js";

/** a real level.dat, written by the emitter this project ships rather than hand-rolled */
function levelDat(): Uint8Array {
    return buildLevelDatNbt({ seed: 1234, name: "Before", spawnX: 1, spawnY: 64, spawnZ: 2 });
}

async function worldFolder(): Promise<string> {
    const folder = await mkdtemp(join(tmpdir(), "chunker-settings-"));
    await writeFile(join(folder, "level.dat"), gzipSync(levelDat()));
    return folder;
}

describe("the typed NBT tree", () => {
    it("round-trips a real level.dat byte for byte", () => {
        const original = levelDat();
        const rewritten = writeNbtDocument(readNbtDocument(original));
        expect(Buffer.from(rewritten).equals(Buffer.from(original))).toBe(true);
    });

    it("keeps every tag type it read, so a byte does not come back as an int", () => {
        const tree = readNbtDocument(levelDat());
        expect(tree.type).toBe("compound");
        if (tree.type !== "compound") return;
        const data = tree.entries.get("Data");
        expect(data?.type).toBe("compound");
        if (data?.type !== "compound") return;
        expect(data.entries.get("Difficulty")?.type).toBe("byte");
        expect(data.entries.get("SpawnAngle")?.type).toBe("float");
        expect(data.entries.get("Time")?.type).toBe("long");
    });
});

describe("readSettingsFrom", () => {
    it("reads name, seed, spawn and rules", () => {
        const read = readSettingsFrom(readNbtDocument(levelDat()));
        expect(read.ok).toBe(true);
        if (!read.ok) return;
        expect(read.settings.name).toBe("Before");
        expect(read.settings.seed).toBe(1234n);
        expect(read.settings.spawnX).toBe(1);
        expect(read.settings.spawnZ).toBe(2);
    });

    it("refuses a document that is not a Java level.dat, as a value", () => {
        const read = readSettingsFrom({ type: "compound", entries: new Map() });
        expect(read.ok).toBe(false);
    });
});

describe("applySettings", () => {
    it("changes only what it was given and leaves the rest exactly as it was", () => {
        const original = readNbtDocument(levelDat());
        const updated = applySettings(original, { name: "After", spawnY: 90 });

        const read = readSettingsFrom(updated);
        expect(read.ok).toBe(true);
        if (!read.ok) return;
        expect(read.settings.name).toBe("After");
        expect(read.settings.spawnY).toBe(90);
        expect(read.settings.spawnX).toBe(1);
        expect(read.settings.seed).toBe(1234n);

        // The original tree is untouched, which is what makes a before-and-after preview
        // possible.
        const before = readSettingsFrom(original);
        expect(before.ok && before.settings.name).toBe("Before");
    });

    it("writes the seed into both places a world can keep it", () => {
        const updated = applySettings(readNbtDocument(levelDat()), { seed: -99n });
        expect(updated.type).toBe("compound");
        if (updated.type !== "compound") return;
        const data = updated.entries.get("Data");
        if (data?.type !== "compound") return;
        expect(data.entries.get("RandomSeed")).toEqual({ type: "long", value: -99n });
        const worldGen = data.entries.get("WorldGenSettings");
        if (worldGen?.type !== "compound") return;
        expect(worldGen.entries.get("seed")).toEqual({ type: "long", value: -99n });
    });

    it("adds game rules to a world that had none", () => {
        const updated = applySettings(readNbtDocument(levelDat()), {
            gameRules: { doFireTick: "false", keepInventory: "true" },
        });
        const read = readSettingsFrom(updated);
        expect(read.ok).toBe(true);
        if (!read.ok) return;
        expect(read.settings.gameRules).toEqual({ doFireTick: "false", keepInventory: "true" });
    });
});

describe("reading and writing a world folder", () => {
    it("round-trips through the file", async () => {
        const folder = await worldFolder();

        const written = await writeWorldSettings(folder, {
            name: "Renamed",
            seed: 77n,
            spawnX: -10,
            spawnY: 70,
            spawnZ: 20,
            gameRules: { mobGriefing: "false" },
        });
        expect(written.ok).toBe(true);
        if (!written.ok) return;

        const read = await readWorldSettings(folder);
        expect(read.ok).toBe(true);
        if (!read.ok) return;
        expect(read.settings).toEqual({
            name: "Renamed",
            seed: 77n,
            spawnX: -10,
            spawnY: 70,
            spawnZ: 20,
            gameRules: { mobGriefing: "false" },
        });

        // Written gzip-compressed, which is what the game and every other tool expects.
        const bytes = await readFile(join(folder, "level.dat"));
        expect(bytes[0]).toBe(0x1f);
        expect(() => gunzipSync(bytes)).not.toThrow();
    });

    it("reports a missing world as a value rather than throwing", async () => {
        const read = await readWorldSettings(join(tmpdir(), "chunker-no-such-world"));
        expect(read.ok).toBe(false);
    });

    it("leaves an unparseable file untouched instead of truncating it", async () => {
        const folder = await mkdtemp(join(tmpdir(), "chunker-broken-"));
        await writeFile(join(folder, "level.dat"), Buffer.from([9, 9, 9, 9]));

        const written = await writeWorldSettings(folder, { name: "Renamed" });
        expect(written.ok).toBe(false);
        expect(await readFile(join(folder, "level.dat"))).toEqual(Buffer.from([9, 9, 9, 9]));
    });
});
