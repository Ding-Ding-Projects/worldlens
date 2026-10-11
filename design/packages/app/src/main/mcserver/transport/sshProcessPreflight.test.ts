import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MCSERVER_CHANNELS, registerMcServerHandlers, type IpcMainLike } from "../ipc.js";
import { fail, ok } from "./types.js";
import type { HostProfileStore } from "../hostProfiles.js";
import { remoteCommandLine, type SshOptionsInput } from "../../remote/ssh.js";
import type { CommandOutput, CommandRunner } from "../../runtime/command.js";
import { inspectSshProcessHost, parseSshProcessPreflightRequest, type SshProcessPreflightRequest } from "./sshProcessPreflight.js";

const request: SshProcessPreflightRequest = { hostId: "test-host", parentDirectory: "/srv/servers", javaPath: "/usr/bin/java", memoryMb: 2048, port: 25565, flavour: "vanilla", version: "1.21.4" };
const ssh: SshOptionsInput = { knownHostsFile: "C:/trusted hosts", target: { id: "test-host", label: "Test", host: "example.test", port: 22, user: "minecraft", identityFile: null, workDir: "/srv/servers", image: "test", docker: "docker", keepRemoteFiles: false } };
const out = (stdout: string, stderr = "", exitCode = 0): CommandOutput => ({ ok: exitCode === 0, stdout, stderr, exitCode, spawnError: null });
function fixture(replace: Record<string, CommandOutput> = {}) {
    const answers = new Map([
        [["uname", "-s"], out("Linux\n")],
        [["systemd-run", "--version"], out("systemd 255 (255.4)\n")],
        [["systemctl", "--user", "show", "--property=Version", "--value", "--no-pager"], out("255.4\n")],
        [["id", "-un"], out("minecraft\n")],
        [["loginctl", "show-user", "minecraft", "--property=Linger", "--value"], out("yes\n")],
        [["realpath", "--canonicalize-existing", "--physical", "--", "/srv/servers"], out("/srv/servers\n")],
        [["test", "-d", "/srv/servers"], out("")],
        [["test", "-w", "/srv/servers"], out("")],
        [["realpath", "--canonicalize-existing", "--physical", "--", "/usr/bin/java"], out("/usr/lib/jvm/bin/java\n")],
        [["test", "-x", "/srv/servers"], out("")],
        [["/usr/lib/jvm/bin/java", "-version"], out("", 'openjdk version "21.0.6" 2025-01-21\n')],
        [["cat", "--", "/proc/meminfo"], out("MemTotal:       8388608 kB\nMemAvailable:   4194304 kB\n")],
        [["env", "LC_ALL=C", "df", "--block-size=1", "--output=avail", "--", "/srv/servers"], out("       Avail\n  8589934592\n")],
        [["ss", "-H", "-l", "-t", "-n", "sport", "=", ":25565"], out("")],
    ].map(([words, answer]) => [remoteCommandLine(words as string[]), answer as CommandOutput]));
    return vi.fn<CommandRunner>(async (command, args, options) => {
        expect(command).toBe("ssh");
        expect(args).toContain("StrictHostKeyChecking=yes");
        expect(args).toContain("PasswordAuthentication=no");
        expect(options?.timeoutMs).toBeGreaterThan(0);
        expect(options?.timeoutMs).toBeLessThanOrEqual(5000);
        const script = args.at(-1)!;
        if (replace[script]) return replace[script]!;
        const answer = answers.get(script);
        if (!answer) throw new Error("Unexpected command");
        return answer;
    });
}

