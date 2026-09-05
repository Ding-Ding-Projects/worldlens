// @vitest-environment node

/**
 * The packaging guard, exercised against a real directory tree.
 *
 * `electron-builder.config.cjs` listed `dist/bundled` in `extraResources` throughout
 * v1.0.2026 and the installer genuinely contained the jar - so a check against the config, or
 * against the staging directory, would have passed on the broken release and told nobody
 * anything. This asserts against the *result*: a tree shaped like the one electron-builder
 * writes, with the runtimes at the exact paths a running app reads.
 *
 * Each case removes or corrupts one thing at a time and requires red, then restores it and
 * requires green. A guard nobody has watched fail is decoration.
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import {
    assertPackagedBundles,
    readBundledRuntimeManifest,
} from "../../../scripts/assert-packaged-bundles.mjs";

const manifestPath = fileURLToPath(
    new URL("../../../bundled-runtimes.manifest.json", import.meta.url),
);

const temporary: string[] = [];

afterEach(() => {
    for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});

/**
 * A packaged `resources` directory holding runtimes of exactly the pinned size and digest.
 *
 * The manifest's real 31,790,149-byte size would make every case here write and hash 30 MB, so
 * the test uses its own manifest object with sizes it can afford. The shape being proven is the
 * guard's, not the jar's.
 */
function packagedTree(manifest: {
    chunker: { packagedPath: string; sha256: string; sizeBytes: number };
    java: { packagedPath: string };
}): string {
    const root = mkdtempSync(join(tmpdir(), "worldlens-packaged-"));
    temporary.push(root);
    for (const [path, contents] of [
        [manifest.chunker.packagedPath, "not really a jar"],
        [manifest.java.packagedPath, "not really a java"],
    ] as const) {
        const file = join(root, ...path.split("/"));
        mkdirSync(join(file, ".."), { recursive: true });
        writeFileSync(file, contents);
    }
    return root;
}

function manifestForFixture() {
    const chunkerBytes = "not really a jar";
    return {
        schemaVersion: 1 as const,
        chunker: {
            packagedPath: "bundled/chunker/chunker-cli-1.19.1.jar",
            sha256: createHash("sha256").update(chunkerBytes).digest("hex"),
            sizeBytes: Buffer.byteLength(chunkerBytes),
        },
        java: { packagedPath: "bundled/java/bin/java.exe" },
    };
}

describe("the packaged-output guard", () => {
    it("passes on a tree that carries both runtimes at the paths the app reads", async () => {
        const manifest = manifestForFixture();
        const proved = await assertPackagedBundles(packagedTree(manifest), { manifest });

        expect(proved.map((row: { name: string }) => row.name).sort()).toEqual(["chunker", "java"]);
    });

    it("fails when the Chunker jar is missing from the packaged output", async () => {
        const manifest = manifestForFixture();
        const root = packagedTree(manifest);
        rmSync(join(root, "bundled", "chunker", "chunker-cli-1.19.1.jar"));

        await expect(assertPackagedBundles(root, { manifest })).rejects.toThrow(
            /missing its bundled chunker/,
        );
    });

    it("fails when the packaged jar is not the bytes this release pinned", async () => {
        const manifest = manifestForFixture();
        const root = packagedTree(manifest);
        // Same length, different bytes: a size check alone would let this through, which is
        // why the digest is checked as well.
        writeFileSync(join(root, "bundled", "chunker", "chunker-cli-1.19.1.jar"), "NOT really a jar");

        await expect(assertPackagedBundles(root, { manifest })).rejects.toThrow(/hashes to/);
    });

    it("fails when the bundled Java runtime is missing", async () => {
        const manifest = manifestForFixture();
        const root = packagedTree(manifest);
        rmSync(join(root, "bundled", "java", "bin", "java.exe"));

        await expect(assertPackagedBundles(root, { manifest })).rejects.toThrow(
            /missing its bundled java/,
        );
    });
});

describe("the committed bundle manifest", () => {
    it("names a packaged path and a full-length digest for every runtime it promises", async () => {
        const manifest = await readBundledRuntimeManifest(manifestPath);

        expect(manifest.chunker.packagedPath).toBe("bundled/chunker/chunker-cli-1.19.1.jar");
        expect(manifest.java.packagedPath).toBe("bundled/java/bin/java.exe");
        expect(manifest.chunker.sha256).toHaveLength(64);
    });
});
