import { build } from "esbuild";
import { pathToFileURL } from "node:url";

/**
 * Bundles the main process and the preload script.
 *
 * Deliberately without `packages/app/build.mjs`'s own CommonJS-`require` shim banner and its
 * `zstd.wasm` asset copy. Both exist there for one reason: the shipped app's main process reaches
 * `@worldlens/engine` (pngjs for texture atlases, `@bokuweb/zstd-wasm` for region-file
 * decompression), and esbuild leaves a bundled CommonJS dependency's own `require("util")` and
 * `__dirname` references untouched in an ESM bundle, which throws at the first render rather than at
 * build time - see that file's own doc comment for the exact reproduction. This package's main
 * process imports only `HttpServer` and `StaticHandler` directly from `@worldlens/server`'s built
 * `dist/http/` - not the package's own barrel, which re-exports the render/remote/live modules that
 * are what actually pull the engine in - so none of that is ever reached, and the shim would be
 * dead weight copied from a problem this file's own imports do not have.
 */
async function main() {
    /** Main process: ESM (Electron >=28 supports ESM entry points, and Electron 37 is what
     * `packages/app` pins and what this harness boots the same renderer under). */
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

    /** Preload: sandboxed preloads must be CommonJS, exactly as the shipped app's own is. */
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

    console.log("kid-check build done");
}

// Only run when this file is executed directly (`node build.mjs` / `npm run build`), matching
// `packages/app/build.mjs`'s own guard, so a test could import this module's exports later without
// triggering a real build as a side effect.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    await main();
}