describe("SSH process readiness", () => {
    it("observes each required boundary without authorizing installation", async () => {
        const runner = fixture();
        const result = await inspectSshProcessHost({ request, ssh, runner, requiredJavaFeature: 21 });
        expect(result).toMatchObject({ ok: true, value: { installationAvailable: false, request } });
        if (!result.ok) return;
        expect(result.value.checks).toHaveLength(9);
        expect(result.value.checks.every((check) => check.state === "ready")).toBe(true);
        expect(runner).toHaveBeenCalledTimes(14);
    });
    it.each([{ parentDirectory: "/srv/../else" }, { javaPath: "java" }, { port: 65536 }, { memoryMb: 127 }, { ownerId: "untrusted" }, { requiredJavaFeature: 8 }])("rejects malformed or extra input before connecting: %j", async (patch) => {
        const invalid = { ...request, ...patch };
        expect(parseSshProcessPreflightRequest(invalid)).toBeNull();
        const runner = fixture();
        expect(await inspectSshProcessHost({ request: invalid, ssh, runner, requiredJavaFeature: 21 })).toMatchObject({ ok: false });
        expect(runner).not.toHaveBeenCalled();
    });
    it("requires the exact saved host identity", async () => {
        const runner = fixture();
        expect(await inspectSshProcessHost({ request, ssh: { ...ssh, target: { ...ssh.target, id: "other" } }, runner, requiredJavaFeature: 21 })).toMatchObject({ ok: false });
        expect(runner).not.toHaveBeenCalled();
    });
    it("returns unknown after unavailable SSH without exposing stderr", async () => {
        const runner = fixture({ [remoteCommandLine(["uname", "-s"])]: out("", "sensitive diagnostic", 255) });
        const result = await inspectSshProcessHost({ request, ssh, runner, requiredJavaFeature: 21 });
        expect(result.ok && result.value.checks.every((check) => check.state === "unknown")).toBe(true);
        expect(JSON.stringify(result)).not.toContain("sensitive diagnostic");
        expect(runner).toHaveBeenCalledTimes(1);
    });
    it("reports independent blocked observations and an unknown Java requirement", async () => {
        const runner = fixture({
            [remoteCommandLine(["systemd-run", "--version"])]: out("systemd 253\n"),
            [remoteCommandLine(["loginctl", "show-user", "minecraft", "--property=Linger", "--value"])]: out("no\n"),
            [remoteCommandLine(["cat", "--", "/proc/meminfo"])]: out("MemAvailable: 1024 kB\n"),
            [remoteCommandLine(["ss", "-H", "-l", "-t", "-n", "sport", "=", ":25565"])]: out("LISTEN 0 128 0.0.0.0:25565 0.0.0.0:*\n"),
        });
        const result = await inspectSshProcessHost({ request, ssh, runner, requiredJavaFeature: null });
        if (!result.ok) throw new Error("Expected observations");
        for (const id of ["systemd", "linger", "memory", "port"]) expect(result.value.checks.find((row) => row.id === id)?.state).toBe("blocked");
        expect(result.value.checks.find((row) => row.id === "java")?.state).toBe("unknown");
    });
    it("does not turn malformed memory or listener output into available capacity", async () => {
        const runner = fixture({
            [remoteCommandLine(["cat", "--", "/proc/meminfo"])]: out("MemAvailable: 1234 kB\nMemAvailable: 9876 kB\n"),
            [remoteCommandLine(["ss", "-H", "-l", "-t", "-n", "sport", "=", ":25565"])]: out("unexpected output\n"),
        });
        const result = await inspectSshProcessHost({ request, ssh, runner, requiredJavaFeature: 21 });
        if (!result.ok) throw new Error("Expected observations");
        for (const id of ["memory", "port"]) expect(result.value.checks.find((row) => row.id === id)?.state).toBe("unknown");
    });
    it("stops starting commands after the absolute deadline", async () => {
        let time = 0;
        const runner = vi.fn<CommandRunner>(async () => { time = 45_000; return out("Linux\n"); });
        const result = await inspectSshProcessHost({ request, ssh, runner, requiredJavaFeature: 21, clock: () => time });
        expect(result.ok && result.value.checks.filter((row) => row.state === "unknown")).toHaveLength(8);
        expect(runner).toHaveBeenCalledOnce();
    });
    it("retains a per-host latch until the observation settles", async () => {
        let resolve!: (output: CommandOutput) => void;
        const runner = vi.fn<CommandRunner>(() => new Promise((done) => { resolve = done; }));
        const first = inspectSshProcessHost({ request, ssh, runner, requiredJavaFeature: 21 });
        expect(await inspectSshProcessHost({ request, ssh, runner, requiredJavaFeature: 21 })).toMatchObject({ ok: false });
        expect(runner).toHaveBeenCalledOnce();
        resolve(out("Darwin\n"));
        await first;
        expect((await inspectSshProcessHost({ request, ssh, runner: fixture(), requiredJavaFeature: 21 })).ok).toBe(true);
    });
    it.each([
        { words: ["test", "-x", "/srv/servers"], output: out("", "", 1), id: "directory", state: "blocked" },
        { words: ["id", "-un"], output: out("different-user\n"), id: "linger", state: "unknown" },
        { words: ["/usr/lib/jvm/bin/java", "-version"], output: out('java version "17"\n', 'openjdk version "21"\n'), id: "java", state: "unknown" },
        { words: ["systemctl", "--user", "show", "--property=Version", "--value", "--no-pager"], output: out("253\n"), id: "user-manager", state: "blocked" },
    ])("does not accept an incomplete $id observation", async ({ words, output, id, state }) => {
        const result = await inspectSshProcessHost({ request, ssh, runner: fixture({ [remoteCommandLine(words)]: output }), requiredJavaFeature: 21 });
        if (!result.ok) throw new Error("Expected observations");
        expect(result.value.checks.find((row) => row.id === id)?.state).toBe(state);
    });
    it("validates IPC input, resolves only its saved host and does not fetch a missing catalogue", async () => {
        const dir = await mkdtemp(join(tmpdir(), "wl-ssh-preflight-"));
        const handlers = new Map<string, (...args: never[]) => Promise<unknown>>();
        const ipc: IpcMainLike = { handle: (name, handler) => { handlers.set(name, handler as (...args: never[]) => Promise<unknown>); }, removeHandler: (name) => { handlers.delete(name); } };
        const get = vi.fn(async (hostId: string) => hostId === request.hostId ? ok({ hostId, target: ssh.target, createdAt: "now", updatedAt: "now" }) : fail("not-found", "No such profile"));
        const profiles: HostProfileStore = { get, sshHost: (id) => id === request.hostId ? ssh : null,
            list: async () => fail("unsupported", "unused"), save: async () => fail("unsupported", "unused"), forget: async () => fail("unsupported", "unused") };
        const runner = fixture();
        const fetchText = vi.fn();
        const registered = registerMcServerHandlers(ipc, { dataFolder: dir, hostProfiles: profiles, factory: { runner }, fetchText,
            safeStorage: { isEncryptionAvailable: () => false, encryptString: () => { throw new Error("Unavailable"); }, decryptString: () => { throw new Error("Unavailable"); } } });
        try {
            const run = (input: unknown) => handlers.get(MCSERVER_CHANNELS.sshProcessPreflight)!({} as never, input as never);
            expect(await run({ ...request, requiredJavaFeature: 8 })).toMatchObject({ ok: false });
            expect(get).not.toHaveBeenCalled();
            expect(await run({ ...request, hostId: "missing" })).toMatchObject({ ok: false, failure: { code: "not-found" } });
            expect(runner).not.toHaveBeenCalled();
            expect(await run(request)).toMatchObject({ ok: true, value: { request, requiredJavaFeature: null, installationAvailable: false } });
            expect(fetchText).not.toHaveBeenCalled();
        } finally { registered.dispose(); await rm(dir, { recursive: true, force: true }); }
    });
});
