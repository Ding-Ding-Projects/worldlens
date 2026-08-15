import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

/**
 * This app's Vite root is `src/renderer`, not the package root, so that `index.html` sits
 * next to the code it boots (matching how `packages/ui` keeps its own entry HTML at the
 * package root because that root *is* its renderer). `main` (`../main/index.mjs`) is a
 * separate, un-bundled Node ESM file Electron loads directly - see its own header for why -
 * so it is never part of this Vite build at all.
 */
const rendererRoot = fileURLToPath(new URL("./src/renderer", import.meta.url));

/**
 * `base: "./"` is load-bearing, not a style choice: `src/main/index.mjs` loads the built
 * output with `BrowserWindow.loadFile()`, i.e. over `file://`, and Vite's default root-
 * absolute asset URLs (`/assets/...`) resolve to nothing under that protocol. `./assets/...`
 * resolves relative to `index.html`'s own real location instead. `packages/ui/vite.config.ts`
 * sets the same thing for the same reason, though that package's output is served over HTTP
 * by an embedded server rather than loaded from disk - either way, an absolute root breaks.
 */
export default defineConfig({
    root: rendererRoot,
    plugins: [vue()],
    base: "./",
    resolve: {
        alias: {
            "@": rendererRoot,
        },
    },
    build: {
        // Kept apart from a hypothetical future `dist/main` so `src/main/index.mjs`'s
        // `loadFile()` path (`../../dist/renderer/index.html`) never has to guess which
        // half of a shared `dist/` it is looking at.
        outDir: fileURLToPath(new URL("./dist/renderer", import.meta.url)),
        emptyOutDir: true,
        sourcemap: true,
    },
    server: {
        fs: {
            // Vite's dev-server file allow-list defaults to the nearest ancestor holding a
            // lockfile, which is `design/` here - the same directory `pnpm-workspace.yaml`
            // names - so sibling packages (`@worldlens/ui`'s deep-imported source, see
            // `lib/worldlensVuetify.ts`) are already inside it. Restated explicitly anyway,
            // the same defensive way `packages/ui/vite.config.ts` restates it: `allow`
            // REPLACES the default rather than adding to it, so leaving this implicit would
            // be one dependency-version bump away from silently narrowing to `src/renderer`
            // alone the moment Vite's default-detection logic changes.
            allow: [fileURLToPath(new URL("../../", import.meta.url))],
        },
    },
});
