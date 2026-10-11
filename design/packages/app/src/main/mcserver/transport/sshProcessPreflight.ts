/** Read-only, point-in-time Linux host observations. No installation authority is created. */
import { posix } from "node:path";
import { sshCommandRunner, type SshOptionsInput } from "../../remote/ssh.js";
import { validateTarget } from "../../remote/target.js";
import type { CommandOutput, CommandRunner } from "../../runtime/command.js";
import { fail, ok, type Answer } from "./types.js";

export interface SshProcessPreflightRequest {
    readonly hostId: string;
    readonly parentDirectory: string;
    readonly javaPath: string;
    readonly memoryMb: number;
    readonly port: number;
    readonly flavour: string;
    readonly version: string;
}
export type ReadinessCheckId = "platform" | "systemd" | "user-manager" | "linger" | "directory" | "java" | "memory" | "disk" | "port";
export interface ReadinessCheck {
    readonly id: ReadinessCheckId;
    readonly state: "ready" | "blocked" | "unknown";
    readonly reason: string;
    readonly observed?: string | number;
}
export interface SshProcessPreflightResult {
    readonly request: SshProcessPreflightRequest;
    readonly checkedAt: string;
    readonly requiredJavaFeature: number | null;
    readonly checks: readonly ReadinessCheck[];
    readonly installationAvailable: false;
}
const IDS: readonly ReadinessCheckId[] = ["platform", "systemd", "user-manager", "linger", "directory", "java", "memory", "disk", "port"];
const activeHosts = new Set<string>();
const pathIsCanonical = (v: unknown): v is string => typeof v === "string" && v.length <= 2048 &&
    v.startsWith("/") && v !== "/" && posix.normalize(v) === v && !/[\x00-\x1f\x7f%]/u.test(v);

export function parseSshProcessPreflightRequest(value: unknown): SshProcessPreflightRequest | null {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const r = value as Record<string, unknown>;
    if (Object.keys(r).some((key) => !["hostId", "parentDirectory", "javaPath", "memoryMb", "port", "flavour", "version"].includes(key)) ||
        typeof r.hostId !== "string" || !/^[a-z][a-z0-9-]{0,62}$/u.test(r.hostId) ||
        !pathIsCanonical(r.parentDirectory) || !pathIsCanonical(r.javaPath) ||
        typeof r.memoryMb !== "number" || !Number.isSafeInteger(r.memoryMb) || r.memoryMb < 128 || r.memoryMb > 1_048_576 ||
        typeof r.port !== "number" || !Number.isInteger(r.port) || r.port < 1 || r.port > 65535 ||
        typeof r.flavour !== "string" || !/^[a-z][a-z0-9-]{0,31}$/u.test(r.flavour) ||
        typeof r.version !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._+\-]{0,127}$/u.test(r.version)) return null;
    return { hostId: r.hostId, parentDirectory: r.parentDirectory, javaPath: r.javaPath,
        memoryMb: r.memoryMb, port: r.port, flavour: r.flavour, version: r.version };
}

