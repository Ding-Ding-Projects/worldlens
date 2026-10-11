import { describe, expect, it } from "vitest";
import { remoteCommandLine, type SshOptionsInput } from "../../remote/ssh.js";
import type { CommandOutput, CommandRunner } from "../../runtime/command.js";
import { createSshProcessLifecycle, parseSshProcessStatus, sshProcessIdentity, type SshProcessPlan } from "./sshProcessLifecycle.js";
import { fail, ok } from "./types.js";

const plan: SshProcessPlan = { hostId: "host-one", serverId: "server-one", ownerId: "12345678-1234-4234-8234-123456789abc", serverDir: "/srv/server", javaPath: "/usr/bin/java", jarPath: "/srv/server/server.jar", memoryMb: 2048 };
const ssh: SshOptionsInput = { knownHostsFile: "C:/trusted hosts", target: { id: "host-one", label: "Test host", host: "example.test", port: 22, user: "minecraft", identityFile: null, workDir: "/srv", image: "test", docker: "docker", keepRemoteFiles: false } };
const invocation = "a".repeat(32);
function identity(value = plan) {
    const result = sshProcessIdentity(value);
    if (!result.ok) throw new Error(result.failure.message);
    return result.value;
}
function report(state: "absent" | "running" | "exited" = "running", changes: Record<string, string> = {}, value = plan): string {
    const saved = identity(value);
    return Object.entries({ Id: saved.unitName, Description: saved.description, LoadState: state === "absent" ? "not-found" : "loaded", ActiveState: state === "running" ? "active" : "inactive", SubState: state === "running" ? "running" : "dead", MainPID: state === "running" ? "1234" : "0", InvocationID: state === "absent" ? "" : invocation, ExecMainCode: "1", ExecMainStatus: "0", ...changes }).map(([key, item]) => `${key}=${item}`).join("\n");
}
const output = (stdout: string, exitCode = 0): CommandOutput => ({ ok: exitCode === 0, stdout, stderr: "", exitCode, spawnError: null });
function fixture(value = plan, responder?: (command: string) => CommandOutput | Promise<CommandOutput>) {
    const calls: string[] = [];
    let state: "absent" | "running" | "exited" = "running";
    const runner: CommandRunner = async (command, args) => {
        expect(command).toBe("ssh");
        expect(args).toContain("StrictHostKeyChecking=yes");
        expect(args).toContain("PasswordAuthentication=no");
        const line = args.at(-1)!;
        calls.push(line);
        if (responder) return responder(line);
        if (line.startsWith("'systemctl' '--user' 'show'")) return output(report(state, {}, value));
        if (line.includes("'/proc/1234/exe'")) return output(`${value.javaPath}\n`);
        if (line.includes("'/proc/1234/cwd'")) return output(`${value.serverDir}\n`);
        if (line.startsWith("'base64'")) return output(Buffer.from(`${identity(value).argv.join("\0")}\0`).toString("base64"));
        if (line === "'systemd-run' '--version'") return output("systemd 254\n");
        if (line.startsWith("'loginctl'")) return output("yes\n");
        if (line.startsWith("'systemd-run'")) { state = "running"; return output(""); }
        throw new Error(`Unexpected command: ${line}`);
    };
    const created = createSshProcessLifecycle({ plan: value, ssh, runner, sendStop: async () => ok(undefined) });
    if (!created.ok) throw new Error(created.failure.message);
    return { lifecycle: created.value, calls, runner, setState: (next: typeof state) => { state = next; } };
}

