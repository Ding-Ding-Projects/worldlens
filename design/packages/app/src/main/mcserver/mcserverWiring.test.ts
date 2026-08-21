import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { MCSERVER_CHANNELS } from "./ipc.js";

/**
 * Proof that this feature is actually plugged in.
 *
 * Every other test in this folder mounts the module directly, which proves the module works
 * and says nothing whatsoever about whether the running application ever calls it. That gap
 * is not hypothetical here: this repository has shipped a tagged release whose world
 * versioning was completely dead behind 474 green tests, and a bundled runtime the packaged
 * app could not find because one end of the wiring was never written.
 *
 * So these assertions read the real source of the shell and the bridge.
 *
 * They anchor to a LINE rather than to a substring, deliberately. A wiring call almost never
 * dies by being deleted - it dies by someone putting `//` in front of it while debugging and
 * not putting it back, and a substring search sails straight past a commented-out call
 * because the substring is still right there in the file.
 */

const mainIndex = fileURLToPath(new URL("../index.ts", import.meta.url));
const preloadIndex = fileURLToPath(new URL("../../preload/index.ts", import.meta.url));

async function read(path: string): Promise<string> {
    // Normalised, because a source file checked out with CRLF makes every multi-line or
    // line-anchored pattern below quietly match nothing - and a guard that matches nothing
    // reports clean forever while the thing it guards walks past it.
    return (await readFile(path, "utf8")).replace(/\r\n/g, "\n");
}

describe("the main process really registers the server handlers", () => {
    it("imports the registration factory", async () => {
        const source = await read(mainIndex);
        expect(source).toMatch(/^import \{[^}]*registerMcServerHandlers[^}]*\} from "\.\/mcserver\/ipc\.js";$/m);
    });

    it("calls it, on a line of its own that is not commented out", async () => {
        const source = await read(mainIndex);
        expect(source).toMatch(/^\s*mcServerIpc = registerMcServerHandlers\(ipcMain, \{/m);
    });

    it("disposes it when the app quits", async () => {
        const source = await read(mainIndex);
        // A handler left registered across a quit is a handler the next window inherits
        // pointing at a stale data folder.
        expect(source).toMatch(/^\s*app\.on\("will-quit", \(\) => mcServerIpc\?\.dispose\(\)\);$/m);
    });
});

describe("the preload bridge really exposes every channel", () => {
    it("declares an mcserver namespace on the bridge type", async () => {
        const source = await read(preloadIndex);
        expect(source).toMatch(/^\s*mcserver: \{$/m);
    });

    it("wires each channel the main process registers", async () => {
        const source = await read(preloadIndex);
        // The list is derived from the channel map rather than retyped, so a channel added
        // to one side and forgotten on the other fails here instead of at runtime as a
        // control that does nothing.
        for (const channel of Object.values(MCSERVER_CHANNELS)) {
            expect(source, `preload never invokes ${channel}`).toContain(`ipcRenderer.invoke("${channel}"`);
        }
    });

    it("exposes at least as many invocations as there are channels", async () => {
        const source = await read(preloadIndex);
        const invocations = source.match(/ipcRenderer\.invoke\("mcserver:/g) ?? [];
        expect(invocations.length).toBeGreaterThanOrEqual(Object.values(MCSERVER_CHANNELS).length);
    });
});

describe("the channel map itself stays honest", () => {
    it("names every channel under one prefix", () => {
        for (const channel of Object.values(MCSERVER_CHANNELS)) {
            expect(channel.startsWith("mcserver:")).toBe(true);
        }
    });

    it("has no duplicate channel names", () => {
        const values = Object.values(MCSERVER_CHANNELS);
        // Two keys sharing a channel means one handler silently replaces the other, and the
        // loser's feature is dead with nothing to show for it.
        expect(new Set(values).size).toBe(values.length);
    });
});
