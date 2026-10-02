/**
 * `startWorldDownloader` actually supplies what `registerDownloaderHandlers` needs.
 *
 * The module was written, tested and never called: `design/packages/app/src/main/worlddownloader`
 * shipped a complete `ipc.ts` with no call site in `index.ts`, no preload exposure and no screen -
 * wired at one end and consumed at neither, exactly the shape `bundledRuntimeWiring.test.ts`
 * exists to catch for Java resolution specifically. This is the same discipline applied to the
 * downloader's own registration: booting Electron is what these unit suites deliberately do not
 * do, so this reads the real source of `index.ts` and asserts the production call site passes
 * `dataDir`, `safeStorage`, a non-provisioning `ensureJava` and an `onEvent` that fans to every
 * window - never that the function was merely declared.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "index.ts"), "utf8").replace(/\r/g, "");

const codeOf = (text: string): string =>
    text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const code = codeOf(source);

function bodyOf(functionName: string): string {
    const marker = `function ${functionName}(`;
    const start = code.indexOf(marker);
    expect(start, `${functionName} should exist in index.ts`).toBeGreaterThanOrEqual(0);
    // registerDownloaderHandlers's own call closes well within a few hundred characters; this is
    // the same crude-but-honest bounding `bundledRuntimeWiring.test.ts` uses for the same reason.
    return code.slice(start, start + 1200);
}

describe("the world downloader is actually reachable from the shell", () => {
    it("imports the real handlers rather than leaving them dead code", () => {
        expect(code).toMatch(
            /import\s*{\s*DOWNLOADER_EVENT_CHANNEL,\s*registerDownloaderHandlers\s*}\s*from\s*"\.\/worlddownloader\/ipc\.js"/,
        );
    });

    it("registers the handlers with a data directory and the real safe-storage", () => {
        const body = bodyOf("startWorldDownloader");
        expect(body).toMatch(/registerDownloaderHandlers\(\s*ipcMain\s*,/);
        expect(body).toMatch(/dataDir:\s*app\.getPath\("userData"\)/);
        expect(body).toMatch(/safeStorage\s*,/);
    });

    it("resolves Java without provisioning one", () => {
        const body = bodyOf("startWorldDownloader");
        expect(body).toMatch(/ensureJava:\s*async\s*\(\)\s*=>/);
        // The whole point: it discovers, it never provisions. A provisioning call here would
        // turn a status poll into an unrequested multi-hundred-megabyte download.
        expect(body).toMatch(/discoverJava\(/);
        expect(body).not.toMatch(/ensureJava\(\{/);
    });

    it("passes the packaged resourcesPath so a bundled JVM is offered, exactly like every other resolver", () => {
        const body = bodyOf("startWorldDownloader");
        expect(body).toMatch(/resourcesPath:\s*app\.isPackaged\s*\?\s*process\.resourcesPath\s*:\s*null/);
    });

    it("fans real session events to every open window on the real event channel", () => {
        const body = bodyOf("startWorldDownloader");
        expect(body).toMatch(/onEvent:\s*\(event\)\s*=>/);
        expect(body).toMatch(/BrowserWindow\.getAllWindows\(\)/);
        expect(body).toMatch(/window\.webContents\.send\(DOWNLOADER_EVENT_CHANNEL,\s*event\)/);
    });

    it("disposes on quit and is started during independent startup, like its docker-world sibling", () => {
        const body = bodyOf("startWorldDownloader");
        expect(body).toMatch(/app\.on\("will-quit",\s*\(\)\s*=>\s*worldDownloaderIpc\?\.dispose\(\)\)/);
        expect(code).toMatch(
            /\[\s*"dependency",\s*"world-downloader",\s*"[^"]*",\s*startWorldDownloader,?\s*\]/,
        );
    });
});
