import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { saveDataPackToWorld } from "./datapackSave.js";

const ZIP = Buffer.from("504b0506000000000000000000000000000000000000", "hex").toString("base64");
let dir = "";

afterEach(async () => {
    if (dir !== "") await rm(dir, { recursive: true, force: true });
    dir = "";
});

describe("saving a data pack into a world", () => {
    it("writes the zip into datapacks and says when it replaced one", async () => {
        dir = await mkdtemp(join(tmpdir(), "wl-dp-"));
        await writeFile(join(dir, "level.dat"), "");
        const first = await saveDataPackToWorld(dir, "my_pack.zip", ZIP);
        expect(first).toMatchObject({ path: join(dir, "datapacks", "my_pack.zip"), bytes: 22, replaced: false });
        expect((await readFile(first.path)).length).toBe(22);
        const second = await saveDataPackToWorld(dir, "my_pack.zip", ZIP);
        expect(second.replaced).toBe(true);
        expect(await readdir(join(dir, "datapacks"))).toEqual(["my_pack.zip"]);
    });

    it("refuses a folder that is not a world, a bad name and bytes that are not a zip", async () => {
        dir = await mkdtemp(join(tmpdir(), "wl-dp-"));
        await expect(saveDataPackToWorld(dir, "a.zip", ZIP)).rejects.toThrow(/no level.dat/);
        await writeFile(join(dir, "level.dat"), "");
        await expect(saveDataPackToWorld(dir, "../a.zip", ZIP)).rejects.toThrow(/plain .zip/);
        await expect(saveDataPackToWorld(dir, "a.txt", ZIP)).rejects.toThrow(/plain .zip/);
        await expect(saveDataPackToWorld(dir, "a.zip", Buffer.from("hello").toString("base64"))).rejects.toThrow(/not a .zip/);
        await expect(saveDataPackToWorld("relative", "a.zip", ZIP)).rejects.toThrow(/full path/);
    });
});
