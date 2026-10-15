import { describe, expect, it, vi, afterEach } from "vitest";
import { remoteCommandLine } from "../remote/ssh.js";
import type { CommandOutput, CommandRunner } from "../runtime/command.js";
import type { HostProfileRecord, HostProfileStore } from "./hostProfiles.js";
import { ok, fail } from "./transport/types.js";
import {
    parseSshProcessPreflightRequest,
    preflightSshProcessCreation,
    SSH_PREFLIGHT_TIMEOUT_MS,
} from "./sshProcessPreflight.js";

const request = { hostId: "fixture", minecraftVersion: "1.21.4", memoryMb: 2048, port: 25565 };
const output = (stdout = "", overrides: Partial<CommandOutput> = {}): CommandOutput => ({
    ok: true,
    exitCode: 0,
    stdout,
    stderr: "",
    spawnError: null,
    ...overrides,
});
const command = (name: string, ...args: string[]) => remoteCommandLine([name, ...args]);
const profile: HostProfileRecord = {
    hostId: "fixture",
    createdAt: "created",
    updatedAt: "updated",
    target: {
        id: "fixture",
        label: "Fixture",
        host: "fixture.example",
        port: 22,
        user: "fixture",
        identityFile: null,
        workDir: "/srv/servers",
        image: "unused",
        docker: "docker",
        keepRemoteFiles: false,
    },
};

function fixture(changes: Record<string, CommandOutput> = {}) {
    const answers: Record<string, CommandOutput> = {
        [command("printf", "%s", "worldlens-readiness-v1")]: output("worldlens-readiness-v1"),
        [command("uname", "-s")]: output("Linux\n"),
        [command("systemd-run", "--version")]: output("systemd 255 (255.4)\n"),
        [command("systemctl", "--user", "show", "--property=Version", "--value")]: output("255\n"),
        [command("loginctl", "show-user", "fixture", "--property=Linger", "--value")]:
            output("yes\n"),
        [command("printenv", "HOME")]: output("/home/fixture\n"),
        [command("readlink", "-e", "--", "/srv/servers")]: output("/srv/servers\n"),
        [command("test", "-d", "/srv/servers")]: output(),
        [command("test", "-w", "/srv/servers")]: output(),
        [command("test", "-x", "/srv/servers")]: output(),
        [command("sh", "-c", "command -v java")]: output("/usr/bin/java\n"),
        [command("readlink", "-e", "--", "/usr/bin/java")]: output("/opt/jdk/bin/java\n"),
        [command("/opt/jdk/bin/java", "-XX:-UsePerfData", "-version")]: output("", {
            stderr: 'openjdk version "21.0.6"\n',
        }),
        [command("cat", "/proc/meminfo")]: output(
            "MemTotal:       8388608 kB\nMemAvailable:   6291456 kB\n",
        ),
        [command("df", "-Pk", "--", "/srv/servers")]: output(
            "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/fixture 9000000 1000000 8000000 12% /srv\n",
        ),
        [command("ss", "-H", "-ltn", "sport = :25565")]: output(),
        ...changes,
    };
    const runner = vi.fn<CommandRunner>(async (binary, args, options) => {
        expect(binary).toBe("ssh");
        expect(args).toContain("BatchMode=yes");
        expect(args).toContain("StrictHostKeyChecking=yes");
        expect(args).toContain("PasswordAuthentication=no");
        expect(args).toContain("PreferredAuthentications=publickey");
        expect(args).toContain('UserKnownHostsFile="/fixture/known_hosts"');
        expect(args.at(-2)).toBe("fixture@fixture.example");
        expect(options?.timeoutMs).toBeGreaterThan(0);
        expect(options?.timeoutMs).toBeLessThanOrEqual(SSH_PREFLIGHT_TIMEOUT_MS);
        const answer = answers[args.at(-1)!];
        if (answer === undefined) throw new Error(`Unexpected command: ${args.at(-1)}`);
        return answer;
    });
    const hostProfiles: HostProfileStore = {
        get: vi.fn(async () => ok(structuredClone(profile))),
        list: vi.fn(async () => ok([profile])),
        save: vi.fn(async () => fail("denied", "No writes allowed")),
        forget: vi.fn(async () => fail("denied", "No writes allowed")),
        sshHost: vi.fn(() => ({ target: profile.target, knownHostsFile: "/fixture/known_hosts" })),
    };
    const readCatalogue = vi.fn(async () => ({
        fetchedAt: "2026-10-15T00:00:00Z",
        stale: false,
        completeness: "complete" as const,
        failures: [],
        flavours: [
            {
                flavour: "vanilla" as const,
                complete: true,
                versions: [
                    {
                        version: "1.21.4",
                        stability: "release" as const,
                        javaFeature: 21,
                        downloadUrl: null,
                        sha256: null,
                        releasedAt: null,
                    },
                ],
            },
        ],
    }));
    return { runner, hostProfiles, readCatalogue };
}
afterEach(() => vi.useRealTimers());

