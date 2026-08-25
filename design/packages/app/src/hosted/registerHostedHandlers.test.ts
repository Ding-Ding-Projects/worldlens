/**
 * Registers the real feature modules against the headless shim.
 *
 * This is the test that makes the cast in `registerHostedHandlers.ts` safe. Everything else
 * about the hosted route can be checked with fakes; this one deliberately uses the actual
 * modules, because the claim being checked is precisely that they run with no Electron
 * present. A module that started importing Electron at run time would fail here, at a
 * comprehensible moment, rather than inside somebody's container.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HostedIpcMain } from "./ipcMainLike.js";
import { MountRoots } from "./mountRoots.js";
import { registerHostedHandlers } from "./registerHostedHandlers.js";
import { channelPolicy } from "./capabilityProfile.js";

let dataDirectory = "";

beforeEach(() => {
    dataDirectory = mkdtempSync(join(tmpdir(), "worldlens-hosted-data-"));
});

afterEach(() => {
    rmSync(dataDirectory, { recursive: true, force: true });
});

function wire(): HostedIpcMain {
    const ipcMain = new HostedIpcMain();
    registerHostedHandlers(
        { ipcMain, mounts: new MountRoots([]) },
        { dataDirectory },
    );
    return ipcMain;
}

describe("the desktop's feature modules, running with no Electron", () => {
    it("registers without throwing", () => {
        // The blunt one, and the one that would have caught the whole idea being wrong: if
        // any of these modules touched Electron at import or registration time, this line
        // would throw rather than the failure appearing at first use.
        expect(() => wire()).not.toThrow();
    });

    it("registers a real set of channels rather than quietly registering none", () => {
        const channels = wire().registeredChannels();

        expect(channels.length).toBeGreaterThan(15);
        expect(channels).toContain("app:version");
        expect(channels).toContain("history:status");
        expect(channels).toContain("world:folders");
    });

    it("answers a channel end to end, through the shim, with no Electron in sight", async () => {
        const ipcMain = wire();

        await expect(ipcMain.invoke("app:version", [])).resolves.toBeTypeOf("string");
    });

    it("runs a module that touches the filesystem", async () => {
        // `history:status` reads a real directory beside the data folder. It is here because
        // a module that merely registers proves less than one that actually does its work.
        const ipcMain = wire();

        await expect(ipcMain.invoke("history:status", [dataDirectory])).resolves.toBeDefined();
    });

    it("registers only channels this deployment is permitted to answer", () => {
        // The wiring must never reach past the policy. If it did, the boundary would depend
        // on the order the two files happened to be edited in.
        for (const channel of wire().registeredChannels()) {
            const policy = channelPolicy(channel);
            expect(policy.kind, `${channel} is wired but ${policy.kind} by policy`).not.toBe(
                "refused",
            );
        }
    });

    it("leaves a permitted-but-unwired channel honestly unanswered", async () => {
        // The gap between "may answer" and "does answer" is deliberately visible. Narrowing
        // the profile to whatever happens to be wired would hide it; this reports it.
        const ipcMain = wire();

        await expect(ipcMain.invoke("render:start", [])).rejects.toThrow(/No handler is registered/);
    });
});
