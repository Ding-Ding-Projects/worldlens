import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { execFileCommandRunner, type CommandOutput, type CommandRunner } from "../../runtime/command.js";
import { createServerRegistry, parseRecord, type ServerRecord } from "../registry.js";
import { createTransport } from "./factory.js";
import { sshProcessIdentity } from "./sshProcessLifecycle.js";
import { createSshProcessTransport } from "./sshProcess.js";
import type { SshOptionsInput } from "../../remote/ssh.js";
import { fail, type SshProcessRef } from "./types.js";
import { MCSERVER_CHANNELS, registerMcServerHandlers, type IpcMainLike } from "../ipc.js";
import type { HostProfileStore } from "../hostProfiles.js";

vi.mock("../../runtime/command.js", async (original) => ({
    ...await original<typeof import("../../runtime/command.js")>(), execFileCommandRunner: vi.fn(),
}));

const ref: SshProcessRef = { kind: "ssh-process", hostId: "host-one", serverId: "survival",
    ownerId: "12345678-1234-4234-8234-123456789abc", serverDir: "/srv/server",
    javaPath: "/usr/bin/java", jarPath: "/srv/server/server.jar", memoryMb: 2048 };
const ssh: SshOptionsInput = { knownHostsFile: "C:/trusted hosts", target: { id: ref.hostId,
    label: "Test host", host: "example.test", port: 22, user: "minecraft", identityFile: null,
    workDir: "/srv", image: "test", docker: "docker", keepRemoteFiles: false } };
