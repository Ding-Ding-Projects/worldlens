import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zstdCompressSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { readBundledBase } from "./ipc.js";

/**
 * The installer ships each appliance base zstd-compressed. These prove the first-use expansion
 * produces the exact image the build recorded, is reused afterwards, and refuses a base whose
 * expanded bytes do not match, rather than composing a disk onto something unverified.
 */
async function setup(image: Buffer, recorded?: string) {
    const root = await mkdtemp(join(tmpdir(), "worldlens-base-"));
    const resources = join(root, "resources");
    await mkdir(join(resources, "appliance"), { recursive: true });
    await writeFile(join(resources, "appliance", "base-rpi.img.zst"), zstdCompressSync(image));
    const sha256 = recorded ?? createHash("sha256").update(image).digest("hex");
    await writeFile(join(resources, "appliance", "base-rpi.json"), JSON.stringify({ file: "base-rpi.img.zst", compression: "zstd", sha256, bytes: image.length }));
    return { resources, cache: join(root, "cache"), sha256 };
}

describe("readBundledBase", () => {
    it("expands a compressed base once, verifies it, and reuses it", async () => {
        const image = Buffer.alloc(3 * 1024 * 1024, 7);
        const { resources, cache, sha256 } = await setup(image);
        const first = await readBundledBase(resources, "aarch64-rpi", cache);
        expect(first?.sha256).toBe(sha256);
        expect((await readFile(first!.path)).equals(image)).toBe(true);
        const writtenAt = (await stat(first!.path)).mtimeMs;
        const second = await readBundledBase(resources, "aarch64-rpi", cache);
        expect(second?.path).toBe(first?.path);
        expect((await stat(second!.path)).mtimeMs).toBe(writtenAt);
    });

    it("refuses a base whose expanded bytes do not match the recorded digest", async () => {
        const { resources, cache } = await setup(Buffer.from("not the recorded image"), "0".repeat(64));
        expect(await readBundledBase(resources, "aarch64-rpi", cache)).toBeNull();
    });

    it("says no base is carried when the manifest is missing", async () => {
        const root = await mkdtemp(join(tmpdir(), "worldlens-base-none-"));
        expect(await readBundledBase(root, "x86_64", join(root, "cache"))).toBeNull();
    });
});
