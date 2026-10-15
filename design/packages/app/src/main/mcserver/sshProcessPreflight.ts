/**
 * Read-only readiness for a saved Linux SSH host. No directory creation, trust changes,
 * downloads, service creation, ownership identifiers or registry writes occur here.
 * Observations expire immediately: a later installer must revalidate its own inputs.
 */
import { posix } from "node:path";
import type {
    SshProcessPreflightRequest,
    SshProcessPreflightReport,
    SshProcessReadinessStage,
} from "@worldlens/shared";
import { parseJavaVersion } from "../java/version.js";
import { classifySshOutput, remoteCommandLine, sshScriptArguments } from "../remote/ssh.js";
import {
    execFileCommandRunner,
    type CommandOutput,
    type CommandRunner,
} from "../runtime/command.js";
import { requiredJavaFeature } from "./flavours/javaRequirement.js";
import type { CatalogueSnapshot } from "./flavours/catalogue.js";
import type { HostProfileStore } from "./hostProfiles.js";
import { fail, ok, type Answer } from "./transport/types.js";

const MAX_OUTPUT = 65_536;
export const SSH_PREFLIGHT_TIMEOUT_MS = 30_000;
export const SSH_PREFLIGHT_MINIMUM_FREE_BYTES = 1024 ** 3;
const REQUEST_FIELDS = new Set(["hostId", "minecraftVersion", "memoryMb", "port"]);

export function parseSshProcessPreflightRequest(
    value: unknown,
): Answer<SshProcessPreflightRequest> {
    if (value === null || typeof value !== "object" || Array.isArray(value))
        return fail("invalid-request", "The SSH process readiness request is invalid.");
    const body = value as Record<string, unknown>;
    if (
        Object.keys(body).some((key) => !REQUEST_FIELDS.has(key)) ||
        typeof body.hostId !== "string" ||
        !/^[a-z][a-z0-9-]{0,62}$/u.test(body.hostId) ||
        typeof body.minecraftVersion !== "string" ||
        !/^1\.[0-9]{1,2}(?:\.[0-9]{1,3})?$/u.test(body.minecraftVersion) ||
        typeof body.memoryMb !== "number" ||
        !Number.isSafeInteger(body.memoryMb) ||
        body.memoryMb < 512 ||
        body.memoryMb > 1_048_576 ||
        typeof body.port !== "number" ||
        !Number.isSafeInteger(body.port) ||
        body.port < 1024 ||
        body.port > 65535
    )
        return fail(
            "invalid-request",
            "Choose a saved host, a recognized release version, 512 MB or more of memory and an unprivileged port.",
        );
    const requirement = requiredJavaFeature(body.minecraftVersion);
    if (!requirement.known)
        return fail(
            "unsupported",
            "This release has no verified Java requirement for SSH-process readiness.",
        );
    return ok({
        hostId: body.hostId,
        minecraftVersion: body.minecraftVersion,
        memoryMb: body.memoryMb,
        port: body.port,
    });
}

function canonicalPath(value: string): boolean {
    return (
        value.startsWith("/") &&
        value !== "/" &&
        value.length <= 2048 &&
        posix.normalize(value) === value &&
        !/[\x00-\x1f\x7f%]/u.test(value)
    );
}

