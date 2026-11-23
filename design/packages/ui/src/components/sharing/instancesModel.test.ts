import { describe, expect, it, vi } from "vitest";
import { applianceRows, containerRows, liveRows, loadRows, runAction } from "./instancesModel.js";

/**
 * The instance list reads three registries with three shapes. These prove each shape turns
 * into the right row, that a route missing from the bridge simply contributes nothing, and
 * that every action is sent to the route that owns the row and nowhere else.
 */
describe("instancesModel", () => {
    const container = {
        instanceId: "c1",
        name: "example-map",
        targetLabel: "This PC",
        containerName: "worldlens-map-c1",
        volumeName: "worldlens-map-c1-data",
        link: "http://192.0.2.10:8100/",
        state: "running",
        detail: "healthy",
    };
    const appliance = {
        id: "a1",
        target: "virtualbox",
        name: "worldlens-example",
        hostName: "worldlens-map",
        folder: "C:/vms/worldlens-example",
        link: "http://192.0.2.41/",
        createdAt: "2026-11-23T19:51:00Z",
    };
    const live = {
        instance: {
            id: "l1",
            name: "lensbot",
            target: { kind: "local" },
            url: "http://192.0.2.10:3007/",
            containerName: "worldlens-live-l1",
            kind: "viewer",
            botName: "LensBot",
            serverLabel: "Survival server",
        },
        state: "running",
        botConnected: true,
    };

    it("turns each registry shape into a row with the actions it supports", () => {
        const [c] = containerRows([container]);
        expect(c).toMatchObject({ kind: "container", running: true, link: container.link });
        expect(c?.actions).toEqual(["start", "stop", "restart", "update", "remove"]);
        expect(c?.removes).toContain("worldlens-map-c1-data");

        const [a] = applianceRows([appliance]);
        expect(a).toMatchObject({
            kind: "appliance",
            running: null,
            where: "VirtualBox · worldlens-map",
        });
        expect(a?.actions).not.toContain("update");
        expect(a?.removes).toContain("C:/vms/worldlens-example");

        const [l] = liveRows({ ok: true, value: [live] });
        expect(l).toMatchObject({
            kind: "live",
            running: true,
            name: "lensbot",
            detail: "running · bot online",
        });
        expect(l?.where).toContain("LensBot on Survival server");
    });

    it("lists what each available route reports and skips routes the build lacks", async () => {
        const rows = await loadRows({
            shareHost: { list: async () => [container] } as never,
            appliance: { instances: async () => [appliance] } as never,
        });
        expect(rows.map((r) => r.key)).toEqual(["container:c1", "appliance:a1"]);
    });

    it("sends each action only to the route that owns the row", async () => {
        const stop = vi.fn(async () => ({ ok: true }));
        const control = vi.fn(async () => ({ ok: true }));
        const remove = vi.fn(async () => ({ ok: true }));
        const bridges = {
            shareHost: { list: async () => [], stop } as never,
            liveViewer: { list: async () => [], control, remove },
        };
        const [c] = containerRows([container]);
        const [l] = liveRows([live]);
        expect(await runAction(bridges, c!, "stop")).toEqual({ ok: true, message: "" });
        expect(stop).toHaveBeenCalledWith("c1");
        await runAction(bridges, l!, "restart");
        expect(control).toHaveBeenCalledWith({ id: "l1", action: "restart" });
        await runAction(bridges, l!, "remove");
        expect(remove).toHaveBeenCalledWith({ id: "l1", confirmName: "lensbot" });
        const [a] = applianceRows([appliance]);
        expect(await runAction(bridges, a!, "update")).toMatchObject({ ok: false });
    });
});

describe("WorldLens deployed as a container", () => {
    it("lists only hosted-image containers, with a local link, and stops through an authorization", async () => {
        const { appRows, linkFromPorts, runAction } = await import("./instancesModel.js");
        expect(linkFromPorts(["127.0.0.1:8110->8110/tcp"])).toBe("http://localhost:8110/");
        expect(linkFromPorts([])).toBe("");
        const snapshot = {
            containers: [
                {
                    id: "a1",
                    name: "WorldLens",
                    image: `ghcr.io/x/worldlens-hosted@sha256:${"f".repeat(64)}`,
                    status: "Up 2 minutes",
                    running: true,
                    ports: ["0.0.0.0:8110->8110/tcp"],
                },
                {
                    id: "b2",
                    name: "Map",
                    image: "ghcr.io/x/worldlens-map-server@sha256:1",
                    status: "Up",
                    running: true,
                    ports: [],
                },
            ],
        };
        const rows = appRows(snapshot);
        expect(rows.map((r) => r.id)).toEqual(["a1"]);
        expect(rows[0]).toMatchObject({
            kind: "app",
            link: "http://localhost:8110/",
            actions: ["start", "stop", "restart"],
        });
        const calls: unknown[] = [];
        const dockerHosting = {
            inspect: async () => ({ ok: true as const, snapshot: snapshot as never }),
            authorize: async () => ({ ok: true as const, token: "tok" }),
            mutate: async (request: unknown) => {
                calls.push(request);
                return { ok: true as const, snapshot: snapshot as never };
            },
        };
        expect(await runAction({ dockerHosting }, rows[0]!, "stop")).toEqual({
            ok: true,
            message: "",
        });
        expect(calls).toEqual([{ operation: "stop", containerId: "a1", authorization: "tok" }]);
        expect((await runAction({ dockerHosting }, rows[0]!, "remove")).ok).toBe(false);
    });
});