function integer(value: string): number | null {
    if (!/^(0|[1-9][0-9]*)$/u.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function inspectSshProcessHost(options: {
    readonly request: SshProcessPreflightRequest;
    readonly ssh: SshOptionsInput;
    /** Resolved from the main-process catalogue, never trusted from the renderer. */
    readonly requiredJavaFeature: number | null;
    readonly runner?: CommandRunner;
    readonly now?: () => string;
    readonly clock?: () => number;
}): Promise<Answer<SshProcessPreflightResult>> {
    const request = parseSshProcessPreflightRequest(options.request);
    if (!request || (options.requiredJavaFeature !== null && (!Number.isInteger(options.requiredJavaFeature) || options.requiredJavaFeature < 1 || options.requiredJavaFeature > 100)) ||
        options.ssh.target.id !== request.hostId || !validateTarget(options.ssh.target).ok ||
        [options.ssh.knownHostsFile, options.ssh.userKnownHostsFile].some((p) => p !== undefined && p !== null &&
            (!p || /[\x00-\x1f\x7f"]/u.test(p))))
        return fail("invalid-request", "The SSH readiness request or saved host trust configuration is invalid.");
    if (activeHosts.has(request.hostId)) return fail("unsupported", "A readiness check is already running for this host.");
    activeHosts.add(request.hostId);
    const remote = sshCommandRunner({ ...options.ssh, connectTimeoutSeconds: 5,
        ...(options.runner === undefined ? {} : { runner: options.runner }) });
    const clock = options.clock ?? Date.now;
    const deadline = clock() + 45_000;
    const checks = new Map<ReadinessCheckId, ReadinessCheck>();
    const record = (id: ReadinessCheckId, state: ReadinessCheck["state"], reason: string, observed?: string | number) => {
        checks.set(id, { id, state, reason, ...(observed === undefined ? {} : { observed }) });
    };
    const run = async (command: string, args: readonly string[]): Promise<CommandOutput | null> => {
        const remaining = deadline - clock();
        if (remaining <= 0) return null;
        try {
            const out = await remote(command, args, { timeoutMs: Math.min(5_000, remaining) });
            if (out.spawnError || out.exitCode === 255 || out.stdout.length + out.stderr.length > 32_768) return null;
            return out;
        } catch { return null; }
    };
    try {
        const platform = await run("uname", ["-s"]);
        if (platform?.ok && platform.stdout.trim() === "Linux") {
            record("platform", "ready", "linux", "Linux");
            const systemd = await run("systemd-run", ["--version"]);
            const systemdVersion = systemd?.ok ? /^systemd ([0-9]+)\b/u.exec(systemd.stdout)?.[1] : undefined;
            const sd = systemdVersion === undefined ? null : integer(systemdVersion);
            record("systemd", sd === null ? "unknown" : sd >= 254 ? "ready" : "blocked", "systemd-254-required", sd ?? undefined);
            const manager = await run("systemctl", ["--user", "show", "--property=Version", "--value", "--no-pager"]);
            const managerVersion = manager?.ok ? /^([0-9]+)(?:[. -][^\r\n]*)?\n?$/u.exec(manager.stdout)?.[1] : undefined;
            const mv = managerVersion === undefined ? null : integer(managerVersion);
            record("user-manager", mv === null ? "unknown" : mv >= 254 ? "ready" : "blocked", "user-manager-running", mv ?? undefined);
            const user = await run("id", ["-un"]);
            const username = user?.ok && /^[a-zA-Z_][a-zA-Z0-9_.-]{0,63}\$?\n?$/u.test(user.stdout) ? user.stdout.trim() : null;
            const linger = username === null || username !== options.ssh.target.user ? null : await run("loginctl", ["show-user", username, "--property=Linger", "--value"]);
            const lingerValue = linger?.ok ? linger.stdout.trim() : null;
            record("linger", lingerValue === "yes" ? "ready" : lingerValue === "no" ? "blocked" : "unknown", "linger-required",
                lingerValue === "yes" || lingerValue === "no" ? lingerValue : undefined);

            const real = await run("realpath", ["--canonicalize-existing", "--physical", "--", request.parentDirectory]);
            if (real?.ok && real.stdout === request.parentDirectory + "\n") {
                const directory = await run("test", ["-d", request.parentDirectory]);
                const writable = directory?.ok ? await run("test", ["-w", request.parentDirectory]) : null;
                const searchable = writable?.ok ? await run("test", ["-x", request.parentDirectory]) : null;
                record("directory", searchable?.ok ? "ready" : directory?.exitCode === 1 || writable?.exitCode === 1 || searchable?.exitCode === 1 ? "blocked" : "unknown", "existing-canonical-writable-parent");
            } else record("directory", real !== null && real.ok ? "blocked" : "unknown", "existing-canonical-writable-parent");

            const javaResolved = await run("realpath", ["--canonicalize-existing", "--physical", "--", request.javaPath]);
            const canonicalJava = javaResolved?.ok && javaResolved.stdout.endsWith("\n") ? javaResolved.stdout.slice(0, -1) : null;
            const java = canonicalJava !== null && pathIsCanonical(canonicalJava) ? await run(canonicalJava, ["-version"]) : null;
            const javaMatches = java?.ok ? [...(java.stdout + "\n" + java.stderr).matchAll(/^(?:openjdk|java) version "(?:1\.([0-9]+)|([0-9]+))(?=[.\-+_"])/gm)] : [];
            const javaMatch = javaMatches.length === 1 ? javaMatches[0] : null;
            const feature = javaMatch ? integer(javaMatch[1] ?? javaMatch[2] ?? "") : null;
            const required = options.requiredJavaFeature;
            record("java", feature === null || required === null ? "unknown" : feature === required ? "ready" : "blocked", "catalogue-java-feature-required", feature ?? undefined);

            const memory = await run("cat", ["--", "/proc/meminfo"]);
            const availableRows = memory?.ok ? [...memory.stdout.matchAll(/^MemAvailable:\s+([0-9]+) kB\s*$/gm)] : [];
            const kb = availableRows.length === 1 ? integer(availableRows[0]?.[1] ?? "") : null;
            const mb = kb === null ? null : Math.floor(kb / 1024);
            record("memory", mb === null ? "unknown" : mb >= request.memoryMb + 512 ? "ready" : "blocked", "available-memory-plus-512-mib-reserve", mb ?? undefined);

            const disk = await run("env", ["LC_ALL=C", "df", "--block-size=1", "--output=avail", "--", request.parentDirectory]);
            const diskLines = disk?.ok ? disk.stdout.trim().split(/\r?\n/u) : [];
            const freeBytes = diskLines.length === 2 && diskLines[0]?.trim() === "Avail" ? integer(diskLines[1]?.trim() ?? "") : null;
            record("disk", freeBytes === null ? "unknown" : freeBytes > 0 ? "ready" : "blocked", "free-bytes-observed-not-size-estimate", freeBytes ?? undefined);

            const ports = await run("ss", ["-H", "-l", "-t", "-n", "sport", "=", `:${request.port}`]);
            const listeners = ports?.ok ? ports.stdout.trim() : null;
            record("port", listeners === "" ? "ready" : listeners !== null && listeners.split(/\r?\n/u).every((line) => /^LISTEN\s/u.test(line)) ? "blocked" : "unknown", "tcp-listener-snapshot");
        } else record("platform", platform?.ok ? "blocked" : "unknown", "linux-required");
        return ok({ request, checkedAt: (options.now ?? (() => new Date().toISOString()))(),
            requiredJavaFeature: options.requiredJavaFeature, installationAvailable: false,
            checks: IDS.map((id) => checks.get(id) ?? { id, state: "unknown", reason: "not-observed" }) });
    } finally { activeHosts.delete(request.hostId); }
}