const record = (): ServerRecord => ({ id: ref.serverId, name: "Survival", flavour: "paper",
    minecraftVersion: "1.21.4", ref: { ...ref }, origin: "created", createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z", hasRconSecret: false, rconPort: null, writeScope: [], localRuntime: null });
const output = (stdout: string): CommandOutput => ({ ok: true, stdout, stderr: "", exitCode: 0, spawnError: null });
function absent() {
    const id = sshProcessIdentity(ref);
    if (!id.ok) throw new Error("Invalid fixture");
    return output(Object.entries({ Id: id.value.unitName, Description: "", LoadState: "not-found",
        ActiveState: "inactive", SubState: "dead", MainPID: "0", InvocationID: "",
        ExecMainCode: "0", ExecMainStatus: "0" }).map(([k, v]) => `${k}=${v}`).join("\n"));
}

describe("persisted SSH process transport", () => {
    it.each([
        { ownerId: undefined }, { ownerId: "wrong" }, { hostId: "../host" }, { serverId: "different" },
        { serverDir: "/srv/../server" }, { jarPath: "/other/server.jar" }, { javaPath: null },
        { memoryMb: 127 }, { extra: true },
    ])("rejects invalid identity without repairing it: %j", (patch) => {
        expect(parseRecord({ ...record(), ref: { ...ref, ...patch } })).toBeNull();
    });
    it("rejects a local runtime attached to a remote process", () => {
        expect(parseRecord({ ...record(), localRuntime: { javaPath: "local", jarPath: "local", memoryMb: 512 } })).toBeNull();
        expect(parseRecord({ ...record(), origin: "adopted" })).toBeNull();
    });
    it("persists the exact launch identity and refuses replacing its owner", async () => {
        const dir = await mkdtemp(join(tmpdir(), "wl-ssh-record-"));
        try {
            const registry = createServerRegistry({ dataFolder: dir });
            expect((await registry.put(record())).ok).toBe(true);
            const reopened = createServerRegistry({ dataFolder: dir });
            expect(await reopened.get(ref.serverId)).toMatchObject({ ok: true, value: { ref } });
            expect((await reopened.put({ ...record(), ref: { ...ref, ownerId: "12345678-1234-4234-9234-123456789abc" } })).ok).toBe(false);
        } finally { await rm(dir, { recursive: true, force: true }); }
    });
    it("does not fall back to a local runtime or another host", () => {
        const localRuntime = vi.fn();
        const runner = vi.fn<CommandRunner>();
        expect(createTransport(ref, { localRuntime, runner })).toMatchObject({ ok: false, failure: { code: "not-found" } });
        expect(createTransport(ref, { sshHost: () => ({ ...ssh, target: { ...ssh.target, id: "other" } }), runner })).toMatchObject({ ok: false, failure: { code: "invalid-request" } });
        expect(localRuntime).not.toHaveBeenCalled();
        expect(runner).not.toHaveBeenCalled();
    });
    it("uses the production SSH runner and prefers an explicit injected runner", async () => {
        vi.mocked(execFileCommandRunner).mockReset().mockResolvedValue(absent());
        const built = createTransport(ref, { sshHost: () => ssh });
        if (!built.ok) throw new Error(built.failure.message);
        expect(await built.value.status()).toMatchObject({ ok: true, value: { state: "absent", running: false } });
        expect(execFileCommandRunner).toHaveBeenCalledOnce();
        expect(vi.mocked(execFileCommandRunner).mock.calls[0]?.[0]).toBe("ssh");
        expect(vi.mocked(execFileCommandRunner).mock.calls[0]?.[1]).toContain("StrictHostKeyChecking=yes");
        vi.mocked(execFileCommandRunner).mockClear();
        const runner = vi.fn<CommandRunner>().mockResolvedValue(absent());
        const injected = createTransport(ref, { sshHost: () => ssh, runner });
        if (!injected.ok) throw new Error(injected.failure.message);
        await injected.value.status();
        expect(runner).toHaveBeenCalledOnce();
        expect(execFileCommandRunner).not.toHaveBeenCalled();
    });
    it("keeps disconnected state unknown and performs no launch", async () => {
        const runner = vi.fn<CommandRunner>().mockResolvedValue({ ok: false, stdout: "", stderr: "Connection timed out", exitCode: 255, spawnError: null });
        const built = createTransport(ref, { sshHost: () => ssh, runner });
        if (!built.ok) throw new Error(built.failure.message);
        expect(await built.value.start()).toMatchObject({ ok: false, failure: { code: "unreachable" } });
        expect(runner).toHaveBeenCalledOnce();
        expect(String(runner.mock.calls[0]?.[1].at(-1))).not.toContain("systemd-run");
    });
    it("reconnects to the saved running installation without launching a duplicate", async () => {
        const identity = sshProcessIdentity(ref);
        if (!identity.ok) throw new Error("Invalid fixture");
        const status = Object.entries({ Id: identity.value.unitName, Description: identity.value.description,
            LoadState: "loaded", ActiveState: "active", SubState: "running", MainPID: "1234",
            InvocationID: "a".repeat(32), ExecMainCode: "0", ExecMainStatus: "0" }).map(([k, v]) => `${k}=${v}`).join("\n");
        const runner = vi.fn<CommandRunner>(async (_command, args) => {
            const line = args.at(-1)!;
            if (line.startsWith("'systemctl'")) return output(status);
            if (line.includes("'/proc/1234/exe'")) return output(`${ref.javaPath}\n`);
            if (line.includes("'/proc/1234/cwd'")) return output(`${ref.serverDir}\n`);
            if (line.startsWith("'base64'")) return output(Buffer.from(`${identity.value.argv.join("\0")}\0`).toString("base64"));
            throw new Error("Unexpected mutation");
        });
        const built = createTransport({ ...ref }, { sshHost: () => ssh, runner });
        if (!built.ok) throw new Error(built.failure.message);
        expect(await built.value.start()).toEqual({ ok: true, value: undefined });
        expect(runner).toHaveBeenCalledTimes(5);
        expect(runner.mock.calls.every(([_command, args]) => !String(args.at(-1)).includes("systemd-run"))).toBe(true);
    });
    it("exposes only implemented capabilities and makes no calls for unsupported operations", async () => {
        const runner = vi.fn<CommandRunner>();
        const built = createSshProcessTransport({ ref, ssh, runner, capabilities: { canCreate: true, canDestroy: true, console: "rcon" } });
        if (!built.ok) throw new Error(built.failure.message);
        const t = built.value;
        expect(t.capabilities).toMatchObject({ canCreate: false, canLifecycle: false, canStart: true, canStop: false, canWriteFiles: false, canDestroy: false, console: "none" });
        const results = await Promise.all([t.stop({ graceful: true, timeoutMs: 500 }), t.stop({ graceful: false, timeoutMs: 500 }), t.attach(), t.fileList("."), t.fileRead("server.properties"), t.fileDelete("server.jar"), t.dirEnsure("plugins")]);
        for (const result of results) expect(result).toMatchObject({ ok: false, failure: { code: "unsupported" } });
        expect(runner).not.toHaveBeenCalled();
        const denied = createSshProcessTransport({ ref, ssh, runner, capabilities: { canLifecycle: false } });
        if (!denied.ok) throw new Error(denied.failure.message);
        expect(denied.value.capabilities.canStart).toBe(false);
        expect(await denied.value.start()).toMatchObject({ ok: false, failure: { code: "denied" } });
        expect(runner).not.toHaveBeenCalled();
    });
    it("loads the saved profile before resolving the production IPC transport", async () => {
        const dir = await mkdtemp(join(tmpdir(), "wl-ssh-ipc-"));
        const handlers = new Map<string, (...args: never[]) => Promise<unknown>>();
        const ipc: IpcMainLike = { handle: (name, handler) => { handlers.set(name, handler as (...args: never[]) => Promise<unknown>); }, removeHandler: (name) => { handlers.delete(name); } };
        const registry = createServerRegistry({ dataFolder: dir });
        await registry.put(record());
        let warm = false;
        const profiles: HostProfileStore = {
            get: async (id) => { expect(id).toBe(ref.hostId); warm = true; return fail("not-found", "Fixture profile metadata is not used"); },
            sshHost: (id) => warm && id === ref.hostId ? ssh : null,
            list: async () => fail("unsupported", "unused"), save: async () => fail("unsupported", "unused"), forget: async () => fail("unsupported", "unused"),
        };
        vi.mocked(execFileCommandRunner).mockReset().mockResolvedValue(absent());
        const registration = registerMcServerHandlers(ipc, { dataFolder: dir, registry, hostProfiles: profiles,
            safeStorage: { isEncryptionAvailable: () => false, encryptString: () => { throw new Error("Unavailable"); }, decryptString: () => { throw new Error("Unavailable"); } } });
        try {
            await registry.remove(ref.serverId);
            expect((await registry.put({ ...record(), origin: "adopted" })).ok).toBe(false);
            expect(await handlers.get(MCSERVER_CHANNELS.start)!({} as never, ref.serverId as never)).toMatchObject({ ok: false, failure: { code: "not-found" } });
            expect(execFileCommandRunner).not.toHaveBeenCalled();
            await registry.put(record());
            expect(await handlers.get(MCSERVER_CHANNELS.status)!({} as never, ref.serverId as never)).toMatchObject({ ok: true, value: { state: "absent" } });
            expect(execFileCommandRunner).toHaveBeenCalledOnce();
            expect(await handlers.get(MCSERVER_CHANNELS.probe)!({} as never, ref.serverId as never)).toMatchObject({
                ok: true, value: { reachable: true, capabilities: { canStart: true, canStop: false, canLifecycle: false, canWriteFiles: false } },
            });
        } finally { registration.dispose(); await rm(dir, { recursive: true, force: true }); }
    });
});
