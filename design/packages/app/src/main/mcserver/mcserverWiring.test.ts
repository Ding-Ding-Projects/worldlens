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
import { BRIDGE_CHANNELS } from "@worldlens/bridge";

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

    it("has every channel the main process registers in the shared bridge inventory", () => {
        // The preload used to write one ipcRenderer.invoke("mcserver:…") per channel, and this
        // check read the file for those literals. It does not any more: the bridge is built by
        // createWorldlensBridge(electronTransport), which forwards every channel through one
        // invoke, so there is exactly one ipcRenderer.invoke in the whole preload and the old
        // assertion could only fail. What decides whether a channel is reachable now is whether
        // it is in BRIDGE_CHANNELS, so that is what this asks.
        for (const channel of Object.values(MCSERVER_CHANNELS)) {
            expect(
                BRIDGE_CHANNELS,
                `${channel} is registered in the main process but is not in BRIDGE_CHANNELS, ` +
                    "so the generic bridge will refuse it and the surface behind it cannot be reached",
            ).toContain(channel);
        }
    });

    it("builds the bridge through the shared factory rather than hand-written invokes", async () => {
        // The guard above is only meaningful while this is true. If the preload goes back to
        // writing its own per-channel invokes, membership of BRIDGE_CHANNELS stops being what
        // makes a channel reachable and this file needs rewriting again.
        const source = await read(preloadIndex);
        expect(source).toContain("createWorldlensBridge");
        expect(source).toContain("invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args)");
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
