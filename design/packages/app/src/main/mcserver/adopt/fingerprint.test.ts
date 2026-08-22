import { describe, expect, it } from "vitest";

import type { CommandOutput, CommandRunner } from "../../runtime/command.js";
import { checkFingerprint, computeFingerprint, reverifyFingerprint } from "./fingerprint.js";

function out(overrides: Partial<CommandOutput> = {}): CommandOutput {
    return { ok: true, exitCode: 0, stdout: "", stderr: "", spawnError: null, ...overrides };
}

const BASE_INPUT = {
    containerId: "abc123",
    createdAt: "2026-01-01T00:00:00Z",
    imageDigest: "sha256:dededededededededededededededededededededededededededededededede",
    mountSources: ["/host/mc/b", "/host/mc/a"],
};

describe("computeFingerprint", () => {
    it("is stable regardless of mount source order", () => {
        const a = computeFingerprint(BASE_INPUT);
        const b = computeFingerprint({ ...BASE_INPUT, mountSources: ["/host/mc/a", "/host/mc/b"] });
        expect(a).toBe(b);
    });

    it("changes when the container id changes", () => {
        const a = computeFingerprint(BASE_INPUT);
        const b = computeFingerprint({ ...BASE_INPUT, containerId: "different" });
        expect(a).not.toBe(b);
    });

    it("changes when a different container reuses the same name/mounts but a new id and createdAt", () => {
        const original = computeFingerprint(BASE_INPUT);
        const recreated = computeFingerprint({ ...BASE_INPUT, containerId: "xyz789", createdAt: "2026-06-01T00:00:00Z" });
        expect(original).not.toBe(recreated);
    });
});

describe("checkFingerprint", () => {
    it("matches when nothing has changed", () => {
        const expected = computeFingerprint(BASE_INPUT);
        expect(checkFingerprint(expected, BASE_INPUT).matches).toBe(true);
    });

    it("fails when the container was recreated under the same name", () => {
        const expected = computeFingerprint(BASE_INPUT);
        const check = checkFingerprint(expected, { ...BASE_INPUT, containerId: "recreated", createdAt: "2027-01-01T00:00:00Z" });
        expect(check.matches).toBe(false);
    });
});

describe("reverifyFingerprint", () => {
    it("re-derives the fingerprint from a live docker inspect and matches the stored one", async () => {
        const expected = computeFingerprint(BASE_INPUT);
        const runner: CommandRunner = async () =>
            out({
                stdout: JSON.stringify([
                    {
                        Id: BASE_INPUT.containerId,
                        Created: BASE_INPUT.createdAt,
                        Image: BASE_INPUT.imageDigest,
                        Mounts: [{ Source: "/host/mc/a" }, { Source: "/host/mc/b" }],
                    },
                ]),
            });
        const result = await reverifyFingerprint(runner, "docker", BASE_INPUT.containerId, expected);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value.matches).toBe(true);
    });

    it("drops back to a mismatch when the container has been recreated", async () => {
        const expected = computeFingerprint(BASE_INPUT);
        const runner: CommandRunner = async () =>
            out({
                stdout: JSON.stringify([
                    {
                        Id: "brand-new-id",
                        Created: "2099-01-01T00:00:00Z",
                        Image: BASE_INPUT.imageDigest,
                        Mounts: [{ Source: "/host/mc/a" }, { Source: "/host/mc/b" }],
                    },
                ]),
            });
        const result = await reverifyFingerprint(runner, "docker", BASE_INPUT.containerId, expected);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value.matches).toBe(false);
    });

    it("answers not-found when the container is gone", async () => {
        const runner: CommandRunner = async () => out({ ok: false, exitCode: 1, stderr: "No such object" });
        const result = await reverifyFingerprint(runner, "docker", "abc123", "whatever");
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.code).toBe("not-found");
    });
});
