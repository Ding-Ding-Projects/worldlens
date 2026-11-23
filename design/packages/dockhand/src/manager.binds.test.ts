/** Folder mounts and owned volumes at fixed places: what reaches `docker create`, and what never does. */
import { describe, expect, it } from "vitest";
import { DockerHostingManager, type CommandOutput, type CreateInstanceRequest } from "./index.js";

function setup() {
    const calls: string[][] = [];
    const runner = (_c: string, args: readonly string[]): Promise<CommandOutput> => {
        calls.push([...args]);
        // No volume exists yet, so `volume inspect` fails and the manager creates it.
        const missing = args[0] === "volume" && args[1] === "inspect";
        return Promise.resolve({
            ok: !missing,
            exitCode: missing ? 1 : 0,
            stdout: "",
            stderr: "",
            spawnError: null,
        });
    };
    const manager = new DockerHostingManager({
        runner,
        probe: () => Promise.resolve({ status: "available", version: "27", detail: null } as never),
    });
    return { manager, calls };
}

const base: CreateInstanceRequest = {
    id: "worldlens-app",
    name: "WorldLens",
    image: "ghcr.io/x/worldlens-hosted@sha256:" + "a".repeat(64),
};

describe("folder mounts", () => {
    it("passes chosen folders as bind mounts and owned volumes at fixed places", async () => {
        const { manager, calls } = setup();
        await manager.create({
            ...base,
            binds: [
                { source: "/home/me/worlds", target: "/data/worlds", readOnly: true },
                { source: "C:\\Users\\me\\renders", target: "/data/renders", readOnly: false },
            ],
            volumes: ["worldlens-app-state:/data/state"],
        });
        const create = calls.find((a) => a[0] === "create")!;
        expect(create).toContain("type=bind,source=/home/me/worlds,target=/data/worlds,readonly");
        expect(create).toContain("type=bind,source=C:\\Users\\me\\renders,target=/data/renders");
        expect(create).toContain("worldlens-app-state:/data/state");
        expect(
            calls.some(
                (a) => a[0] === "volume" && a[1] === "create" && a.includes("worldlens-app-state"),
            ),
        ).toBe(true);
    });

    it.each([
        [{ source: "relative/path", target: "/data/w", readOnly: true }],
        [{ source: "/a,readonly=false,source=/etc", target: "/data/w", readOnly: true }],
        [{ source: "/home/me/../../etc", target: "/data/w", readOnly: true }],
        [{ source: "/home/me", target: "/etc", readOnly: true }],
        [{ source: "/home/me", target: "/data/w/../../etc", readOnly: true }],
    ])("refuses %o", async (bind) => {
        const { manager, calls } = setup();
        const answer = await manager.create({ ...base, binds: [bind] });
        expect(answer.ok).toBe(false);
        expect(calls.some((a) => a[0] === "create")).toBe(false);
    });

    it("refuses two mounts at the same place and volumes it does not own", async () => {
        const { manager } = setup();
        expect(
            (
                await manager.create({
                    ...base,
                    binds: [{ source: "/a", target: "/data/x", readOnly: true }],
                    volumes: ["worldlens-v:/data/x"],
                })
            ).ok,
        ).toBe(false);
        expect((await manager.create({ ...base, volumes: ["other-v:/data/x"] })).ok).toBe(false);
        expect((await manager.create({ ...base, volumes: ["worldlens-v:/etc"] })).ok).toBe(false);
    });
});

describe("published ports", () => {
    it("accepts a port other machines can reach and refuses a bad one", async () => {
        const { manager, calls } = setup();
        await manager.create({ ...base, ports: [{ port: 8110, bindMode: "public" }] });
        expect(calls.find((a) => a[0] === "create")?.join(" ")).toContain("8110");
        const bad = await manager.create({ ...base, ports: [{ port: 70000, bindMode: "public" }] });
        expect(bad.ok).toBe(false);
    });
});
