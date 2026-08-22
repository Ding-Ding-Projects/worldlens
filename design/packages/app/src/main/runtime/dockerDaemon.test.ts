import { describe, expect, it } from "vitest";

import { startDockerDaemon, windowsCandidates } from "./dockerDaemon.js";
import type { DockerReport } from "./docker.js";

function report(status: DockerReport["status"], message = ""): DockerReport {
    return { status, clientVersion: null, serverVersion: status === "available" ? "29.6.1" : null, message, detail: null };
}

/** A probe that answers from a script, so a test can make the engine come up on cue. */
function scripted(...answers: readonly DockerReport["status"][]): () => Promise<DockerReport> {
    let index = 0;
    return async () => {
        const status = answers[Math.min(index, answers.length - 1)];
        index += 1;
        return report(status ?? "daemon-unreachable");
    };
}

const never = async (): Promise<void> => {};

describe("starting Docker's engine", () => {
    it("does nothing when the engine is already running", async () => {
        const launched: string[] = [];
        const result = await startDockerDaemon({
            platform: "win32",
            probe: scripted("available"),
            launch: (command) => launched.push(command),
            wait: never,
        });

        expect(result.outcome).toBe("already-running");
        // Launching Docker Desktop again when it is already up is at best a wasted minute
        // and at worst a second instance fighting the first.
        expect(launched).toHaveLength(0);
    });

    it("refuses to offer a start for a Docker that is not installed", async () => {
        const launched: string[] = [];
        const result = await startDockerDaemon({
            platform: "win32",
            probe: scripted("not-installed"),
            launch: (command) => launched.push(command),
            wait: never,
        });

        // A button that could never work is the decorative control this codebase forbids.
        // Not installed needs a download, which is a different action entirely.
        expect(result.outcome).toBe("unsupported");
        expect(launched).toHaveLength(0);
    });

    it("launches Docker Desktop and waits for the engine to actually answer", async () => {
        const launched: string[] = [];
        const result = await startDockerDaemon({
            platform: "win32",
            env: { ProgramFiles: "C:/Program Files" },
            exists: async () => true,
            // Down, down, then up: the engine takes a while after the process exists.
            probe: scripted("daemon-unreachable", "daemon-unreachable", "daemon-unreachable", "available"),
            launch: (command) => launched.push(command),
            wait: never,
            pollIntervalMs: 10,
            timeoutMs: 1_000,
        });

        expect(result.outcome).toBe("started");
        expect(launched[0]).toContain("Docker Desktop.exe");
    });

    it("reports a slow start as still coming up, not as a failure", async () => {
        const result = await startDockerDaemon({
            platform: "win32",
            env: { ProgramFiles: "C:/Program Files" },
            exists: async () => true,
            probe: scripted("daemon-unreachable"),
            launch: () => {},
            wait: never,
            pollIntervalMs: 10,
            timeoutMs: 30,
        });

        // Docker Desktop genuinely can take longer than any deadline worth waiting on a
        // cold machine. Calling that a failure would be contradicted by the next probe.
        expect(result.outcome).toBe("timed-out");
        expect(result.message).toContain("has not answered yet");
    });

    it("says so plainly when it cannot find Docker Desktop to launch", async () => {
        const result = await startDockerDaemon({
            platform: "win32",
            env: { ProgramFiles: "C:/Program Files" },
            exists: async () => false,
            probe: scripted("daemon-unreachable"),
            launch: () => {},
            wait: never,
        });

        expect(result.outcome).toBe("unsupported");
        // The reason names where it looked, because "could not find it" with no paths is
        // an answer nobody can act on.
        expect(result.detail).toContain("Docker");
    });

    it("refuses to escalate privileges on Linux, and names the command instead", async () => {
        const launched: string[] = [];
        const result = await startDockerDaemon({
            platform: "linux",
            probe: scripted("daemon-unreachable"),
            launch: (command) => launched.push(command),
            wait: never,
        });

        expect(result.outcome).toBe("unsupported");
        // Running sudo from a button, on somebody's behalf, is not a thing this app does.
        expect(launched).toHaveLength(0);
        expect(result.detail).toContain("systemctl");
    });

    it("opens the application bundle on macOS rather than executing it directly", async () => {
        const calls: { command: string; args: readonly string[] }[] = [];
        const result = await startDockerDaemon({
            platform: "darwin",
            exists: async () => true,
            probe: scripted("daemon-unreachable", "available"),
            launch: (command, args) => calls.push({ command, args }),
            wait: never,
            pollIntervalMs: 10,
            timeoutMs: 1_000,
        });

        expect(result.outcome).toBe("started");
        expect(calls[0]?.command).toBe("/usr/bin/open");
        expect(calls[0]?.args).toContain("-a");
    });

    it("reports a launch that threw, rather than pretending it worked", async () => {
        const result = await startDockerDaemon({
            platform: "win32",
            env: { ProgramFiles: "C:/Program Files" },
            exists: async () => true,
            probe: scripted("daemon-unreachable"),
            launch: () => {
                throw new Error("EPERM");
            },
            wait: never,
        });

        expect(result.outcome).toBe("failed");
        expect(result.detail).toContain("EPERM");
    });
});

describe("finding Docker Desktop on Windows", () => {
    it("reads the program folders from the environment rather than assuming C:", () => {
        const candidates = windowsCandidates({ ProgramFiles: "D:/Programs" });
        // Hard-coding C:\Program Files is wrong on a machine whose Windows lives elsewhere
        // or whose programs folder is localised.
        expect(candidates[0]).toContain("D:");
        expect(candidates[0]).toContain("Docker Desktop.exe");
    });

    it("offers nothing when the environment names no program folder at all", () => {
        expect(windowsCandidates({})).toEqual([]);
    });
});
