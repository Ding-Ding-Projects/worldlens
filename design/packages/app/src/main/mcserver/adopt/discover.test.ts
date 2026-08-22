import { describe, expect, it } from "vitest";

import type { CommandOutput, CommandRunner } from "../../runtime/command.js";
import { discoverAdoptionCandidates, scoreCandidate } from "./discover.js";

function out(overrides: Partial<CommandOutput> = {}): CommandOutput {
    return { ok: true, exitCode: 0, stdout: "", stderr: "", spawnError: null, ...overrides };
}

const PAPER_INSPECT = [
    {
        Id: "abc123",
        Name: "/survival",
        Image: "sha256:deadbeef",
        State: { Status: "running" },
        Config: {
            Image: "itzg/minecraft-server:latest",
            Env: ["TYPE=PAPER", "VERSION=1.21.4", "EULA=TRUE"],
            Cmd: ["java", "-jar", "paper.jar"],
            Labels: {},
        },
        Mounts: [{ Source: "/host/mc/survival", Destination: "/data" }],
        NetworkSettings: { Ports: { "25565/tcp": [{ HostPort: "25565" }] } },
        HostConfig: { Privileged: false, PidMode: "", NetworkMode: "bridge", Binds: [] },
    },
];

const PRIVILEGED_INSPECT = [
    {
        Id: "danger1",
        Name: "/danger",
        Image: "sha256:aaa",
        State: { Status: "running" },
        Config: { Image: "some/image", Env: [], Cmd: [], Labels: {} },
        Mounts: [{ Source: "/", Destination: "/host" }],
        NetworkSettings: { Ports: {} },
        HostConfig: { Privileged: true, PidMode: "host", NetworkMode: "host", Binds: [] },
    },
];

describe("scoreCandidate", () => {
    it("scores a clearly-Paper container as high confidence with evidence", () => {
        const candidate = scoreCandidate(PAPER_INSPECT[0] as never, "This server is running Paper version 1.21.4\nPreparing level \"world\"", "owner-a");
        expect(candidate.detected.flavour).toBe("paper");
        expect(candidate.detected.minecraftVersion).toBe("1.21.4");
        expect(candidate.detected.confidence).toBe("high");
        expect(candidate.evidence.length).toBeGreaterThanOrEqual(3);
        expect(candidate.blockers).toEqual([]);
    });

    it("flags a privileged, host-namespace, root-mounted container with blockers", () => {
        const candidate = scoreCandidate(PRIVILEGED_INSPECT[0] as never, "", "owner-a");
        expect(candidate.blockers.some((b) => b.includes("privileged"))).toBe(true);
        expect(candidate.blockers.some((b) => b.includes("process namespace"))).toBe(true);
        expect(candidate.blockers.some((b) => b.includes("network namespace"))).toBe(true);
        expect(candidate.blockers.some((b) => b.includes("root filesystem"))).toBe(true);
    });

    it("gives low confidence with a blocker when only the weakest signal (image name) fired", () => {
        const inspect = {
            Id: "weak1",
            Name: "/mystery",
            Image: "sha256:xyz",
            State: { Status: "exited" },
            Config: { Image: "someone/minecraft-thing", Env: [], Cmd: [], Labels: {} },
            Mounts: [],
            NetworkSettings: { Ports: {} },
            HostConfig: { Privileged: false, PidMode: "", NetworkMode: "bridge", Binds: [] },
        };
        const candidate = scoreCandidate(inspect as never, "", "owner-a");
        expect(candidate.detected.confidence).toBe("low");
        expect(candidate.blockers.some((b) => b.includes("Not enough evidence"))).toBe(true);
    });

    it("flags a container already owned by a different installation", () => {
        const inspect = {
            Id: "owned1",
            Name: "/owned",
            Image: "sha256:xyz",
            State: { Status: "running" },
            Config: {
                Image: "itzg/minecraft-server",
                Env: [],
                Cmd: [],
                Labels: { "com.worldlens.docker-hosting": "true", "com.worldlens.docker-owner": "someone-else" },
            },
            Mounts: [],
            NetworkSettings: { Ports: {} },
            HostConfig: { Privileged: false, PidMode: "", NetworkMode: "bridge", Binds: [] },
        };
        const candidate = scoreCandidate(inspect as never, "", "owner-a");
        expect(candidate.existingOwner).toBe("someone-else");
        expect(candidate.blockers.some((b) => b.includes("different WorldLens installation"))).toBe(true);
    });
});

describe("discoverAdoptionCandidates", () => {
    it("is entirely read-only: never issues a mutating docker verb", async () => {
        const seen: string[][] = [];
        const runner: CommandRunner = async (command, args) => {
            seen.push([command, ...args]);
            if (args[0] === "ps") {
                return out({ stdout: `${JSON.stringify({ ID: "abc123" })}\n` });
            }
            if (args[0] === "inspect") {
                return out({ stdout: JSON.stringify(PAPER_INSPECT) });
            }
            if (args[0] === "logs") {
                return out({ stdout: "This server is running Paper version 1.21.4" });
            }
            return out();
        };

        const result = await discoverAdoptionCandidates({ runner, docker: "docker" });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value).toHaveLength(1);
        expect(result.value[0]?.detected.flavour).toBe("paper");

        const READ_ONLY_VERBS = new Set(["ps", "inspect", "logs"]);
        for (const call of seen) {
            expect(READ_ONLY_VERBS.has(call[1] ?? "")).toBe(true);
        }
        // Never a lifecycle or mutating verb.
        const MUTATING_VERBS = ["start", "stop", "restart", "rm", "kill", "pause", "unpause", "create", "run", "exec"];
        for (const call of seen) {
            for (const verb of MUTATING_VERBS) {
                expect(call).not.toContain(verb);
            }
        }
    });

    it("reports unreachable when docker ps itself fails", async () => {
        const runner: CommandRunner = async () => out({ ok: false, exitCode: 1, stderr: "docker: not found", spawnError: "ENOENT" });
        const result = await discoverAdoptionCandidates({ runner });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("unreachable");
    });

    it("skips a container that vanishes between ps and inspect, without failing the whole scan", async () => {
        const runner: CommandRunner = async (_command, args) => {
            if (args[0] === "ps") return out({ stdout: `${JSON.stringify({ ID: "gone" })}\n` });
            if (args[0] === "inspect") return out({ ok: false, exitCode: 1, stderr: "No such object: gone" });
            return out();
        };
        const result = await discoverAdoptionCandidates({ runner });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value).toEqual([]);
    });
});
