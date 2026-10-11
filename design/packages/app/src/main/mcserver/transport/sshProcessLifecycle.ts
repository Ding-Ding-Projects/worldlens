/**
 * Durable Linux SSH-process lifecycle primitives. The persisted owner identity is supplied
 * by the installation record, never generated when reconnecting. File installation,
 * transport registration, creation and GUI consumers are separate integration work.
 *
 * A systemd user service owns the JVM after the SSH command exits. This route requires
 * systemd >=254, a reachable user manager and enabled lingering; it never enables lingering
 * or changes host configuration itself. Graceful shutdown uses the real server console,
 * never an automatic signal escalation after its deadline.
 */
import { createHash } from "node:crypto";
import { posix } from "node:path";
import { sshCommandRunner, type SshOptionsInput } from "../../remote/ssh.js";
import { validateTarget } from "../../remote/target.js";
import type { CommandOutput, CommandRunner } from "../../runtime/command.js";
import { fail, ok, type Answer, type InstanceStatus, type StopOptions } from "./types.js";

const ID = /^[a-z][a-z0-9-]{0,62}$/u;
const OWNER = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const INVOCATION = /^[a-f0-9]{32}$/u;
const PROPERTIES = ["Id", "Description", "LoadState", "ActiveState", "SubState", "MainPID", "InvocationID", "ExecMainCode", "ExecMainStatus"] as const;
const operations = new Set<string>();

export interface SshProcessPlan {
    readonly hostId: string;
    readonly serverId: string;
    /** Generated once at installation and persisted; this is an ownership identifier, not a credential. */
    readonly ownerId: string;
    /** Canonical remote absolute paths, resolved during installation. */
    readonly serverDir: string;
    readonly javaPath: string;
    readonly jarPath: string;
    readonly memoryMb: number;
}

export interface SshProcessSnapshot extends InstanceStatus {
    readonly unitName: string;
    readonly mainPid: number;
    readonly invocationId: string | null;
}

export interface SshProcessLifecycle {
    readonly unitName: string;
    status(): Promise<Answer<SshProcessSnapshot>>;
    start(): Promise<Answer<SshProcessSnapshot>>;
    /** The caller supplies the invocation it reviewed; a changed invocation is never pursued. */
    stop(expected: SshProcessSnapshot, options: StopOptions): Promise<Answer<SshProcessSnapshot>>;
}

function absolutePath(value: string): boolean {
    // Percent specifiers belong to systemd's property/ExecStart expansion layer. Until
    // that route has a verified literal encoding, reject them rather than guessing.
    return value.length <= 2048 && value.startsWith("/") && value !== "/" &&
        posix.normalize(value) === value && !/[\x00-\x1f\x7f%]/u.test(value);
}

export function sshProcessIdentity(plan: SshProcessPlan): Answer<{ unitName: string; description: string; argv: readonly string[] }> {
    if (!ID.test(plan.hostId) || !ID.test(plan.serverId) || !OWNER.test(plan.ownerId) ||
        !absolutePath(plan.serverDir) || !absolutePath(plan.javaPath) || !absolutePath(plan.jarPath) ||
        !Number.isSafeInteger(plan.memoryMb) || plan.memoryMb < 128 || plan.memoryMb > 1_048_576) {
        return fail("invalid-request", "The SSH process installation identity or launch configuration is invalid.");
    }
    const relativeJar = posix.relative(plan.serverDir, plan.jarPath);
    if (!relativeJar || relativeJar.startsWith("../") || posix.isAbsolute(relativeJar))
        return fail("out-of-scope", "The server jar must be inside its managed installation folder.");
    const argv = [plan.javaPath, `-Xms${Math.min(512, plan.memoryMb)}M`, `-Xmx${plan.memoryMb}M`, "-jar", plan.jarPath, "nogui"];
    const identity = createHash("sha256").update(JSON.stringify([plan.hostId, plan.serverId, plan.ownerId])).digest("hex");
    const launch = createHash("sha256").update(JSON.stringify([plan.serverDir, argv])).digest("hex");
    return ok({ unitName: `worldlens-mc-${identity.slice(0, 32)}.service`,
        description: `Worldlens server ${plan.serverId} owner ${plan.ownerId} launch ${launch}`, argv });
}

