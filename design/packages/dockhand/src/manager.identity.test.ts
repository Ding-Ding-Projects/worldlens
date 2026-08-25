/**
 * The ownership boundary between two applications sharing one Docker host.
 *
 * The manager only ever lists, stops or removes containers carrying its own labels. That is
 * what makes it safe to run two of these against the same daemon - and it is entirely
 * dependent on the two of them disagreeing about which labels are theirs.
 *
 * The failure this guards is quiet and expensive. If the desktop application's namespace ever
 * changed, every container it has already created would disappear from its own listing while
 * carrying on running: not stopped, not cleaned up, just invisible. The next instance it
 * created could then collide with that orphan over a port or a volume name, and the error
 * would be about the port.
 */
import { describe, expect, it } from "vitest";
import {
    DockerHostingManager,
    WORLDLENS_IDENTITY,
    managerLabels,
    type CommandOutput,
} from "./index.js";

/** Records every argv the manager builds, and answers everything plausibly. */
function recording(): { runner: (c: string, a: readonly string[]) => Promise<CommandOutput>; calls: string[][] } {
    const calls: string[][] = [];
    return {
        calls,
        runner: (_command, args) => {
            calls.push([...args]);
            return Promise.resolve({
                ok: true,
                exitCode: 0,
                stdout: "",
                stderr: "",
                spawnError: null,
            });
        },
    };
}

describe("the desktop application's own namespace", () => {
    it("is exactly these two strings, and changing either orphans running containers", () => {
        // Spelled out rather than derived. A test that read the value from the same constant
        // it is checking would pass whatever that constant became, which is the one thing it
        // must not do.
        expect(WORLDLENS_IDENTITY.labelNamespace).toBe("com.worldlens");
        expect(WORLDLENS_IDENTITY.ownerPrefix).toBe("worldlens");
    });

    it("produces exactly the five labels containers are already carrying", () => {
        expect(managerLabels(WORLDLENS_IDENTITY)).toEqual({
            hosting: "com.worldlens.docker-hosting",
            instance: "com.worldlens.docker-instance",
            name: "com.worldlens.docker-name",
            version: "com.worldlens.docker-version",
            owner: "com.worldlens.docker-owner",
            fingerprint: "com.worldlens.fingerprint",
        });
    });

    it("is what a manager uses when none is given, so the desktop keeps its containers", async () => {
        const { runner, calls } = recording();
        const manager = new DockerHostingManager({
            runner,
            probe: () =>
                Promise.resolve({ status: "available", version: "27", detail: null } as never),
        });

        await manager.list();

        // The listing filter is the boundary: get it wrong and the application either sees
        // nothing of its own or sees somebody else's.
        const listed = calls.find((args) => args[0] === "ps");
        expect(listed?.join(" ")).toContain("com.worldlens.docker-hosting=true");
    });
});

describe("a second application on the same host", () => {
    it("labels its containers with its own namespace", async () => {
        const { runner, calls } = recording();
        const manager = new DockerHostingManager({
            runner,
            identity: { labelNamespace: "dev.wharf", ownerPrefix: "wharf" },
            probe: () =>
                Promise.resolve({ status: "available", version: "27", detail: null } as never),
        });

        await manager.create({
            id: "example",
            name: "example",
            image: `ghcr.io/example/thing@sha256:${"a".repeat(64)}`,
        });

        const created = calls.find((args) => args[0] === "create");
        expect(created?.join(" ")).toContain("dev.wharf.docker-hosting=true");
        expect(created?.join(" ")).not.toContain("com.worldlens");
    });

    it("cannot see the other application's containers", async () => {
        const { runner, calls } = recording();
        const manager = new DockerHostingManager({
            runner,
            identity: { labelNamespace: "dev.wharf", ownerPrefix: "wharf" },
            probe: () =>
                Promise.resolve({ status: "available", version: "27", detail: null } as never),
        });

        await manager.list();

        const listed = calls.find((args) => args[0] === "ps");
        expect(listed?.join(" ")).toContain("dev.wharf.docker-hosting=true");
        expect(listed?.join(" ")).not.toContain("com.worldlens");
    });

    it("accepts volume names under its own prefix and refuses the other's", async () => {
        const { runner } = recording();
        const manager = new DockerHostingManager({
            runner,
            identity: { labelNamespace: "dev.wharf", ownerPrefix: "wharf" },
            probe: () =>
                Promise.resolve({ status: "available", version: "27", detail: null } as never),
        });
        const image = `ghcr.io/example/thing@sha256:${"a".repeat(64)}`;

        const foreign = await manager.create({
            id: "example",
            name: "example",
            image,
            volumes: ["worldlens-data"],
        });

        expect(foreign.ok).toBe(false);
    });
});
