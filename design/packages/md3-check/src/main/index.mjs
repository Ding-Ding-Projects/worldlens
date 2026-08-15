// The Electron main process for the MD3 conformance harness.
//
// ## Why this is plain, un-typed, un-bundled JavaScript, unlike the real app's main process
//
// `packages/app/build.mjs` bundles its main process through esbuild with a hand-written
// `require`/`__dirname` shim banner, because that process pulls in CommonJS dependencies
// (pngjs for texture decoding, `@bokuweb/zstd-wasm` for region-file decompression) that break
// under a plain ESM bundle - see that file's own header for the exact failures and how they
// were reproduced. This harness's main process touches none of that: it opens one window and
// loads one local HTML file. There is nothing here for a bundler to earn its complexity on, so
// there is no bundler - this file *is* what Electron runs, unmodified, and "cat this file" is
// the whole debugging story if it ever misbehaves.
//
// ## Why there is no preload and no contextBridge
//
// The renderer never touches the filesystem, never asks the OS for anything, and never talks
// to this process at all. Every number it displays comes from measuring its own DOM
// (`src/renderer/lib/measure.ts`); every image `scripts/capture.mjs` produces is written by
// that *external* Playwright driver script, over the Chrome DevTools Protocol, from outside
// this window entirely - not through IPC into it. So there is nothing for a preload to bridge.
// `contextIsolation`/`sandbox` stay on below anyway: not because anything here needs the
// isolation, but because leaving them on is free and "this window has no privileged bridge at
// all" is a much smaller attack surface to reason about than "this window has a bridge that
// happens to expose nothing yet."
import { app, BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
// `src/main` -> package root -> `dist/renderer/index.html`, matching `vite.config.ts`'s
// `build.outDir`. Resolved once at startup and checked eagerly (not lazily inside
// `loadFile`'s own error path) so "you forgot to run `pnpm build` first" reads as a clear,
// named failure instead of a blank window with a cryptic `ERR_FILE_NOT_FOUND` in the console.
const builtIndexHtml = join(here, "..", "..", "dist", "renderer", "index.html");

function assertBuilt() {
    if (existsSync(builtIndexHtml)) return;
    throw new Error(
        `MD3 conformance harness: no built renderer at ${builtIndexHtml}. ` +
            "Run `pnpm --filter @worldlens/md3-check run build` (or `run capture`, which " +
            "builds first) before `pnpm --filter @worldlens/md3-check run start`.",
    );
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1440,
        height: 960,
        minWidth: 900,
        minHeight: 600,
        backgroundColor: "#101418",
        // No custom title bar: this is deliberately *not* a product surface subject to the
        // repository's "frameless window, custom Material title bar" rule for user-facing
        // apps. It is a developer instrument, never packaged or released, whose whole brief is
        // to carry none of the real app's chrome - the ordinary OS window frame is the
        // smallest, most honest chrome available, not a shortcut around the product rule.
        frame: true,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            // No preload: see the file header for why there is nothing to bridge.
        },
    });

    win.loadFile(builtIndexHtml);

    return win;
}

app.whenReady().then(() => {
    assertBuilt();
    createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on("window-all-closed", () => {
    // Matches every other Electron app in this workspace's convention (and Windows's own): no
    // menu-bar-only "app stays alive with no window" affordance exists here, so there is
    // nothing useful left running once the one window closes.
    if (process.platform !== "darwin") app.quit();
});