export async function preflightSshProcessCreation(
    request: unknown,
    options: {
        readonly hostProfiles: HostProfileStore;
        readonly readCatalogue: () => Promise<CatalogueSnapshot | null>;
        readonly runner?: CommandRunner;
        readonly ssh?: string;
        readonly now?: () => string;
        readonly signal?: AbortSignal;
    },
): Promise<Answer<SshProcessPreflightReport>> {
    const parsed = parseSshProcessPreflightRequest(request);
    if (!parsed.ok) return parsed;
    const input = parsed.value;
    const catalogue = await options.readCatalogue();
    const entry = catalogue?.flavours
        .find((item) => item.flavour === "vanilla")
        ?.versions.find(
            (item) =>
                item.version === input.minecraftVersion &&
                item.stability === "release" &&
                item.availability !== "missing-server-artifact",
        );
    if (
        catalogue === null ||
        entry === undefined ||
        !Number.isSafeInteger(entry.javaFeature) ||
        entry.javaFeature < 8 ||
        entry.javaFeature > 100
    )
        return fail(
            "unsupported",
            "Refresh the version catalogue in the wizard, then choose a published Java release before checking SSH readiness.",
        );
    const requirement = { feature: entry.javaFeature };
    const saved = await options.hostProfiles.get(input.hostId);
    if (!saved.ok) return saved;
    // Snapshot before awaiting a probe. The store may be edited while SSH is pending.
    const profileSnapshot = JSON.stringify(saved.value);
    const profileUpdatedAt = saved.value.updatedAt;
    const ssh = options.hostProfiles.sshHost(input.hostId);
    if (ssh === null || ssh.target.id !== input.hostId)
        return fail(
            "not-found",
            "The selected saved SSH profile is unavailable or has a different identity.",
        );
    const connection = { ...ssh, target: { ...ssh.target } };
    const runner = options.runner ?? execFileCommandRunner;
    const checks: SshProcessPreflightReport["checks"][number][] = [];
    let javaPath: string | null = null;
    let javaFeature: number | null = null;
    let serverParent: string | null = null;
    let freeBytes: number | null = null;
    let availableMemoryMb: number | null = null;
    const deadline = Date.now() + SSH_PREFLIGHT_TIMEOUT_MS;
    const cancellation = new AbortController();
    const abort = () => cancellation.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) cancellation.abort();
    const timer = setTimeout(abort, SSH_PREFLIGHT_TIMEOUT_MS);
    const interrupted = new Promise<never>((_, reject) => {
        cancellation.signal.addEventListener("abort", () => reject(new Error("interrupted")), {
            once: true,
        });
    });
    // A pending cancellation can precede the first command. Avoid an unhandled rejection.
    void interrupted.catch(() => undefined);
    const mark = (
        stage: SshProcessReadinessStage,
        state: "passed" | "blocked" | "unknown",
        code: string,
    ) => {
        checks.push({ stage, state, code });
    };
    const report = async (): Promise<Answer<SshProcessPreflightReport>> => {
        const current = await options.hostProfiles.get(input.hostId);
        if (!current.ok || JSON.stringify(current.value) !== profileSnapshot)
            return fail(
                "stale-document",
                "The saved SSH profile changed during readiness checks. Check the selected host again.",
            );
        return ok({
            kind: "ssh-process",
            hostId: input.hostId,
            profileUpdatedAt,
            catalogueFetchedAt: catalogue.fetchedAt,
            checkedAt: (options.now ?? (() => new Date().toISOString()))(),
            ready: checks.length === 8 && checks.every((check) => check.state === "passed"),
            canCreate: false,
            checks,
            requiredJavaFeature: requirement.feature,
            javaFeature,
            javaPath,
            serverParent,
            availableMemoryMb,
            freeBytes,
            minimumFreeBytes: SSH_PREFLIGHT_MINIMUM_FREE_BYTES,
        });
    };
    let activeStage: SshProcessReadinessStage = "ssh";
    async function run(
        stage: SshProcessReadinessStage,
        command: string,
        args: readonly string[] = [],
    ): Promise<CommandOutput> {
        activeStage = stage;
        if (cancellation.signal.aborted || Date.now() >= deadline) throw new Error("interrupted");
        const result = await Promise.race([
            runner(
                options.ssh ?? "ssh",
                sshScriptArguments(connection, remoteCommandLine([command, ...args])),
                { timeoutMs: Math.max(1, deadline - Date.now()), signal: cancellation.signal },
            ),
            interrupted,
        ]);
        if (cancellation.signal.aborted || Date.now() >= deadline) throw new Error("interrupted");
        if (Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr) > MAX_OUTPUT)
            throw new Error("oversized");
        if (stage !== "ssh" && !["ok", "remote-failed"].includes(classifySshOutput(result)))
            throw new Error("connection-lost");
        return result;
    }
    const passed = (stage: SshProcessReadinessStage) => mark(stage, "passed", "ready");
    const blocked = async (stage: SshProcessReadinessStage, code: string, unknown = false) => {
        mark(stage, unknown ? "unknown" : "blocked", code);
        return report();
    };
    try {
        const connected = await run("ssh", "printf", ["%s", "worldlens-readiness-v1"]);
        const outcome = classifySshOutput(connected);
        if (outcome !== "ok") return await blocked("ssh", outcome);
        if (connected.stdout !== "worldlens-readiness-v1")
            return await blocked("ssh", "invalid-response", true);
        passed("ssh");
        const platform = await run("platform", "uname", ["-s"]);
        if (!platform.ok || platform.stdout.trim() !== "Linux")
            return await blocked("platform", "linux-required");
        passed("platform");
        const version = await run("supervisor", "systemd-run", ["--version"]);
        const major = /^systemd ([0-9]+)\b/u.exec(version.stdout)?.[1];
        if (!version.ok || major === undefined || Number(major) < 254)
            return await blocked("supervisor", "systemd-254-required");
        const manager = await run("supervisor", "systemctl", [
            "--user",
            "show",
            "--property=Version",
            "--value",
        ]);
        if (!manager.ok || manager.stdout.trim() === "")
            return await blocked("supervisor", "user-manager-unavailable");
        const linger = await run("supervisor", "loginctl", [
            "show-user",
            connection.target.user,
            "--property=Linger",
            "--value",
        ]);
        if (!linger.ok || linger.stdout.trim() !== "yes")
            return await blocked("supervisor", "lingering-required");
        passed("supervisor");
        const home = await run("directory", "printenv", ["HOME"]);
        if (!home.ok) return await blocked("directory", "home-unavailable", true);
        const homePath = home.stdout.replace(/\r?\n$/u, "");
        const configured = connection.target.workDir;
        const parent =
            configured === "~"
                ? homePath
                : configured.startsWith("~/")
                  ? `${homePath}/${configured.slice(2)}`
                  : configured;
        if (!canonicalPath(parent)) return await blocked("directory", "unsafe-directory");
        const resolved = await run("directory", "readlink", ["-e", "--", parent]);
        const realPath = resolved.stdout.replace(/\r?\n$/u, "");
        if (!resolved.ok || !canonicalPath(realPath) || realPath !== parent)
            return await blocked("directory", "existing-canonical-directory-required");
        const directory = await run("directory", "test", ["-d", parent]);
        const writable = await run("directory", "test", ["-w", parent]);
        const searchable = await run("directory", "test", ["-x", parent]);
        if (!directory.ok || !writable.ok || !searchable.ok)
            return await blocked("directory", "writable-directory-required");
        serverParent = parent;
        passed("directory");
        // `command` is a shell builtin; the snippet is fixed and contains no renderer data.
        const java = await run("java", "sh", ["-c", "command -v java"]);
        const candidate = java.stdout.replace(/\r?\n$/u, "");
        if (!java.ok || !canonicalPath(candidate)) return await blocked("java", "java-unavailable");
        const binary = await run("java", "readlink", ["-e", "--", candidate]);
        const executable = binary.stdout.replace(/\r?\n$/u, "");
        if (!binary.ok || !canonicalPath(executable))
            return await blocked("java", "java-unavailable");
        const banner = await run("java", executable, ["-XX:-UsePerfData", "-version"]);
        const info = parseJavaVersion(`${banner.stdout}\n${banner.stderr}`);
        if (
            !banner.ok ||
            info === null ||
            !Number.isSafeInteger(info.feature) ||
            info.feature < 8 ||
            info.feature > 100 ||
            !/^(?:1\.)?[0-9]+(?:[._][0-9]+)*(?:[-+][0-9A-Za-z]+(?:[._-][0-9A-Za-z]+)*)?$/u.test(
                info.version,
            )
        )
            return await blocked("java", "java-unrecognized", true);
        javaPath = executable;
        javaFeature = info.feature;
        if (info.feature < requirement.feature) return await blocked("java", "java-too-old");
        passed("java");
        const memory = await run("memory", "cat", ["/proc/meminfo"]);
        const available = /^MemAvailable:\s+([0-9]+) kB$/mu.exec(memory.stdout)?.[1];
        const memoryKb = Number(available);
        if (!memory.ok || available === undefined || !Number.isSafeInteger(memoryKb))
            return await blocked("memory", "memory-unavailable", true);
        availableMemoryMb = Math.floor(memoryKb / 1024);
        if (availableMemoryMb < input.memoryMb + 1024)
            return await blocked("memory", "insufficient-memory");
        passed("memory");
        const disk = await run("disk", "df", ["-Pk", "--", parent]);
        const rows = disk.stdout.trim().split(/\r?\n/u);
        const diskKbText = rows.length === 2 ? rows[1]?.trim().split(/\s+/u)[3] : undefined;
        const diskKb = Number(diskKbText);
        if (
            !disk.ok ||
            diskKbText === undefined ||
            !/^[0-9]+$/u.test(diskKbText) ||
            !Number.isSafeInteger(diskKb * 1024)
        )
            return await blocked("disk", "disk-unavailable", true);
        freeBytes = diskKb * 1024;
        if (freeBytes < SSH_PREFLIGHT_MINIMUM_FREE_BYTES)
            return await blocked("disk", "insufficient-disk");
        passed("disk");
        const port = await run("port", "ss", ["-H", "-ltn", `sport = :${input.port}`]);
        if (!port.ok) return await blocked("port", "port-unavailable", true);
        if (port.stdout.trim() !== "") return await blocked("port", "port-occupied");
        passed("port");
        return await report();
    } catch {
        mark(
            activeStage,
            "unknown",
            options.signal?.aborted
                ? "cancelled"
                : Date.now() >= deadline
                  ? "timeout"
                  : "observation-failed",
        );
        return await report();
    } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", abort);
    }
}
