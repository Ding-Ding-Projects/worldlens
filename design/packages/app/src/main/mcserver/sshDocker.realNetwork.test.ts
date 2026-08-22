/**
 * The proof every other test in this feature deliberately does not offer.
 *
 * Everything else here injects a `CommandRunner`, which is right: a unit test that needed a
 * Docker daemon, an SSH host and a Java runtime would be a test nobody runs. But it means
 * the whole feature has been verified against a function that answers the way `docker`
 * would, and never against `docker`. This file closes that gap, once, against a real host.
 *
 * It is opt-in through `WORLDLENS_SSH_DOCKER_HOST`, because it needs a machine on a
 * particular network with a key already trusted, and a test that fails on everybody else's
 * laptop is a test that gets deleted rather than fixed.
 *
 * ## It reads, and it does not write
 *
 * The host this was written against runs somebody's real workloads. So every assertion here
 * is a read: probe the daemon, list containers, ask the adoption layer what it makes of
 * them. Nothing is created, started, stopped, or written to - which is not merely polite,
 * it is the property adoption discovery actually claims, so exercising it read-only is
 * exercising the real contract rather than tiptoeing around it.
 *
 * Run it with:
 *   WORLDLENS_SSH_DOCKER_HOST=docker@192.168.50.232 pnpm vitest run sshDocker.realNetwork
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { execFileCommandRunner } from "../runtime/command.js";
import { probeDocker } from "../runtime/docker.js";
import { sshCommandRunner } from "../remote/ssh.js";
import { discoverAdoptionCandidates } from "./adopt/discover.js";

const TARGET = process.env.WORLDLENS_SSH_DOCKER_HOST ?? "";
const [USER = "", HOST = ""] = TARGET.split("@");
const ENABLED = USER !== "" && HOST !== "";

/**
 * The app's own trust store, seeded for this run only.
 *
 * `sshCommandRunner` requires a `knownHostsFile` and uses `StrictHostKeyChecking=yes`
 * against it, deliberately: it never appends to the person's own `~/.ssh/known_hosts`,
 * because an app that changes the machine's trust store has changed the trust of every
 * other program on it, including their `git push`.
 *
 * So a test has to supply one. This scans the host's key into a temporary file rather than
 * disabling the check, because a test that turns the security off has stopped testing the
 * thing that ships.
 */
function seedKnownHosts(): string {
    const dir = mkdtempSync(join(tmpdir(), "worldlens-ssh-proof-"));
    const file = join(dir, "known_hosts");
    const scanned = execFileSync("ssh-keyscan", ["-T", "10", "-p", "22", HOST], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
    });
    writeFileSync(file, scanned);
    return file;
}

const knownHostsFile = ENABLED ? seedKnownHosts() : "";

const runner = sshCommandRunner({
    runner: execFileCommandRunner,
    knownHostsFile,
    target: {
        id: "realNetwork",
        label: "real network test host",
        host: HOST,
        port: 22,
        user: USER,
        identityFile: null,
        workDir: "/tmp/worldlens-proof",
        image: "itzg/minecraft-server",
        docker: "docker",
        keepRemoteFiles: false,
    },
});

describe.skipIf(!ENABLED)("a real Docker daemon over a real SSH connection", () => {
    it("answers a version probe through the same code the local daemon uses", async () => {
        // The whole architectural claim in one assertion: `runtime/docker.ts` was written
        // for a local daemon and is being pointed at one in another room, unchanged, purely
        // by handing it a different runner.
        const report = await probeDocker({ runner });

        // "available" is what a healthy daemon reports - there is no "ready" in
        // DockerStatus, and asserting one was this test being wrong rather than the probe.
        expect(report.status, `probe said: ${report.message}`).toBe("available");
        expect(report.serverVersion, "a ready daemon must name its version").toBeTruthy();
    }, 60_000);

    it("finds candidates without starting, stopping or writing anything", async () => {
        const calls: { command: string; args: readonly string[] }[] = [];
        const watched = async (command: string, args: readonly string[], options?: Parameters<typeof runner>[2]) => {
            calls.push({ command, args });
            return runner(command, args, options);
        };

        const answer = await discoverAdoptionCandidates({ runner: watched, docker: "docker" });
        expect(answer.ok, answer.ok ? "" : `discovery failed: ${answer.failure.message}`).toBe(true);

        // Every docker verb it used must be a read. This is the guarantee adoption makes,
        // and here it is checked against what actually went down the wire rather than
        // against a fake that could only ever have replayed what it was told.
        const READ_ONLY = new Set(["ps", "inspect", "logs", "version"]);
        for (const call of calls) {
            const verb = call.args.find((arg) => !arg.startsWith("-"));
            expect(READ_ONLY.has(verb ?? ""), `discovery ran a non-read verb: ${verb}`).toBe(true);
        }
        expect(calls.length, "discovery should have asked the host something").toBeGreaterThan(0);
    }, 120_000);

    it("does not mistake somebody else's containers for Minecraft servers", async () => {
        const answer = await discoverAdoptionCandidates({ runner, docker: "docker" });
        expect(answer.ok).toBe(true);
        if (!answer.ok) return;

        // The host this was written against runs a status service, a CI runner and a web
        // app. None is a Minecraft server, and a discovery that confidently claimed
        // otherwise would be the failure mode that matters most: adoption acts on
        // confidence, so a false positive is how this app ends up writing into a database.
        for (const candidate of answer.value) {
            expect(
                candidate.detected.confidence,
                `${candidate.containerName} (${candidate.image}) was rated ` +
                    `${candidate.detected.confidence}; evidence: ` +
                    candidate.evidence.join(", "),
            ).not.toBe("high");
        }
    }, 120_000);
});

describe.skipIf(ENABLED)("the real-network proof", () => {
    it("is skipped, and says so rather than passing quietly", () => {
        // A suite that skips silently reads as a suite that passed. This one row exists so
        // that a run without the host is visibly a run without the host.
        expect(ENABLED).toBe(false);
    });
});