export function parseSshProcessStatus(
    stdout: string, identity: { unitName: string; description: string }, checkedAt: string,
): Answer<SshProcessSnapshot> {
    if (stdout.length > 16_384 || /[\x00-\x08\x0b-\x1f\x7f]/u.test(stdout.replaceAll("\r\n", "\n")))
        return fail("command-failed", "The remote service status was malformed.");
    const properties = new Map<string, string>();
    for (const line of stdout.replaceAll("\r\n", "\n").split("\n")) {
        if (!line) continue;
        const split = line.indexOf("=");
        const key = line.slice(0, split);
        if (split < 1 || !PROPERTIES.includes(key as typeof PROPERTIES[number]) || properties.has(key))
            return fail("command-failed", "The remote service status was incomplete or ambiguous.");
        properties.set(key, line.slice(split + 1));
    }
    if (PROPERTIES.some((key) => !properties.has(key)) || properties.get("Id") !== identity.unitName)
        return fail("command-failed", "The remote service status did not identify the exact requested unit.");
    const absent = properties.get("LoadState") === "not-found";
    if (!absent && (properties.get("LoadState") !== "loaded" || properties.get("Description") !== identity.description))
        return fail("denied", "That remote service does not match this server's saved ownership identity.");
    const pidText = properties.get("MainPID")!;
    const pid = Number(pidText);
    if (!/^(0|[1-9][0-9]*)$/u.test(pidText) || !Number.isSafeInteger(pid) || pid > 4_194_304)
        return fail("command-failed", "The remote service returned an invalid process identity.");
    const active = properties.get("ActiveState");
    const sub = properties.get("SubState");
    const invocation = properties.get("InvocationID")!;
    if (absent && (pid !== 0 || active !== "inactive"))
        return fail("command-failed", "The remote service absence result contradicts its process state.");
    const running = !absent && active === "active" && sub === "running" && pid > 0;
    if (pid > 0 && !INVOCATION.test(invocation))
        return fail("command-failed", "The remote process has no valid invocation identity.");
    const stopped = pid === 0 && ["inactive", "failed"].includes(active ?? "");
    const code = properties.get("ExecMainCode");
    const exit = properties.get("ExecMainStatus")!;
    return ok({ unitName: identity.unitName, mainPid: pid, invocationId: INVOCATION.test(invocation) ? invocation : null,
        state: absent ? "absent" : running ? "running" : stopped ? "exited" : "unknown",
        running, startedAt: null, exitCode: stopped && code === "1" && /^(0|[1-9][0-9]{0,2})$/u.test(exit) && Number(exit) <= 255 ? Number(exit) : null,
        checkedAt });
}

