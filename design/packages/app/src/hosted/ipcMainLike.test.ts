import { describe, expect, it, vi } from "vitest";
import { DuplicateChannelError, HostedIpcMain, UnknownChannelError } from "./ipcMainLike.js";

describe("the headless ipcMain", () => {
    it("answers a registered channel with its handler's value", async () => {
        const ipc = new HostedIpcMain();
        ipc.handle("world:inspect", (_event, folder) => ({ folder }));

        await expect(ipc.invoke("world:inspect", ["/data/worlds/one"])).resolves.toEqual({
            folder: "/data/worlds/one",
        });
    });

    it("rejects an unknown channel rather than resolving undefined", async () => {
        // Resolving would be worse than throwing: the renderer treats a resolved value as an
        // answer, so an unrouted channel would read as "this returned nothing" rather than
        // "nothing is listening", and the difference is the whole diagnosis.
        const ipc = new HostedIpcMain();

        await expect(ipc.invoke("nobody:home", [])).rejects.toBeInstanceOf(UnknownChannelError);
    });

    it("rejects a rejected handler rather than swallowing it", async () => {
        const ipc = new HostedIpcMain();
        ipc.handle("render:start", () => Promise.reject(new Error("no world mounted")));

        await expect(ipc.invoke("render:start", [])).rejects.toThrow("no world mounted");
    });

    it("refuses a duplicate registration instead of silently shadowing the first", () => {
        // Electron replaces it quietly. Here that would show up much later as a handler with
        // the wrong options closed over it, which is a miserable thing to diagnose.
        const ipc = new HostedIpcMain();
        ipc.handle("config:readFolder", () => 1);

        expect(() => ipc.handle("config:readFolder", () => 2)).toThrow(DuplicateChannelError);
    });

    it("lets a channel be re-registered after it is removed", () => {
        const ipc = new HostedIpcMain();
        ipc.handle("config:readFolder", () => 1);
        ipc.removeHandler("config:readFolder");

        expect(() => ipc.handle("config:readFolder", () => 2)).not.toThrow();
    });

    it("reads a synchronous channel through its returnValue, as Electron does", () => {
        const ipc = new HostedIpcMain();
        ipc.on("locks:dataFolder", (event) => {
            event.returnValue = "/data/locks";
        });

        expect(ipc.sendSync("locks:dataFolder", [])).toBe("/data/locks");
    });

    it("throws on an unregistered synchronous channel, which the one caller already catches", () => {
        const ipc = new HostedIpcMain();

        expect(() => ipc.sendSync("locks:dataFolder", [])).toThrow(UnknownChannelError);
    });

    it("fans a module's push event out to every subscriber", () => {
        const ipc = new HostedIpcMain();
        const first = vi.fn();
        const second = vi.fn();
        ipc.onBroadcast(first);
        ipc.onBroadcast(second);

        ipc.broadcaster("render:event")({ phase: "started" });

        expect(first).toHaveBeenCalledWith("render:event", { phase: "started" });
        expect(second).toHaveBeenCalledWith("render:event", { phase: "started" });
    });

    it("survives a subscriber that unsubscribes itself while being notified", () => {
        // Without copying the list first this skips the next subscriber, and it does so only
        // when a listener happens to unsubscribe from inside its own callback - which is
        // exactly what a component unmounting in response to an event does.
        const ipc = new HostedIpcMain();
        const seen: string[] = [];
        const stopFirst = ipc.onBroadcast(() => {
            seen.push("first");
            stopFirst();
        });
        ipc.onBroadcast(() => seen.push("second"));

        ipc.broadcaster("render:event")(null);

        expect(seen).toEqual(["first", "second"]);
    });

    it("stops delivering to a listener that unsubscribed", () => {
        const ipc = new HostedIpcMain();
        const listener = vi.fn();
        const stop = ipc.onBroadcast(listener);
        stop();

        ipc.broadcaster("render:event")(null);

        expect(listener).not.toHaveBeenCalled();
    });

    it("reports exactly the channels that would answer", () => {
        const ipc = new HostedIpcMain();
        ipc.handle("app:version", () => "1.0.0");
        ipc.on("locks:dataFolder", () => undefined);

        expect(ipc.registeredChannels()).toEqual(["app:version", "locks:dataFolder"]);
    });
});
