/**
 * The packaging check for the TypeScript engine, and the packaging config it guards.
 *
 * `assertPackagedRenderEngines` runs in electron-builder's `afterPack` against the directory
 * the packager wrote. These build that directory in the shapes that matter, including the
 * one three releases shipped, and prove the check refuses each broken one by name.
 */

import { mkdtemp, rm, truncate } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { assertPackagedRenderEngines } from "../../../scripts/assert-packaged-render-engines.mjs";
import { FIXTURE_ARCHIVE, dropPackages, writeEngineTree } from "./typescriptEngineFixture.js";

let resources: string;
let packaged: string;

beforeEach(async () => {
    resources = await mkdtemp(join(tmpdir(), "worldlens-packaged-engines-"));
    packaged = join(resources, "render-engines");
});

afterEach(async () => {
    await rm(resources, { recursive: true, force: true });
});

describe("assertPackagedRenderEngines", () => {
    it("accepts a packaged engine whose files, packages and archive are all present and load", async () => {
        const archive = await writeEngineTree(packaged);

        const proved = await assertPackagedRenderEngines(resources);

        expect(proved.version).toBe("9.9.9");
        expect(proved.archiveSize).toBe(archive.size);
    }, 60_000);

    it("fails the build on the shape 1.0.2500 shipped: engine files present, packages absent", async () => {
        await writeEngineTree(packaged);
        await dropPackages(packaged);

        await expect(assertPackagedRenderEngines(resources)).rejects.toThrow(
            /incomplete; missing the package @worldlens\/nbt \(typescript\/node_modules\/@worldlens\/nbt\)/u,
        );
    });

    it("fails when a package the engine imports was never staged, which no file list can show", async () => {
        await writeEngineTree(packaged, { unlistedImport: "worldlens-package-nobody-staged" });

        await expect(assertPackagedRenderEngines(resources)).rejects.toThrow(
            /has every listed file and still does not load[\s\S]*worldlens-package-nobody-staged/u,
        );
    }, 60_000);

    it("fails when the reinstall archive is missing", async () => {
        await writeEngineTree(packaged);
        await rm(join(packaged, FIXTURE_ARCHIVE));

        await expect(assertPackagedRenderEngines(resources, { probe: false })).rejects.toThrow(
            /reinstall archive is missing/u,
        );
    });

    it("fails when the reinstall archive is not the size the manifest records", async () => {
        const archive = await writeEngineTree(packaged);
        await truncate(join(packaged, FIXTURE_ARCHIVE), archive.size - 1);

        await expect(assertPackagedRenderEngines(resources, { probe: false })).rejects.toThrow(
            /the manifest records/u,
        );
    });
});

describe("the packaging configuration", () => {
    const config = createRequire(import.meta.url)("../../../electron-builder.config.cjs") as {
        extraResources: ReadonlyArray<{ from?: string; to?: string } | string>;
        afterPack: unknown;
    };
    const engineSets = config.extraResources.filter(
        (entry): entry is { from: string; to: string } =>
            typeof entry === "object" && String(entry.to).startsWith("render-engines"),
    );

    /*
     * electron-builder drops a directory named `node_modules` at the root of a copied file
     * set, whatever its `filter` says. `dist/render-engines/typescript` as its own file set
     * put `typescript/node_modules` exactly there. One set rooted a level higher keeps it a
     * nested folder. Hand-written, so splitting the set again turns this red.
     */
    it("copies the render engines as one file set rooted above the engine's node_modules", () => {
        expect(engineSets).toEqual([
            { from: "dist/render-engines", to: "render-engines", filter: ["**/*"] },
        ]);
    });

    it("checks the packaged result in afterPack", () => {
        expect(typeof config.afterPack).toBe("function");
        expect(String(config.afterPack)).toContain("assertPackagedRenderEngines");
    });
});