describe("durable SSH process lifecycle", () => {
    it("keeps one installation identity across reconnects and separates owners", () => {
        expect(identity()).toEqual(identity({ ...plan }));
        expect(identity({ ...plan, ownerId: "12345678-1234-4234-9234-123456789abc" }).unitName).not.toBe(identity().unitName);
    });
    it.each(["/srv/../other", "/srv/%n", "/srv/line\nnext", "/"])("rejects unsupported root %s", (serverDir) => {
        expect(sshProcessIdentity({ ...plan, serverDir }).ok).toBe(false);
    });
    it("rejects jars outside the managed installation", () => {
        expect(sshProcessIdentity({ ...plan, jarPath: "/srv/other.jar" }).ok).toBe(false);
    });
    it("does not treat contradictory absence or duplicate status as authoritative", () => {
        expect(parseSshProcessStatus(report("absent", { MainPID: "1234" }), identity(), "now").ok).toBe(false);
        expect(parseSshProcessStatus(`${report()}\nMainPID=999`, identity(), "now").ok).toBe(false);
    });
    it("does not mutate a foreign service", async () => {
        const f = fixture(plan, async () => output(report("running", { Description: "Another service" })));
        expect(await f.lifecycle.start()).toMatchObject({ ok: false, failure: { code: "denied" } });
        expect(f.calls).toHaveLength(1);
    });
    it("reconnects to the observed process without launching another", async () => {
        const f = fixture();
        expect(await f.lifecycle.start()).toMatchObject({ ok: true, value: { running: true, mainPid: 1234 } });
        expect(f.calls.some((line) => line.startsWith("'systemd-run'"))).toBe(false);
    });
    it("quotes literal paths and disables environment expansion when creating the service", async () => {
        const root = "/srv/space '$\\ folder ";
        const value = { ...plan, serverDir: root, jarPath: `${root}/server.jar` };
        const f = fixture(value);
        f.setState("absent");
        expect((await f.lifecycle.start()).ok).toBe(true);
        expect(f.calls).toContain(remoteCommandLine(["systemd-run", "--user", "--collect", `--unit=${identity(value).unitName}`, `--description=${identity(value).description}`, "--expand-environment=no", "--property=Type=exec", "--property=Restart=no", "--property=SendSIGKILL=no", `--working-directory=${root}`, "--", ...identity(value).argv]));
    });
    it("leaves SSH connection loss unknown and never launches on that result", async () => {
        const f = fixture(plan, () => ({ ...output("", 255), stderr: "Connection timed out" }));
        expect(await f.lifecycle.start()).toMatchObject({ ok: false, failure: { code: "unreachable" } });
        expect(f.calls).toHaveLength(1);
    });
    it("rejects an old invocation before any stop command", async () => {
        const f = fixture();
        const snapshot = parseSshProcessStatus(report("running", { InvocationID: "b".repeat(32) }), identity(), "now");
        if (!snapshot.ok) throw new Error("fixture");
        expect(await f.lifecycle.stop(snapshot.value, { graceful: true, timeoutMs: 1000 })).toMatchObject({ ok: false, failure: { code: "stale-document" } });
        expect(f.calls.some((line) => line.includes("'kill'"))).toBe(false);
    });
    it("graceful timeout sends no stop or kill signal", async () => {
        const f = fixture();
        const snapshot = await f.lifecycle.status();
        if (!snapshot.ok) throw new Error("fixture");
        expect(await f.lifecycle.stop(snapshot.value, { graceful: true, timeoutMs: 0 })).toMatchObject({ ok: false, failure: { code: "timeout" } });
        expect(f.calls.some((line) => line.includes("'kill'") || line.includes("'stop'"))).toBe(false);
    });
    it("does not expose a unit-name hard kill across an invocation race", async () => {
        const f = fixture();
        const snapshot = await f.lifecycle.status();
        if (!snapshot.ok) throw new Error("fixture");
        f.calls.length = 0;
        expect(await f.lifecycle.stop(snapshot.value, { graceful: false, timeoutMs: 1000 })).toMatchObject({ ok: false, failure: { code: "unsupported" } });
        expect(f.calls).toHaveLength(0);
    });
    it("starts no subsequent SSH probe after the absolute deadline", async () => {
        let clock = 0;
        const f = fixture(plan, () => { clock = 1000; return output(report()); });
        const created = createSshProcessLifecycle({ plan, ssh, runner: f.runner, clock: () => clock });
        const snapshot = parseSshProcessStatus(report(), identity(), "now");
        if (!created.ok || !snapshot.ok) throw new Error("fixture");
        expect(await created.value.stop(snapshot.value, { graceful: true, timeoutMs: 100 })).toMatchObject({ ok: false, failure: { code: "timeout" } });
        expect(f.calls).toHaveLength(1);
    });
    it("latches duplicate activation synchronously", async () => {
        const f = fixture();
        const first = f.lifecycle.start();
        expect(await f.lifecycle.start()).toMatchObject({ ok: false, failure: { code: "busy" } });
        expect((await first).ok).toBe(true);
    });
    it("does not deliver a console command when final verification consumes the deadline", async () => {
        let clock = 0;
        let delivered = false;
        const f = fixture();
        const runner: CommandRunner = async (...args) => {
            const result = await f.runner(...args);
            if (f.calls.length === 5) clock = 100;
            return result;
        };
        const created = createSshProcessLifecycle({ plan, ssh, runner, clock: () => clock, sendStop: async () => { delivered = true; return ok(undefined); } });
        const snapshot = parseSshProcessStatus(report(), identity(), "now");
        if (!created.ok || !snapshot.ok) throw new Error("fixture");
        expect(await created.value.stop(snapshot.value, { graceful: true, timeoutMs: 100 })).toMatchObject({ ok: false, failure: { code: "timeout" } });
        expect(delivered).toBe(false);
    });
    it("cancels cooperative console delivery without a late write", async () => {
        const f = fixture();
        let delivered = false;
        let cancelled = false;
        const created = createSshProcessLifecycle({ plan, ssh, runner: f.runner, clock: () => 0,
            sendStop: async (_identity, request) => new Promise((resolve) => {
                expect(request.deadline).toBe(10);
                expect(request.timeoutMs).toBe(10);
                request.signal.addEventListener("abort", () => { cancelled = true; resolve(fail("timeout", "Cancelled before write")); }, { once: true });
                if (!request.signal.aborted) delivered = false;
            }),
        });
        const snapshot = parseSshProcessStatus(report(), identity(), "now");
        if (!created.ok || !snapshot.ok) throw new Error("fixture");
        expect(await created.value.stop(snapshot.value, { graceful: true, timeoutMs: 10 })).toMatchObject({ ok: false, failure: { code: "timeout" } });
        expect(cancelled).toBe(true);
        expect(delivered).toBe(false);
    });
});
