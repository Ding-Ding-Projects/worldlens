#!/usr/bin/env node
/** Stage the maintained viewer into the CLI distribution; missing assets fail the build. */
import { cp, mkdir, readdir, realpath, rm, stat, lstat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function copyWebapp({ repoRoot, packageRoot }) {
    const source = join(repoRoot, "vendor", "BlueMap-Material", "common", "webapp", "dist");
    const destination = resolve(packageRoot, "dist", "webapp");
    const entry = await stat(join(source, "index.html")).catch(() => null);
    const assets = await readdir(join(source, "assets")).catch(() => []);
    if (!entry?.isFile() || entry.size === 0 || !assets.some((name) => name.endsWith(".js")) || !assets.some((name) => name.endsWith(".css"))) {
        throw new Error("The maintained BlueMap viewer bundle is incomplete. Build the pinned BlueMap-Material source before building the CLI.");
    }
    await mkdir(join(packageRoot, "dist"), { recursive: true });
    const actualPackage = await realpath(packageRoot);
    const actualParent = await realpath(dirname(destination));
    if (relative(actualPackage, actualParent) !== "dist") {
        throw new Error("The CLI output parent resolves outside its package.");
    }
    const previous = await lstat(destination).catch((error) => {
        if (error.code === "ENOENT") return null;
        throw error;
    });
    if (previous?.isSymbolicLink()) throw new Error("The CLI viewer output must not be a symbolic link.");
    await rm(destination, { recursive: true, force: true });
    await cp(source, destination, { recursive: true });
    return { source, destination };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const result = await copyWebapp({ packageRoot, repoRoot: resolve(packageRoot, "..", "..", "..") });
    console.log(`[copy-webapp] copied ${result.source} -> ${result.destination}`);
}
