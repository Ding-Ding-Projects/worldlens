/**
 * The TypeScript engine resolver, against real trees on disk.
 *
 * The case these exist for is the one releases 1.0.2490 to 1.0.2502 installed: the engine's
 * own files present, a manifest reading `"available": true`, and none of the packages the
 * engine imports. The resolver used to answer that with "not staged in this build. Build
 * the engine bundle before rendering", addressed to somebody who had installed an app.
 */

import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { EngineProvisionProgress } from "./engineProvisioning.js";
import { EngineUnavailableError } from "./orchestrator.js";
import {
    describeTypeScriptEngine,
    managedTypeScriptEngineRoot,
    typescriptEngine,
} from "./typescriptEngine.js";
import { FIXTURE_ARCHIVE, dropPackages, writeEngineTree } from "./typescriptEngineFixture.js";

let work: string;
let resources: string;
let dataDir: string;
let packaged: string;

beforeEach(async () => {
    work = await mkdtemp(join(tmpdir(), "worldlens-ts-engine-"));
    resources = join(work, "resources");
    dataDir = join(work, "userData");
    packaged = join(resources, "render-engines");
});

afterEach(async () => {
    await rm(work, { recursive: true, force: true });
});

describe("typescriptEngine", () => {
    it("resolves the packaged engine when every package it imports is on disk", async () => {
        await writeEngineTree(packaged);

        const engine = await typescriptEngine({ resourcesPath: resources, dataDir })();

        expect(engine.engine).toBe("typescript");
        expect(engine.engineVersion).toBe("9.9.9");
        expect(engine.enginePath).toBe(join(packaged, "typescript", "dist", "index.js"));
        expect(engine.driverPath).toBe(join(packaged, "typescript", "render-ts.mjs"));
        expect(existsSync(join(dataDir, "render-engines"))).toBe(false);
    });

    it("reinstalls the engine with progress, then resolves it, when its packages were not shipped", async () => {
        const archive = await writeEngineTree(packaged);
        await dropPackages(packaged);
        const progress: EngineProvisionProgress[] = [];

        const engine = await typescriptEngine({ resourcesPath: resources, dataDir })(
            "typescript",
            undefined,
            (event) => progress.push(event),
        );

        const managed = managedTypeScriptEngineRoot(dataDir, archive.sha256);
        expect(engine.enginePath).toBe(join(managed, "typescript", "dist", "index.js"));
        expect(engine.driverPath).toBe(join(managed, "typescript", "render-ts.mjs"));
        // What the render is about to launch really is there, packages included.
        expect(existsSync(engine.enginePath as string)).toBe(true);
        expect(
            existsSync(join(managed, "typescript", "node_modules", "@worldlens", "nbt", "index.js")),
        ).toBe(true);

        const stages = progress.map((event) => event.stage);
        expect(stages[0]).toBe("checking");
        expect(stages).toContain("verifying");
        expect(stages).toContain("installing");
        expect(stages.at(-1)).toBe("installed");
        const installing = progress.filter((event) => event.stage === "installing");
        expect(installing.at(-1)?.received).toBe(installing.at(-1)?.total);
        expect(installing.at(-1)?.total).toBeGreaterThan(0);
        // The installed app's own resources are never written to.
        expect(existsSync(join(packaged, "typescript", "node_modules"))).toBe(false);
    });

    it("reuses the reinstalled copy on the next render instead of extracting again", async () => {
        await writeEngineTree(packaged);
        await dropPackages(packaged);
        const resolve = typescriptEngine({ resourcesPath: resources, dataDir });
        const first = await resolve();
        const progress: EngineProvisionProgress[] = [];

        const second = await resolve("typescript", undefined, (event) => progress.push(event));

        expect(second.enginePath).toBe(first.enginePath);
        expect(progress.map((event) => event.stage)).toEqual(["checking", "reused"]);
    });

    it("names the missing packages and the missing archive when it cannot reinstall", async () => {
        await writeEngineTree(packaged);
        await dropPackages(packaged);
        await rm(join(packaged, FIXTURE_ARCHIVE));

        const failure = await typescriptEngine({ resourcesPath: resources, dataDir })().catch(
            (error: unknown) => error,
        );

        expect(failure).toBeInstanceOf(EngineUnavailableError);
        const message = (failure as EngineUnavailableError).message;
        expect(message).toContain("the package @worldlens/nbt (typescript/node_modules/@worldlens/nbt)");
        expect(message).toContain("the package pngjs (typescript/node_modules/pngjs)");
        expect(message).toContain(FIXTURE_ARCHIVE);
        expect(message).toContain("is missing from this installation");
        expect(message).toContain("Java was not selected as a fallback");
        expect(message).toContain("Start the render again to retry");
        // The old sentence told an installed app's user to build the engine.
        expect(message).not.toContain("Build the engine bundle");
        expect(message).not.toContain("not staged in this build");
    });

    it("refuses an archive whose bytes do not match the recorded digest", async () => {
        await writeEngineTree(packaged);
        await dropPackages(packaged);
        const archivePath = join(packaged, FIXTURE_ARCHIVE);
        const bytes = await readFile(archivePath);
        bytes[bytes.length - 30] = (bytes[bytes.length - 30] ?? 0) ^ 0xff;
        await writeFile(archivePath, bytes);

        await expect(typescriptEngine({ resourcesPath: resources, dataDir })()).rejects.toThrow(
            /does not match its recorded SHA-256/u,
        );
        expect(existsSync(join(dataDir, "render-engines", "typescript"))).toBe(false);
    });

    it("says a checkout has not been built, without mentioning an installation", async () => {
        await expect(typescriptEngine({ repositoryRoot: join(work, "empty") })()).rejects.toThrow(
            /has not been built in this checkout/u,
        );
    });

    it("refuses to resolve another engine", async () => {
        await expect(typescriptEngine()("upstream-java")).rejects.toBeInstanceOf(
            EngineUnavailableError,
        );
    });
});

describe("describeTypeScriptEngine", () => {
    it("reports a complete packaged engine as bundled", async () => {
        await writeEngineTree(packaged);
        expect(await describeTypeScriptEngine({ resourcesPath: resources, dataDir })).toEqual({
            available: true,
            version: "9.9.9",
            source: "bundled",
            reason: null,
        });
    });

    it("does not call an engine with no packages ready: it says what is missing and that it will be reinstalled", async () => {
        await writeEngineTree(packaged);
        await dropPackages(packaged);

        const summary = await describeTypeScriptEngine({ resourcesPath: resources, dataDir });

        expect(summary.available).toBe(true);
        expect(summary.source).toBe("repairable");
        expect(summary.reason).toContain("the package @worldlens/shared");
        expect(summary.reason).toContain("reinstalled automatically when the next render starts");
    });

    it("reports the reinstalled copy once a render has made one", async () => {
        await writeEngineTree(packaged);
        await dropPackages(packaged);
        await typescriptEngine({ resourcesPath: resources, dataDir })();

        const summary = await describeTypeScriptEngine({ resourcesPath: resources, dataDir });

        expect(summary.available).toBe(true);
        expect(summary.source).toBe("managed");
    });

    it("reports the engine as unavailable when it is incomplete and cannot be reinstalled", async () => {
        await writeEngineTree(packaged);
        await dropPackages(packaged);
        await rm(join(packaged, FIXTURE_ARCHIVE));

        const summary = await describeTypeScriptEngine({ resourcesPath: resources, dataDir });

        expect(summary.available).toBe(false);
        expect(summary.source).toBeNull();
        expect(summary.reason).toContain("the package @worldlens/nbt");
        expect(summary.reason).toContain("cannot be reinstalled");
    });
});
