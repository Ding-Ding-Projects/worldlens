import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
const CONFIG = { version: 1, title: "t", healthLabel: "h", access: null };
import { hostedSettings, listMapSizes, packMap } from "./mapPack.js";

/** A small independent tar reader, so the writer is checked against the format and not itself. */
function readTar(buffer: Buffer): Map<string, Buffer> {
    const files = new Map<string, Buffer>();
    let offset = 0;
    let pendingPath: string | null = null;
    while (offset + 512 <= buffer.length) {
        const block = buffer.subarray(offset, offset + 512);
        if (block.every((byte) => byte === 0)) break;
        const nameField = block.subarray(0, 100).toString("utf8").replace(/\0.*$/s, "");
        const prefix = block.subarray(345, 500).toString("utf8").replace(/\0.*$/s, "");
        const size = parseInt(block.subarray(124, 136).toString("ascii").replace(/\0.*$/s, "").trim(), 8);
        const type = String.fromCharCode(block[156] as number);
        const body = buffer.subarray(offset + 512, offset + 512 + size);
        offset += 512 + Math.ceil(size / 512) * 512;
        const checksum = parseInt(block.subarray(148, 154).toString("ascii"), 8);
        let sum = 0;
        for (let i = 0; i < 512; i += 1) sum += i >= 148 && i < 156 ? 0x20 : (block[i] as number);
        expect(checksum).toBe(sum);
        if (type === "x") { pendingPath = /path=(.*)\n/.exec(body.toString("utf8"))?.[1] ?? null; continue; }
        files.set(pendingPath ?? (prefix === "" ? nameField : `${prefix}/${nameField}`), Buffer.from(body));
        pendingPath = null;
    }
    return files;
}

async function renderFixture(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "worldlens-render-"));
    await mkdir(join(root, "maps", "overworld"), { recursive: true });
    await mkdir(join(root, "maps", "nether"), { recursive: true });
    await writeFile(join(root, "index.html"), "<html>viewer</html>");
    await writeFile(join(root, "settings.json"), JSON.stringify({ maps: ["overworld", "nether"], clientDecompression: false }));
    await writeFile(join(root, "maps", "overworld", "0.prbm.gz"), Buffer.from("overworld tile"));
    await writeFile(join(root, "maps", "nether", "0.prbm.gz"), Buffer.from("nether tile"));
    return root;
}

describe("packMap", () => {
    it("packs the chosen maps only, with settings rewritten for a static host", async () => {
        const root = await renderFixture();
        const out = join(await mkdtemp(join(tmpdir(), "worldlens-tar-")), "map.tar");
        const report = await packMap({ webRoot: root, maps: ["overworld"], outFile: out, config: CONFIG });
        const files = readTar(await readFile(out));
        expect([...files.keys()].sort()).toEqual(["map/index.html", "map/maps/overworld/0.prbm.gz", "map/settings.json", "worldlens-map.json"]);
        expect(files.get("map/maps/overworld/0.prbm.gz")?.toString()).toBe("overworld tile");
        const settings = JSON.parse(files.get("map/settings.json")?.toString() ?? "{}") as { maps: string[]; clientDecompression: boolean };
        expect(settings.clientDecompression).toBe(true);
        expect(settings.maps).toEqual(["overworld"]);
        expect(report.files).toBe(4);
        expect(JSON.parse(files.get("worldlens-map.json")?.toString() ?? "{}")).toMatchObject({ title: "t" });
        expect(report.contentBytes).toBeGreaterThan("overworld tile".length);
        // The render on this PC is not edited.
        expect(JSON.parse(await readFile(join(root, "settings.json"), "utf8"))).toMatchObject({ clientDecompression: false });
    });

    it("writes a path longer than the ustar name field so it reads back whole", async () => {
        const root = await renderFixture();
        const deep = join(root, "maps", "overworld", "a".repeat(60), "b".repeat(60), "c".repeat(60));
        await mkdir(deep, { recursive: true });
        await writeFile(join(deep, "tile.prbm.gz"), "deep");
        const out = join(await mkdtemp(join(tmpdir(), "worldlens-tar-")), "map.tar");
        await packMap({ webRoot: root, maps: ["overworld"], outFile: out, config: CONFIG });
        const key = `map/maps/overworld/${"a".repeat(60)}/${"b".repeat(60)}/${"c".repeat(60)}/tile.prbm.gz`;
        expect(readTar(await readFile(out)).get(key)?.toString()).toBe("deep");
    });

    it("refuses a map the render does not have, an empty choice and an unsafe id", async () => {
        const root = await renderFixture();
        const out = join(await mkdtemp(join(tmpdir(), "worldlens-tar-")), "map.tar");
        await expect(packMap({ webRoot: root, maps: ["end"], outFile: out, config: CONFIG })).rejects.toThrow(/no map called end/);
        await expect(packMap({ webRoot: root, maps: [], outFile: out, config: CONFIG })).rejects.toThrow(/at least one map/);
        await expect(packMap({ webRoot: root, maps: ["../x"], outFile: out, config: CONFIG })).rejects.toThrow(/Unsafe map id/);
    });

    it("refuses a symbolic link inside the map", async () => {
        const root = await renderFixture();
        try { await symlink(join(root, "index.html"), join(root, "maps", "overworld", "link")); } catch { return; }
        const out = join(await mkdtemp(join(tmpdir(), "worldlens-tar-")), "map.tar");
        await expect(packMap({ webRoot: root, maps: ["overworld"], outFile: out, config: CONFIG })).rejects.toThrow(/symbolic link/);
    });
});

describe("hostedSettings", () => {
    it("refuses a map whose tiles live at another address", () => {
        expect(() => hostedSettings(JSON.stringify({ mapDataRoot: "https://other.example/maps", maps: ["a"] }), ["a"])).toThrow(/instead of its own files/);
    });
    it("keeps object-form map entries that are chosen", () => {
        const text = hostedSettings(JSON.stringify({ maps: [{ id: "a" }, { id: "b" }] }), ["b"]);
        expect(JSON.parse(text)).toMatchObject({ maps: [{ id: "b" }], clientDecompression: true });
    });
});

describe("listMapSizes", () => {
    it("sums each map's bytes", async () => {
        const root = await renderFixture();
        const sizes = await listMapSizes(root);
        expect(sizes).toEqual([{ id: "nether", bytes: "nether tile".length }, { id: "overworld", bytes: "overworld tile".length }]);
    });
});
