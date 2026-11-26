/**
 * The real TypeScript engine, staged, damaged the way three releases shipped it, reinstalled
 * by the app's own resolver, and loaded in a fresh process.
 *
 * Everything else about this feature is tested on a few-hundred-byte fixture. This is the
 * one place the actual engine build goes through the actual staging script, so it needs
 * the workspace packages built (`pnpm build` in design/) and is skipped by name otherwise.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertPackagedRenderEngines } from "../../../scripts/assert-packaged-render-engines.mjs";
import { stageTypeScriptEngine } from "../../../scripts/stage-render-engines.mjs";
import type { StagedTypeScriptEngineEntry } from "../../../scripts/stage-render-engines.mjs";
import type { EngineProvisionProgress } from "./engineProvisioning.js";
import { typescriptEngine } from "./typescriptEngine.js";
import { dropPackages } from "./typescriptEngineFixture.js";

const run = promisify(execFile);
const packagesRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const built = ["engine", "shared", "nbt", "design-system"].every((name) =>
    existsSync(join(packagesRoot, name, "dist", "index.js")),
);

async function treeSize(root: string): Promise<{ bytes: number; files: string[] }> {
    let bytes = 0;
    const files: string[] = [];
    for (const entry of await readdir(root, { withFileTypes: true, recursive: true })) {
        if (!entry.isFile()) continue;
        const path = join(entry.parentPath, entry.name);
        bytes += (await stat(path)).size;
        files.push(path);
    }
    return { bytes, files };
}

describe.skipIf(!built)("the staged TypeScript engine (needs the workspace built)", () => {
    let work: string;
    let resources: string;
    let packaged: string;
    let entry: StagedTypeScriptEngineEntry;

    beforeAll(async () => {
        work = await mkdtemp(join(tmpdir(), "worldlens-staged-engine-"));
        resources = join(work, "resources");
        packaged = join(resources, "render-engines");
        entry = await stageTypeScriptEngine(packaged);
    }, 180_000);

    afterAll(async () => {
        await rm(work, { recursive: true, force: true });
    });

    it("stages the packages the engine imports and not the ones a package.json merely names", () => {
        const names = entry.packageResolution.packages.map((record) => record.name);
        for (const required of ["@worldlens/nbt", "@worldlens/shared", "pngjs", "lz4js"]) {
            expect(names).toContain(required);
        }
        // A peer dependency of the design tokens. Following package.json staged 60 MB of it.
        for (const unused of ["vue", "vuetify", "@mdi/js", "postcss"]) {
            expect(names).not.toContain(unused);
        }
    });

    it("stays far below the size that broke the updater, and carries no maps or declarations", async () => {
        const { bytes, files } = await treeSize(packaged);
        // 5.1 MB when this was written. The earlier staging was 96 MB; the update package has
        // roughly 60 MB of headroom before the updater can no longer fetch it as one file.
        expect(bytes).toBeLessThan(16 * 1024 * 1024);
        expect(files.filter((file) => /\.(?:map|d\.ts|d\.mts|d\.cts)$/u.test(file))).toEqual([]);
    });

    it("gives the driver and the engine one copy of the shared package", async () => {
        const stub = await readFile(join(packaged, "shared", "dist", "index.js"), "utf8");
        expect(stub.trim()).toBe(
            'export * from "../../typescript/node_modules/@worldlens/shared/dist/index.js";',
        );
    });

    it("passes the packaging check, load probe included", async () => {
        const proved = await assertPackagedRenderEngines(resources);
        expect(proved.archiveSize).toBe(entry.repairArchive.size);
    }, 120_000);

    it("is reinstalled by the resolver when its packages are missing, and then really loads", async () => {
        await dropPackages(packaged);
        const dataDir = join(work, "userData");
        const stages: string[] = [];

        const engine = await typescriptEngine({ resourcesPath: resources, dataDir })(
            "typescript",
            undefined,
            (event: EngineProvisionProgress) => stages.push(event.stage),
        );

        expect(stages).toContain("installing");
        expect(stages.at(-1)).toBe("installed");
        const enginePath = engine.enginePath as string;
        expect(enginePath.startsWith(dataDir)).toBe(true);

        // A fresh process, started outside this checkout so its node_modules cannot help.
        const managedRoot = join(enginePath, "..", "..", "..");
        const script = [
            "const [engine, shared, packaged] = await Promise.all(process.argv.slice(1).map((u) => import(u)));",
            "if (typeof engine.MCAWorld !== 'function') throw new Error('engine did not load');",
            "if (shared.Key !== packaged.Key) throw new Error('two copies of the shared package');",
            "process.stdout.write('loaded');",
        ].join("\n");
        const { stdout } = await run(
            process.execPath,
            [
                "--input-type=module",
                "-e",
                script,
                pathToFileURL(enginePath).href,
                pathToFileURL(join(managedRoot, "shared", "dist", "index.js")).href,
                pathToFileURL(
                    join(managedRoot, "typescript", "node_modules", "@worldlens", "shared", "dist", "index.js"),
                ).href,
            ],
            { cwd: dataDir },
        );
        expect(stdout).toBe("loaded");
    }, 120_000);
});
