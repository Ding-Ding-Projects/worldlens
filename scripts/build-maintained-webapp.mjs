#!/usr/bin/env node
/** Build the pinned maintained viewer before any workspace consumer stages its assets. */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function buildMaintainedWebapp({ repoRoot, run = spawnSync, platform = process.platform }) {
    const source = join(repoRoot, "vendor", "BlueMap-Material", "common", "webapp");
    for (const file of ["package.json", "package-lock.json"]) {
        if (!existsSync(join(source, file)))
            throw new Error(`The pinned maintained viewer source is missing ${file}. Initialize vendor/BlueMap-Material before building.`);
    }
    for (const args of [["ci", "--no-audit", "--no-fund"], ["run", "build"]]) {
        // Arguments are fixed application-authored words. The Windows shell is needed
        // only for npm.cmd; paths are passed as cwd, never interpolated into shell text.
        const result = run("npm", args, { cwd: source, stdio: "inherit", shell: platform === "win32", timeout: 300_000 });
        if (result.error || result.status !== 0)
            throw new Error(`Maintained viewer npm ${args[0]} did not complete successfully${result.signal ? ` (${result.signal})` : ""}. No workspace build was started.`);
    }
    const output = join(source, "dist");
    const entry = statSync(join(output, "index.html"), { throwIfNoEntry: false });
    const assets = existsSync(join(output, "assets")) ? readdirSync(join(output, "assets")) : [];
    if (!entry?.isFile() || entry.size === 0 || !assets.some((name) => name.endsWith(".js")) || !assets.some((name) => name.endsWith(".css")))
        throw new Error("Maintained viewer build exited successfully without a complete index, script and stylesheet bundle.");
    return { source, output };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    buildMaintainedWebapp({ repoRoot: resolve(dirname(fileURLToPath(import.meta.url)), "..") });
    console.log("Maintained viewer built before workspace staging.");
}
