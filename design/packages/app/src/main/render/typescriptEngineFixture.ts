/**
 * Test support: a small, real TypeScript-engine tree on disk.
 *
 * Shaped exactly like what `scripts/stage-render-engines.mjs` stages - a manifest, an engine
 * entry that imports its packages by bare name, the driver, the assets folder, the shared
 * re-export and a reinstall archive written by the real build-time zip writer - but a few
 * hundred bytes, so the packaged, damaged and reinstalled cases can each be built in a test.
 */

import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeDeterministicZip } from "../../../scripts/zip-writer.mjs";

export const FIXTURE_ARCHIVE = "typescript-engine.zip";
export const FIXTURE_PACKAGES = ["@worldlens/nbt", "@worldlens/shared", "pngjs"] as const;

interface FixtureOptions {
    /** A bare import the engine makes that no staged package provides. */
    readonly unlistedImport?: string;
}

async function listFiles(root: string, prefix = ""): Promise<string[]> {
    const files: string[] = [];
    for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
        const name = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
        if (entry.isDirectory()) files.push(...(await listFiles(root, name)));
        else files.push(name);
    }
    return files;
}

function manifest(repairArchive: object | null): string {
    return JSON.stringify({
        manifestVersion: 1,
        engines: {
            typescript: {
                id: "typescript",
                version: "9.9.9",
                available: true,
                packageResolution: {
                    root: "typescript/node_modules/@worldlens",
                    packages: FIXTURE_PACKAGES.map((name) => ({
                        name,
                        root: `typescript/node_modules/${name}`,
                        main: "index.js",
                    })),
                },
                ...(repairArchive === null ? {} : { repairArchive }),
            },
        },
    });
}

/**
 * Writes a complete engine tree into `root` (a `render-engines` directory) and returns the
 * record of its reinstall archive.
 */
export async function writeEngineTree(
    root: string,
    options: FixtureOptions = {},
): Promise<{ fileName: string; size: number; sha256: string }> {
    await mkdir(join(root, "typescript", "dist"), { recursive: true });
    await mkdir(join(root, "typescript", "assets"), { recursive: true });
    await mkdir(join(root, "shared", "dist"), { recursive: true });
    const imports = [...FIXTURE_PACKAGES, ...(options.unlistedImport === undefined ? [] : [options.unlistedImport])];
    await writeFile(
        join(root, "typescript", "dist", "index.js"),
        `${imports.map((name) => `import ${JSON.stringify(name)};`).join("\n")}\nexport const loaded = true;\n`,
    );
    await writeFile(join(root, "typescript", "render-ts.mjs"), "export {};\n");
    await writeFile(join(root, "typescript", "assets", "asset.json"), "{}\n");
    await writeFile(
        join(root, "shared", "dist", "index.js"),
        'export * from "../../typescript/node_modules/@worldlens/shared/index.js";\n',
    );
    for (const name of FIXTURE_PACKAGES) {
        const packageRoot = join(root, "typescript", "node_modules", ...name.split("/"));
        await mkdir(packageRoot, { recursive: true });
        await writeFile(
            join(packageRoot, "package.json"),
            JSON.stringify({ name, version: "1.0.0", type: "module", main: "./index.js" }),
        );
        await writeFile(join(packageRoot, "index.js"), `export const name = ${JSON.stringify(name)};\n`);
    }

    // As in staging: the copy inside the archive does not name the archive it travels in.
    await writeFile(join(root, "manifest.json"), manifest(null));
    const files = (await listFiles(root)).filter((name) => name !== FIXTURE_ARCHIVE);
    const archive = await writeDeterministicZip(
        join(root, FIXTURE_ARCHIVE),
        files.map((name) => ({ name, path: join(root, ...name.split("/")) })),
    );
    const record = { fileName: FIXTURE_ARCHIVE, size: archive.size, sha256: archive.sha256 };
    await writeFile(join(root, "manifest.json"), manifest(record));
    return record;
}

/**
 * Turns a complete tree into what releases 1.0.2490 to 1.0.2502 installed: every engine
 * file, a manifest reading `"available": true`, and no `typescript/node_modules`.
 */
export async function dropPackages(root: string): Promise<void> {
    await rm(join(root, "typescript", "node_modules"), { recursive: true, force: true });
}