export function createSshProcessLifecycle(options: {
    readonly plan: SshProcessPlan;
    readonly ssh: SshOptionsInput;
    readonly runner?: CommandRunner;
    readonly now?: () => string;
    readonly clock?: () => number;
    readonly wait?: (milliseconds: number) => Promise<void>;
    /** Sends Minecraft's own stop command through the authenticated, instance-bound console.
     * The consumer must honour cancellation and deadline before writing, and settle on
     * abort. The operation lock is retained until it settles, never released by racing
     * an uncancelled writer. A snapshot alone does not bind a console to an invocation. */
    readonly sendStop?: (identity: SshProcessSnapshot, request: {
        readonly deadline: number; readonly timeoutMs: number; readonly signal: AbortSignal;
    }) => Promise<Answer<void>>;
}): Answer<SshProcessLifecycle> {
    if (!validateTarget(options.ssh.target).ok ||
        [options.ssh.knownHostsFile, options.ssh.userKnownHostsFile].some((path) =>
            path !== undefined && path !== null && (!path || /[\x00-\x1f\x7f"]/u.test(path))))
        return fail("invalid-request", "The SSH target or host trust configuration is invalid.");
    const resolved = sshProcessIdentity(options.plan);
    if (!resolved.ok) return resolved;
    const identity = resolved.value;
    const remote = sshCommandRunner({ ...options.ssh, ...(options.runner ? { runner: options.runner } : {}) });
    const now = options.now ?? (() => new Date().toISOString());
    const clock = options.clock ?? Date.now;
    const wait = options.wait ?? ((milliseconds) => new Promise((done) => setTimeout(done, milliseconds)));
    const lock = `${options.plan.hostId}/${identity.unitName}`;
    const commandFailure = (output: CommandOutput): Answer<never> => fail(
        output.spawnError === "SSH" ? "unreachable" : output.spawnError === "ENOENT" ? "unsupported" : "command-failed",
        output.spawnError === "SSH" ? "The SSH host could not be reached; the server state is unknown."
            : "The remote process service command could not be completed.");
    async function run(command: string, args: readonly string[], deadline?: number): Promise<Answer<CommandOutput>> {
        const remaining = deadline === undefined ? 15_000 : Math.min(15_000, deadline - clock());
        if (remaining <= 0) return fail("timeout", "The remote operation deadline expired; the server state is unknown.");
        try { return ok(await remote(command, args, { timeoutMs: remaining })); }
        catch { return fail("unreachable", "The SSH process request did not complete; the server state is unknown."); }
    }
    async function serviceStatus(deadline?: number): Promise<Answer<SshProcessSnapshot>> {
        const result = await run("systemctl", ["--user", "show", "--no-pager", `--property=${PROPERTIES.join(",")}`, "--", identity.unitName], deadline);
        if (!result.ok) return result;
        if (result.value.spawnError !== null) return commandFailure(result.value);
        const parsed = parseSshProcessStatus(result.value.stdout, identity, now());
        if (!parsed.ok) return result.value.ok ? parsed : commandFailure(result.value);
        if (!result.value.ok && parsed.value.state !== "absent") return commandFailure(result.value);
        return parsed;
    }
    async function status(deadline?: number): Promise<Answer<SshProcessSnapshot>> {
        const parsed = await serviceStatus(deadline);
        if (!parsed.ok) return parsed;
        if (parsed.value.mainPid > 0) {
            const pid = parsed.value.mainPid;
            const executable = await run("readlink", ["-e", "--", `/proc/${pid}/exe`], deadline);
            const folder = await run("readlink", ["-e", "--", `/proc/${pid}/cwd`], deadline);
            const argv = await run("base64", ["-w0", "--", `/proc/${pid}/cmdline`], deadline);
            for (const answer of [executable, folder, argv]) {
                if (!answer.ok) return answer;
                if (!answer.value.ok) return commandFailure(answer.value);
            }
            if (!executable.ok || !folder.ok || !argv.ok) return fail("unreachable", "Remote process verification did not complete.");
            const encoded = argv.value.stdout.trim();
            if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(encoded) || encoded.length > 16_384 ||
                Buffer.from(encoded, "base64").toString("base64") !== encoded ||
                executable.value.stdout !== `${options.plan.javaPath}\n` ||
                folder.value.stdout !== `${options.plan.serverDir}\n` ||
                Buffer.from(encoded, "base64").toString("utf8") !== `${identity.argv.join("\0")}\0`) {
                return fail("denied", "The remote process executable, folder or arguments changed identity.");
            }
            const confirmed = await serviceStatus(deadline);
            if (!confirmed.ok) return confirmed;
            if (!same(parsed.value, confirmed.value) || parsed.value.state !== confirmed.value.state)
                return fail("stale-document", "The remote invocation changed during process verification.");
        }
        return parsed;
    }
    async function exclusive(action: () => Promise<Answer<SshProcessSnapshot>>): Promise<Answer<SshProcessSnapshot>> {
        if (operations.has(lock)) return fail("busy", "An operation for this SSH server is already pending.");
        operations.add(lock);
        try { return await action(); }
        catch { return fail("unreachable", "The SSH process operation did not complete; inspect its state before retrying."); }
        finally { operations.delete(lock); }
    }
    const same = (left: SshProcessSnapshot, right: SshProcessSnapshot) => left.unitName === right.unitName &&
        left.mainPid === right.mainPid && left.invocationId === right.invocationId;
    return ok({ unitName: identity.unitName, status,
        start: () => exclusive(async () => {
            const current = await status();
            if (!current.ok) return current;
            if (current.value.running) return current;
            if (current.value.state !== "absent") return fail("busy", "The previous remote unit has not been released; no second process was started.");
            const version = await run("systemd-run", ["--version"]);
            if (!version.ok) return version;
            const major = /^systemd ([0-9]+)\b/u.exec(version.value.stdout)?.[1];
            if (!version.value.ok || !major || Number(major) < 254)
                return fail("unsupported", "This SSH process route needs systemd 254 or newer.");
            const lingering = await run("loginctl", ["show-user", options.ssh.target.user, "--property=Linger", "--value"]);
            if (!lingering.ok) return lingering;
            if (!lingering.value.ok || lingering.value.stdout.trim() !== "yes")
                return fail("unsupported", "The SSH user's persistent service manager must be enabled before creating a durable server.");
            const launched = await run("systemd-run", ["--user", "--collect", `--unit=${identity.unitName}`,
                `--description=${identity.description}`, "--expand-environment=no", "--property=Type=exec",
                "--property=Restart=no", "--property=SendSIGKILL=no", `--working-directory=${options.plan.serverDir}`,
                "--", ...identity.argv]);
            if (!launched.ok) return launched;
            if (!launched.value.ok) return commandFailure(launched.value);
            // Command success proves exec, not Minecraft readiness. Inspect the actual
            // managed process rather than marking it running on the command's say-so.
            return status();
        }),
        stop: (expected, stopOptions) => exclusive(async () => {
            if (!Number.isSafeInteger(stopOptions.timeoutMs) || stopOptions.timeoutMs < 0 || stopOptions.timeoutMs > 300_000)
                return fail("invalid-request", "The remote stop deadline is invalid.");
            // A unit-name signal is not atomic with InvocationID verification. Until a
            // host-side process-bound termination primitive exists, do not offer it.
            if (!stopOptions.graceful) return fail("unsupported", "Forced SSH-process shutdown needs atomic process ownership protection.");
            const deadline = clock() + stopOptions.timeoutMs;
            const current = await status(deadline);
            if (!current.ok) return current;
            if (!same(expected, current.value)) return fail("stale-document", "The remote server invocation changed; this stop request was cancelled.");
            if (current.value.state === "absent" || current.value.state === "exited") return current;
            if (!current.value.running) return fail("busy", "The remote process state is not stable enough to stop safely.");
            if (stopOptions.graceful) {
                if (!options.sendStop) return fail("unsupported", "Graceful remote shutdown needs this server's authenticated console.");
                const remaining = deadline - clock();
                if (remaining <= 0) return fail("timeout", "The stop deadline expired before console delivery; no command was sent.");
                const cancellation = new AbortController();
                const timer = setTimeout(() => cancellation.abort(), remaining);
                let sent: Answer<void>;
                try { sent = await options.sendStop(current.value, { deadline, timeoutMs: remaining, signal: cancellation.signal }); }
                finally { clearTimeout(timer); }
                if (cancellation.signal.aborted || clock() >= deadline)
                    return fail("timeout", "The console delivery deadline expired; inspect the server state before retrying.");
                if (!sent.ok) return sent;
            }
            for (let attempt = 0; attempt < 601; attempt++) {
                const observed = await status(deadline);
                if (!observed.ok) return observed;
                if (observed.value.invocationId !== null && observed.value.invocationId !== current.value.invocationId)
                    return fail("stale-document", "A new remote invocation appeared; it was not stopped by this request.");
                if (observed.value.state === "absent" || (observed.value.state === "exited" && observed.value.mainPid === 0)) return observed;
                if (!same(current.value, observed.value)) return fail("stale-document", "A new remote invocation appeared; it was not stopped by this request.");
                if (clock() >= deadline) return fail("timeout", "The server has not confirmed shutdown. It was left running without forced escalation.");
                await wait(Math.min(500, Math.max(0, deadline - clock())));
            }
            return fail("timeout", "Remote shutdown observation ended without confirming exit.");
        }),
    });
}
