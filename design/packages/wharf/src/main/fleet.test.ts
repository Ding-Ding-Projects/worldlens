import { describe, expect, it } from "vitest";
import { Fleet, WHARF_IDENTITY, type Destination } from "./fleet.js";
import type { CommandOutput } from "@worldlens/dockhand";

function recording(answers: Record<string, Partial<CommandOutput>> = {}) {
    const calls: { command: string; args: string[] }[] = [];
    const runner = (command: string, args: readonly string[]): Promise<CommandOutput> => {
        calls.push({ command, args: [...args] });
        const line = `${command} ${args.join(" ")}`;
        for (const [pattern, answer] of Object.entries(answers))
            if (line.includes(pattern))
                return Promise.resolve({
                    ok: true,
                    exitCode: 0,
                    stdout: "",
                    stderr: "",
                    spawnError: null,
                    ...answer,
                });
        return Promise.resolve({
            ok: true,
            exitCode: 0,
            stdout: "",
            stderr: "",
            spawnError: null,
        });
    };
    return { runner, calls };
}

/**
 * A fleet whose local destination is POSIX regardless of where the suite runs.
 *
 * Without this the same assertions pass on a Linux runner and fail on a Windows developer
 * machine, because a local destination reports the platform it is actually on - which is
 * correct behaviour and useless to assert against.
 */
const fleet = (answers?: Record<string, Partial<CommandOutput>>) => {
    const { runner, calls } = recording(answers);
    return {
        calls,
        fleet: new Fleet({
            recordFile: "/tmp/wharf-records.json",
            knownHostsFile: "/tmp/known_hosts",
            localHostKind: "posix",
            runner,
        }),
    };
};

const LOCAL: Destination = { kind: "local" };
const PINNED = `ghcr.io/example/thing@sha256:${"a".repeat(64)}`;

describe("who these containers belong to", () => {
    it("is Wharf, and never the desktop application", () => {
        // Sharing the namespace would mean each application listing the other's containers,
        // offering to stop them, and being right to by its own labels.
        expect(WHARF_IDENTITY.labelNamespace).toBe("dev.wharf");
        expect(WHARF_IDENTITY.ownerPrefix).toBe("wharf");
        expect(WHARF_IDENTITY.labelNamespace).not.toContain("worldlens");
    });
});

describe("showing what a deployment would do before doing it", () => {
    it("names the destination, the image and each port's real reach", async () => {
        const plan = await fleet().fleet.plan(LOCAL, {
            id: "thing",
            name: "thing",
            image: PINNED,
            ports: [{ port: 8080, bindMode: "public" }, { port: 9000 }],
        });

        expect(plan.destination).toBe("this computer");
        expect(plan.ports[0]).toContain("reachable from other machines");
        expect(plan.ports[1]).toContain("this machine only");
    });

    it("refuses a floating tag, and says why it matters", async () => {
        // Not a style rule. A tag can be moved under you, so what was deployed and what was
        // reviewed need not be the same thing.
        const plan = await fleet().fleet.plan(LOCAL, {
            id: "thing",
            name: "thing",
            image: "ghcr.io/example/thing:latest",
        });

        expect(plan.refusals.join(" ")).toContain("moved under you");
    });

    it("refuses a folder that would hand over the whole machine", async () => {
        const plan = await fleet().fleet.plan(LOCAL, {
            id: "thing",
            name: "thing",
            image: PINNED,
            mainFolder: { hostPath: "/", containerPath: "/data", writable: true },
        });

        expect(plan.refusals).not.toEqual([]);
    });

    it("refuses mounting over the image's own directories", async () => {
        const plan = await fleet().fleet.plan(LOCAL, {
            id: "thing",
            name: "thing",
            image: PINNED,
            mainFolder: { hostPath: "/srv/data", containerPath: "/usr", writable: true },
        });

        expect(plan.refusals.join(" ")).toContain("image's own files");
    });

    it("collects every problem rather than stopping at the first", async () => {
        // Stopping at the first turns one mistake into three round trips for somebody
        // correcting a form.
        const plan = await fleet().fleet.plan(LOCAL, {
            id: "thing",
            name: "thing",
            image: "ghcr.io/example/thing:latest",
            mainFolder: { hostPath: "/etc", containerPath: "/data", writable: true },
        });

        expect(plan.refusals.length).toBeGreaterThan(1);
    });

    it("describes an accepted folder with both sides and its access", async () => {
        const plan = await fleet().fleet.plan(LOCAL, {
            id: "thing",
            name: "thing",
            image: PINNED,
            mainFolder: { hostPath: "/srv/data", containerPath: "/data", writable: false },
        });

        expect(plan.refusals).toEqual([]);
        expect(plan.folder).toContain("/srv/data");
        expect(plan.folder).toContain("/data");
        expect(plan.folder).toContain("read-only");
    });
});

describe("deploying", () => {
    it("re-checks the plan rather than trusting the caller's", async () => {
        // A caller that showed one plan and then sent a different request would otherwise
        // deploy the second under the first's confirmation.
        const answer = await fleet().fleet.deploy(LOCAL, {
            id: "thing",
            name: "thing",
            image: "ghcr.io/example/thing:latest",
        });

        expect(answer.ok).toBe(false);
    });

    it("never reaches Docker for a refused deployment", async () => {
        const { fleet: sut, calls } = fleet();

        await sut.deploy(LOCAL, {
            id: "thing",
            name: "thing",
            image: "ghcr.io/example/thing:latest",
        });

        expect(calls.some((call) => call.args.includes("create"))).toBe(false);
    });

    it("produces read-only mount arguments for a read-only folder", () => {
        expect(
            Fleet.mountArguments({
                id: "thing",
                name: "thing",
                image: PINNED,
                mainFolder: { hostPath: "/srv/data", containerPath: "/data", writable: false },
            }),
        ).toEqual(["-v", "/srv/data:/data:ro"]);
    });

    it("produces no mount arguments when no folder was chosen", () => {
        expect(Fleet.mountArguments({ id: "t", name: "t", image: PINNED })).toEqual([]);
    });
});

describe("checking a deployment is actually answering", () => {
    it("asks the destination itself rather than trusting docker run's exit code", async () => {
        // `docker run` exiting 0 means the container was created, not that anything inside it
        // is listening. That gap is the difference between "deployed" and "working".
        const { fleet: sut, calls } = fleet();

        await sut.verifyPort(LOCAL, 8080);

        // On POSIX the port is in the command line; the assertion is that something was
        // actually asked, on the destination, about that specific port.
        expect(calls.some((call) => `${call.command} ${call.args.join(" ")}`.includes("8080"))).toBe(
            true,
        );
    });
});