describe("read-only SSH-process readiness", () => {
    it("observes all eight stages without granting creation or changing host state", async () => {
        const deps = fixture();
        const result = await preflightSshProcessCreation(request, deps);
        expect(result).toMatchObject({
            ok: true,
            value: {
                ready: true,
                canCreate: false,
                javaFeature: 21,
                serverParent: "/srv/servers",
                availableMemoryMb: 6144,
                freeBytes: 8192000000,
            },
        });
        if (!result.ok) return;
        expect(result.value.checks.map((check) => check.stage)).toEqual([
            "ssh",
            "platform",
            "supervisor",
            "directory",
            "java",
            "memory",
            "disk",
            "port",
        ]);
        expect(deps.runner).toHaveBeenCalledTimes(16);
        expect(deps.hostProfiles.save).not.toHaveBeenCalled();
        expect(deps.hostProfiles.forget).not.toHaveBeenCalled();
        const scripts = deps.runner.mock.calls.map(([, args]) => args.at(-1)).join("\n");
        expect(scripts).not.toMatch(
            /mkdir|touch|curl|wget|start|stop|enable|set-linger|private_key|show-environment/,
        );
        expect(scripts).toContain("'systemd-run' '--version'");
    });

    it.each([
        null,
        [],
        {},
        { ...request, hostId: "-oProxyCommand=bad" },
        { ...request, memoryMb: NaN },
        { ...request, memoryMb: 511 },
        { ...request, memoryMb: 2048.1 },
        { ...request, port: 65536 },
        { ...request, port: 22 },
        { ...request, minecraftVersion: "1.21;echo bad" },
        { ...request, target: profile.target },
        { ...request, knownHostsFile: "/elsewhere" },
        { ...request, ownerId: "forged" },
    ])("rejects malformed or expanded requests before looking up a host: %j", async (input) => {
        const deps = fixture();
        expect((await preflightSshProcessCreation(input, deps)).ok).toBe(false);
        expect(deps.runner).not.toHaveBeenCalled();
        expect(deps.hostProfiles.get).not.toHaveBeenCalled();
    });

    it("does not guess a requirement for snapshots or unsupported historical versions", () => {
        expect(parseSshProcessPreflightRequest({ ...request, minecraftVersion: "25w01a" }).ok).toBe(
            false,
        );
        expect(parseSshProcessPreflightRequest({ ...request, minecraftVersion: "1.7.10" }).ok).toBe(
            false,
        );
    });
    it("rejects an unlisted future release before contacting the host", async () => {
        const deps = fixture();
        expect(
            await preflightSshProcessCreation({ ...request, minecraftVersion: "1.99.999" }, deps),
        ).toMatchObject({ ok: false, failure: { code: "unsupported" } });
        expect(deps.runner).not.toHaveBeenCalled();
    });
    it.each(["9".repeat(400), "21garbage", "21..5"])(
        "never accepts a malformed Java banner: %s",
        async (version) => {
            const deps = fixture({
                [command("/opt/jdk/bin/java", "-XX:-UsePerfData", "-version")]: output("", {
                    stderr: `openjdk version "${version}"`,
                }),
            });
            expect(await preflightSshProcessCreation(request, deps)).toMatchObject({
                ok: true,
                value: {
                    ready: false,
                    javaFeature: null,
                    checks: expect.arrayContaining([
                        { stage: "java", state: "unknown", code: "java-unrecognized" },
                    ]),
                },
            });
        },
    );

    it.each([
        ["REMOTE HOST IDENTIFICATION HAS CHANGED!", "host-key-changed"],
        ["Host key verification failed.", "host-key-unknown"],
        ["Permission denied (publickey).", "auth-refused"],
        ["Connection timed out", "unreachable"],
    ])("preserves SSH classification without exposing diagnostics: %s", async (stderr, code) => {
        const deps = fixture({
            [command("printf", "%s", "worldlens-readiness-v1")]: output("", {
                ok: false,
                exitCode: 255,
                stderr,
            }),
        });
        const result = await preflightSshProcessCreation(request, deps);
        expect(result).toMatchObject({
            ok: true,
            value: {
                ready: false,
                canCreate: false,
                checks: [{ stage: "ssh", state: "blocked", code }],
            },
        });
        expect(deps.runner).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(result)).not.toContain(stderr);
    });

    it.each([
        [command("uname", "-s"), output("Darwin\n"), "platform", "linux-required"],
        [
            command("systemd-run", "--version"),
            output("systemd 253\n"),
            "supervisor",
            "systemd-254-required",
        ],
        [
            command("systemctl", "--user", "show", "--property=Version", "--value"),
            output("", { ok: false, exitCode: 1 }),
            "supervisor",
            "user-manager-unavailable",
        ],
        [
            command("loginctl", "show-user", "fixture", "--property=Linger", "--value"),
            output("no\n"),
            "supervisor",
            "lingering-required",
        ],
        [
            command("readlink", "-e", "--", "/srv/servers"),
            output("/outside\n"),
            "directory",
            "existing-canonical-directory-required",
        ],
        [
            command("test", "-w", "/srv/servers"),
            output("", { ok: false, exitCode: 1 }),
            "directory",
            "writable-directory-required",
        ],
        [
            command("/opt/jdk/bin/java", "-XX:-UsePerfData", "-version"),
            output("", { stderr: 'openjdk version "17.0.1"' }),
            "java",
            "java-too-old",
        ],
        [
            command("cat", "/proc/meminfo"),
            output("MemAvailable: 2097152 kB\n"),
            "memory",
            "insufficient-memory",
        ],
        [
            command("df", "-Pk", "--", "/srv/servers"),
            output("header\n/dev/x 100 50 50 50% /\n"),
            "disk",
            "insufficient-disk",
        ],
        [
            command("ss", "-H", "-ltn", "sport = :25565"),
            output("LISTEN 0 128 *:25565 *:*\n"),
            "port",
            "port-occupied",
        ],
    ])("stops at the first unmet condition: %s", async (script, answer, stage, code) => {
        const deps = fixture({ [script]: answer });
        const result = await preflightSshProcessCreation(request, deps);
        expect(result.ok && result.value.ready).toBe(false);
        expect(result.ok && result.value.checks.at(-1)).toEqual({ stage, state: "blocked", code });
    });

    it.each([
        [command("cat", "/proc/meminfo"), output("not-memory"), "memory"],
        [
            command("df", "-Pk", "--", "/srv/servers"),
            output("header\n/dev/x 0 0 999999999999999999999 0% /\n"),
            "disk",
        ],
        [
            command("ss", "-H", "-ltn", "sport = :25565"),
            output("", { ok: false, exitCode: 127 }),
            "port",
        ],
        [
            command("uname", "-s"),
            output("", { ok: false, exitCode: 255, stderr: "connection timed out" }),
            "platform",
        ],
    ])("keeps unobservable prerequisites unknown: %s", async (script, answer, stage) => {
        const result = await preflightSshProcessCreation(request, fixture({ [script]: answer }));
        expect(result.ok && result.value.checks.at(-1)).toMatchObject({ stage, state: "unknown" });
    });

    it("rejects a changed or forgotten profile after the observation", async () => {
        const deps = fixture();
        vi.mocked(deps.hostProfiles.get)
            .mockResolvedValueOnce(ok(profile))
            .mockResolvedValueOnce(ok({ ...profile, updatedAt: "changed" }));
        expect(await preflightSshProcessCreation(request, deps)).toMatchObject({
            ok: false,
            failure: { code: "stale-document" },
        });
    });
    it("never executes against a missing profile or mismatched target", async () => {
        const deps = fixture();
        vi.mocked(deps.hostProfiles.get).mockResolvedValueOnce(fail("not-found", "Missing"));
        expect((await preflightSshProcessCreation(request, deps)).ok).toBe(false);
        vi.mocked(deps.hostProfiles.sshHost).mockReturnValueOnce({
            target: { ...profile.target, id: "other" },
            knownHostsFile: "/fixture/known_hosts",
        });
        expect((await preflightSshProcessCreation(request, deps)).ok).toBe(false);
        expect(deps.runner).not.toHaveBeenCalled();
    });
    it("bounds a runner that ignores cancellation and does not continue after its deadline", async () => {
        vi.useFakeTimers();
        const deps = fixture();
        deps.runner.mockImplementationOnce(async () => new Promise(() => undefined));
        const pending = preflightSshProcessCreation(request, deps);
        await vi.advanceTimersByTimeAsync(SSH_PREFLIGHT_TIMEOUT_MS);
        expect(await pending).toMatchObject({
            ok: true,
            value: { ready: false, checks: [{ state: "unknown", code: "timeout" }] },
        });
        expect(deps.runner).toHaveBeenCalledTimes(1);
    });
    it("returns unknown when cancelled, a runner throws or output exceeds its bound", async () => {
        const abort = new AbortController();
        abort.abort();
        const deps = fixture();
        const cancelled = await preflightSshProcessCreation(request, {
            ...deps,
            signal: abort.signal,
        });
        expect(cancelled.ok && cancelled.value.checks.at(-1)?.code).toBe("cancelled");
        expect(deps.runner).not.toHaveBeenCalled();
        deps.runner.mockRejectedValueOnce(new Error("private detail"));
        expect(JSON.stringify(await preflightSshProcessCreation(request, deps))).not.toContain(
            "private detail",
        );
        const oversized = fixture({
            [command("printf", "%s", "worldlens-readiness-v1")]: output("x".repeat(65_537)),
        });
        expect(await preflightSshProcessCreation(request, oversized)).toMatchObject({
            ok: true,
            value: { ready: false, checks: [{ state: "unknown" }] },
        });
    });
});
