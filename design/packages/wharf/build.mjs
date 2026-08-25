import { build } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

/**
 * Bundles Wharf's main process, its preload, and copies its renderer.
 *
 * Modelled on `packages/kid-check/build.mjs` rather than `packages/app/build.mjs`, and for
 * the reason that file gives: the app's build carries a CommonJS-`require` shim and a WASM
 * asset copy because its main process reaches `@worldlens/engine`. Wharf's reaches
 * `@worldlens/dockhand`, which is Node builtins and nothing else, so both would be dead
 * weight copied from a problem this package does not have.
 */
async function main() {
    await build({
        entryPoints: ["src/main/index.ts"],
        outfile: "dist/main/index.js",
        bundle: true,
        platform: "node",
        format: "esm",
        target: "node22",
        external: ["electron"],
        sourcemap: true,
    });

    /** Sandboxed preloads must be CommonJS, exactly as the shipped app's own is. */
    await build({
        entryPoints: ["src/preload/index.ts"],
        outfile: "dist/preload/index.cjs",
        bundle: true,
        platform: "node",
        format: "cjs",
        target: "node22",
        external: ["electron"],
        sourcemap: true,
    });

    mkdirSync("dist/renderer", { recursive: true });
    cpSync("src/renderer", "dist/renderer", { recursive: true });

    /**
     * The design system's tokens, copied from the package rather than kept as a second copy
     * in this repository.
     *
     * A checked-in duplicate is a file that is correct on the day it is added and silently
     * wrong afterwards: the two applications would drift into looking like two products
     * while every diff looked clean. Copying at build time means the only way they can
     * disagree is if one of them has not been built.
     */
    cpSync(
        createRequire(import.meta.url).resolve("@worldlens/design-system/tokens.css"),
        "dist/renderer/tokens.css",
    );

    console.log("wharf build done");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    await main();
}

export { main };
