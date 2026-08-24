/**
 * A server in a container on somebody else's machine, reached over SSH.
 *
 * This file is short, and that is the entire point of the seam. There is no remote copy of
 * the container lifecycle, the config reads, the write guard or the log replay - all of it
 * is `dockerTransport.ts`, unchanged, because `remote/ssh.ts` already hands out a
 * `sshCommandRunner` that IS a `CommandRunner`. Running `docker inspect` on a machine in
 * another country is the same code as running it here, with one substitution.
 *
 * Two things genuinely differ, and both are about bytes rather than behaviour.
 *
 * `docker cp` stages onto the DAEMON's machine, which for this transport is the remote
 * one, so the staged file then has to cross the network. That is `scp`, not the command
 * runner: `CommandOutput.stdout` is a string, and a jar or a region file that passes
 * through one arrives with every invalid UTF-8 sequence replaced by U+FFFD. The corruption
 * is silent and one-way, so the design avoids the possibility rather than trying to be
 * careful about it.
 *
 * And a remote staging path is POSIX under the remote user's own temp directory, never a
 * path derived from this machine's `tmpdir()` - which on Windows would be a drive letter,
 * and would land nowhere useful on a Linux host.
 */

import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    execFileCommandRunner,
    type CommandOutput,
    type CommandRunner,
} from "../../runtime/command.js";
import { scpArguments, scpRemotePath, sshCommandRunner, type SshOptionsInput } from "../../remote/ssh.js";
import { createDockerTransport, type FileChannel } from "./dockerTransport.js";
import { fail, ok, type Answer, type ServerTransport, type TransportCapabilities } from "./types.js";

export interface SshDockerOptions extends SshOptionsInput {
    /** Stable id of the configured host, carried on the ref so the UI can name it. */
    readonly hostId: string;
    readonly containerRef: string;
    readonly serverDir: string;
    readonly docker?: string;
    readonly writeScope?: readonly string[];
    readonly now?: () => string;
    readonly capabilities?: Partial<TransportCapabilities>;
    /** The local `scp` binary, and the runner that launches it. Both injected for tests. */
    readonly scp?: string;
    readonly runner?: CommandRunner;
}

interface RestoreFile {
    readonly relative: string;
    readonly bytes: number;
    readonly sha256: string;
}

export const RESTORE_LIMITS = Object.freeze({
    maxEntries: 100_000,
    maxDirectories: 20_000,
    maxDepth: 32,
    maxIndividualBytes: 2 * 1024 * 1024 * 1024,
    maxAggregateBytes: 20 * 1024 * 1024 * 1024,
    maxPathBytes: 4_096,
});

async function hashFile(full: string, signal?: AbortSignal): Promise<Answer<{ bytes: number; sha256: string }>> {
    try {
        const digest = createHash("sha256");
        let bytes = 0;
        for await (const chunk of createReadStream(full)) {
            if (signal?.aborted) return fail("timeout", "The restore was cancelled while hashing a file.");
            const value = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk as Buffer);
            bytes += value.byteLength;
            if (bytes > RESTORE_LIMITS.maxIndividualBytes) return fail("invalid-request", "A restore file exceeds the individual size limit.");
            digest.update(value);
        }
        return ok({ bytes, sha256: digest.digest("hex") });
    } catch (error) {
        return fail("denied", "A staged restore file could not be read.", String(error));
    }
}

export async function localRestoreManifest(root: string, signal?: AbortSignal): Promise<Answer<readonly RestoreFile[]>> {
    const files: RestoreFile[] = [];
    let directories = 0;
    let aggregateBytes = 0;
    const walk = async (folder: string, prefix: string, depth: number): Promise<Answer<void>> => {
        if (signal?.aborted) return fail("timeout", "The restore was cancelled while validating its manifest.");
        if (depth > RESTORE_LIMITS.maxDepth) return fail("invalid-request", "The restore directory depth exceeds the safety limit.");
        directories += 1;
        if (directories > RESTORE_LIMITS.maxDirectories) return fail("invalid-request", "The restore contains too many directories.");
        let entries;
        try {
            entries = await readdir(folder, { withFileTypes: true });
        } catch (error) {
            return fail("not-found", "The staged restore folder could not be read.", String(error));
        }
        for (const entry of entries) {
            if (entry.name === "." || entry.name === ".." || /[\\/\0\r\n]/.test(entry.name)) return fail("invalid-request", "The restore contains an invalid path.");
            const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
            if (Buffer.byteLength(relative, "utf8") > RESTORE_LIMITS.maxPathBytes) return fail("invalid-request", "A restore path exceeds the safety limit.");
            const full = join(folder, entry.name);
            if (entry.isSymbolicLink()) return fail("unsupported", "The restore contains a symbolic link.");
            if (entry.isDirectory()) {
                const nested = await walk(full, relative, depth + 1);
                if (!nested.ok) return nested;
                continue;
            }
            if (!entry.isFile()) return fail("unsupported", "The restore contains a non-regular file.");
            if (files.length >= RESTORE_LIMITS.maxEntries) return fail("invalid-request", "The restore contains too many files.");
            const hashed = await hashFile(full, signal);
            if (!hashed.ok) return hashed;
            aggregateBytes += hashed.value.bytes;
            if (aggregateBytes > RESTORE_LIMITS.maxAggregateBytes) return fail("invalid-request", "The restore exceeds the aggregate size limit.");
            files.push({ relative, bytes: hashed.value.bytes, sha256: hashed.value.sha256 });
        }
        return ok(undefined);
    };
    const result = await walk(root, "", 0);
    return result.ok ? ok(files) : result;
}

function safeContainerPath(path: string): boolean {
    return path.startsWith("/") && !/[\0\r\n]/.test(path) && !path.split("/").some((part) => part === ".." || part === ".");
}

/**
 * Staging across the network: `docker cp` writes on the remote host, `scp` fetches it.
 *
 * `discard` deliberately never fails the operation. A temporary file left on a remote host
 * is litter; refusing a config save because the litter could not be swept up would be a
 * worse outcome than the litter.
 */
export function createSshFileChannel(options: SshDockerOptions): FileChannel {
    const scp = options.scp ?? "scp";
    const runner = options.runner ?? execFileCommandRunner;
    const remoteRunner = sshCommandRunner({
        ...options,
        ...(options.runner === undefined ? {} : { runner: options.runner }),
    });

    const localFor = (remotePath: string): string =>
        join(tmpdir(), `worldlens-mcserver-${remotePath.split("/").pop() ?? "staged"}`);

    return {
        stagingPath(name: string): string {
            // POSIX, under the remote user's own temp directory. Deriving this from the
            // local `tmpdir()` would put a Windows drive letter into a Linux path.
            return `/tmp/worldlens-mcserver-${name}`;
        },
        async collect(stagedPath: string, maxBytes: number): Promise<Answer<Uint8Array>> {
            const local = localFor(stagedPath);
            const fetched = await runner(
                scp,
                [...scpArguments(options), scpRemotePath(options.target, stagedPath), local],
                { timeoutMs: 300_000 },
            );
            if (!fetched.ok) {
                return fail(
                    fetched.spawnError !== null ? "unreachable" : "command-failed",
                    "That file could not be copied back from the remote machine.",
                    `${fetched.stderr}\n${fetched.stdout}`.trim().slice(0, 2_000) || null,
                );
            }
            try {
                const bytes = await readFile(local);
                const slice = bytes.byteLength > maxBytes ? bytes.subarray(0, maxBytes) : bytes;
                return ok(new Uint8Array(slice));
            } catch (error) {
                return fail("command-failed", "That file did not arrive from the remote machine.", String(error));
            } finally {
                await rm(local, { force: true }).catch(() => {});
            }
        },
        async deposit(stagedPath: string, bytes: Uint8Array): Promise<Answer<void>> {
            const local = localFor(stagedPath);
            try {
                await writeFile(local, bytes);
            } catch (error) {
                return fail("command-failed", "That file could not be prepared for sending.", String(error));
            }
            try {
                const sent = await runner(
                    scp,
                    [...scpArguments(options), local, scpRemotePath(options.target, stagedPath)],
                    { timeoutMs: 300_000 },
                );
                if (!sent.ok) {
                    return fail(
                        sent.spawnError !== null ? "unreachable" : "command-failed",
                        "That file could not be sent to the remote machine.",
                        `${sent.stderr}\n${sent.stdout}`.trim().slice(0, 2_000) || null,
                    );
                }
                return ok(undefined);
            } finally {
                await rm(local, { force: true }).catch(() => {});
            }
        },
        async discard(stagedPath: string): Promise<void> {
            await remoteRunner("rm", ["-f", "--", stagedPath], { timeoutMs: 20_000 }).catch(() => {});
        },
    };
}

export function createSshDockerTransport(options: SshDockerOptions): ServerTransport {
    const transport = createDockerTransport({
        ref: {
            kind: "ssh-docker",
            hostId: options.hostId,
            containerRef: options.containerRef,
            serverDir: options.serverDir,
        },
        containerRef: options.containerRef,
        serverDir: options.serverDir,
        // The one substitution the whole design rests on.
        runner: sshCommandRunner({
            ...options,
            ...(options.runner === undefined ? {} : { runner: options.runner }),
        }),
        files: createSshFileChannel(options),
        ...(options.docker === undefined ? {} : { docker: options.docker }),
        ...(options.writeScope === undefined ? {} : { writeScope: options.writeScope }),
        ...(options.now === undefined ? {} : { now: options.now }),
        ...(options.capabilities === undefined ? {} : { capabilities: options.capabilities }),
    });
    const runner = options.runner ?? execFileCommandRunner;
    const remoteRunner = sshCommandRunner({ ...options, ...(options.runner === undefined ? {} : { runner: options.runner }) });
    const docker = options.docker ?? "docker";
    const scp = options.scp ?? "scp";
    const cleanupRemotePath = async (path: string, containerPath = false): Promise<Answer<void>> => {
        let last: CommandOutput | null = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const answer = containerPath
                ? await remoteRunner(docker, ["exec", options.containerRef, "rm", "-rf", "--", path], { timeoutMs: 30_000 })
                : await remoteRunner("rm", ["-rf", "--", path], { timeoutMs: 30_000 });
            if (answer.ok) return ok(undefined);
            last = answer;
        }
        return fail("command-failed", "Temporary restore data could not be cleaned up.", last === null ? null : `${last.stderr}\n${last.stdout}`.trim().slice(0, 2_000) || null);
    };
    return {
        ...transport,
        async copyDirectoryToLocal(sourceFolder, localDestination, copyOptions = {}) {
            if (!safeContainerPath(sourceFolder) || !(sourceFolder === options.serverDir || sourceFolder.startsWith(`${options.serverDir.replace(/\/$/, "")}/`))) return fail("invalid-request", "The remote backup source is outside the container scope.");
            if (copyOptions.signal?.aborted) return fail("timeout", "The remote backup was cancelled before staging.");
            await mkdir(localDestination, { recursive: true });
            const id = randomUUID();
            const remoteHostStage = `/tmp/worldlens-backup-${id}`;
            let cleanupRequired = true;
            let cleanupWarning: string | undefined;
            let result: Answer<{ cleanupWarning?: string }> = ok({});
            try {
                const copied = await remoteRunner(docker, ["cp", `${options.containerRef}:${sourceFolder}`, remoteHostStage], { timeoutMs: 300_000 });
                if (!copied.ok) {
                    result = fail("command-failed", "The remote world could not be staged for backup.", copied.stderr || copied.stdout);
                } else {
                    const fetched = await runner(scp, [...scpArguments(options, ["-r"]), `${scpRemotePath(options.target, remoteHostStage)}/.`, localDestination], {
                        timeoutMs: 300_000,
                        ...(copyOptions.signal === undefined ? {} : { signal: copyOptions.signal }),
                    });
                    if (!fetched.ok) result = fail("unreachable", "The remote world could not be copied to local backup storage.", fetched.stderr || fetched.stdout || fetched.spawnError);
                }
            } finally {
                if (cleanupRequired) {
                    const cleaned = await cleanupRemotePath(remoteHostStage);
                    if (!cleaned.ok) cleanupWarning = cleaned.failure.message;
                    cleanupRequired = false;
                }
                if (cleanupWarning !== undefined) {
                    result = result.ok
                        ? ok({ cleanupWarning })
                        : fail(result.failure.code, result.failure.message, `${result.failure.detail ?? ""}\n${cleanupWarning}`.trim());
                }
            }
            return result;
        },
        async atomicRestoreDirectory(sourceFolder, targetFolder, restoreOptions = {}) {
            if (!safeContainerPath(targetFolder) || !(targetFolder === options.serverDir || targetFolder.startsWith(`${options.serverDir.replace(/\/$/, "")}/`))) return fail("invalid-request", "The restore target path is outside the container scope.");
            if (!transport.capabilities.canBackupRestore) return fail("unsupported", "This server has not been granted backup-restore mutation capability.");
            const manifest = await localRestoreManifest(sourceFolder, restoreOptions.signal);
            if (!manifest.ok) return manifest;
            if (!manifest.value.some((file) => file.relative === "level.dat")) return fail("invalid-request", "The restore does not contain level.dat.");
            if (restoreOptions.signal?.aborted) return fail("timeout", "The restore was cancelled before staging.");
            const id = randomUUID();
            const remoteHostStage = `/tmp/worldlens-restore-${id}`;
            const stage = `${targetFolder.replace(/\/$/, "")}.worldlens-stage-${id}`;
            const rollback = `${targetFolder.replace(/\/$/, "")}.worldlens-rollback-${id}`;
            let hostStageReady = true;
            let containerStageReady = false;
            let oldRenamed = false;
            let newRenamed = false;
            let serverStopped = false;
            let cleanupWarning: string | undefined;
            const cleanupHost = async (): Promise<Answer<{ path: string; cleaned: boolean }>> => {
                if (!hostStageReady) return ok({ path: remoteHostStage, cleaned: true });
                const cleaned = await cleanupRemotePath(remoteHostStage);
                if (!cleaned.ok) cleanupWarning = cleaned.failure.message;
                hostStageReady = false;
                return cleaned.ok ? ok({ path: remoteHostStage, cleaned: true }) : ok({ path: remoteHostStage, cleaned: false });
            };
            try {
                const sent = await runner(scp, [...scpArguments(options, ["-r"]), `${sourceFolder}/.`, scpRemotePath(options.target, remoteHostStage)], {
                    timeoutMs: 300_000,
                    ...(restoreOptions.signal === undefined ? {} : { signal: restoreOptions.signal }),
                });
                if (!sent.ok) return fail("unreachable", "The restore could not be staged on the SSH host.", sent.stderr || sent.stdout || sent.spawnError);
                const copied = await remoteRunner(docker, ["cp", remoteHostStage, `${options.containerRef}:${stage}`], { timeoutMs: 300_000 });
                if (!copied.ok) return fail("command-failed", "The restore could not be copied into the container.", copied.stderr || copied.stdout);
                containerStageReady = true;
                await cleanupHost();
                const devices = await Promise.all([
                    remoteRunner(docker, ["exec", options.containerRef, "stat", "-c", "%d", targetFolder]),
                    remoteRunner(docker, ["exec", options.containerRef, "stat", "-c", "%d", stage]),
                ]);
                if (devices.some((answer) => !answer.ok) || devices[0]?.stdout.trim() !== devices[1]?.stdout.trim()) return fail("unsupported", "The staged restore and live world are on different filesystems, so an atomic swap is refused.");
                const links = await remoteRunner(docker, ["exec", options.containerRef, "find", stage, "-type", "l", "-print"]);
                if (!links.ok || links.stdout.trim() !== "") return fail("unsupported", "The staged restore contains a symbolic link.");
                const remoteFiles = await remoteRunner(docker, ["exec", options.containerRef, "find", stage, "-type", "f", "-print"]);
                if (!remoteFiles.ok) return fail("command-failed", "The staged restore manifest could not be checked.", remoteFiles.stderr || remoteFiles.stdout);
                const listed = remoteFiles.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => line.startsWith(`${stage}/`) ? line.slice(stage.length + 1) : "");
                if (listed.length !== manifest.value.length || listed.some((file) => !manifest.value.some((entry) => entry.relative === file))) return fail("stale-document", "The staged restore file count does not match its manifest.");
                for (const file of manifest.value) {
                    const remotePath = `${stage}/${file.relative}`;
                    const hashed = await remoteRunner(docker, ["exec", options.containerRef, "sha256sum", "--", remotePath]);
                    const sized = await remoteRunner(docker, ["exec", options.containerRef, "stat", "-c", "%s", remotePath]);
                    if (!hashed.ok || !sized.ok || !hashed.stdout.trim().startsWith(file.sha256) || Number(sized.stdout.trim()) !== file.bytes) return fail("stale-document", `The staged restore hash or size does not match ${file.relative}.`);
                }
                if (restoreOptions.signal?.aborted) return fail("timeout", "The restore was cancelled before the atomic swap.");
                const running = await transport.status();
                if (!running.ok) return running;
                if (running.value.running) {
                    const stopped = await transport.stop({ graceful: true, timeoutMs: 60_000 });
                    if (!stopped.ok) return stopped;
                    serverStopped = true;
                }
                const first = await remoteRunner(docker, ["exec", options.containerRef, "mv", "--", targetFolder, rollback], { timeoutMs: 60_000 });
                if (!first.ok) return fail("command-failed", "The live world could not be moved to its rollback sibling.", first.stderr || first.stdout);
                oldRenamed = true;
                const second = await remoteRunner(docker, ["exec", options.containerRef, "mv", "--", stage, targetFolder], { timeoutMs: 60_000 });
                if (!second.ok) {
                    const rollbackResult = await remoteRunner(docker, ["exec", options.containerRef, "mv", "--", rollback, targetFolder], { timeoutMs: 60_000 });
                    return rollbackResult.ok ? fail("command-failed", "The restore swap failed and the original world was restored.", second.stderr || second.stdout) : fail("command-failed", "The restore swap failed and rollback could not be proven.", `${second.stderr}\n${rollbackResult.stderr}`.trim());
                }
                newRenamed = true;
                containerStageReady = false;
                const restoredLevel = await remoteRunner(docker, ["exec", options.containerRef, "test", "-f", `${targetFolder}/level.dat`]);
                if (!restoredLevel.ok) {
                    const failedWorld = `${targetFolder}.worldlens-failed-${id}`;
                    const movedFailed = await remoteRunner(docker, ["exec", options.containerRef, "mv", "--", targetFolder, failedWorld], { timeoutMs: 60_000 });
                    const rollbackResult = movedFailed.ok ? await remoteRunner(docker, ["exec", options.containerRef, "mv", "--", rollback, targetFolder], { timeoutMs: 60_000 }) : movedFailed;
                    if (rollbackResult.ok) {
                        await remoteRunner(docker, ["exec", options.containerRef, "rm", "-rf", "--", failedWorld], { timeoutMs: 60_000 });
                        oldRenamed = false;
                        newRenamed = false;
                    }
                    return rollbackResult.ok
                        ? fail("command-failed", "The restored world failed post-swap validation and the original world was restored.", restoredLevel.stderr || restoredLevel.stdout)
                        : fail("command-failed", "The restored world failed post-swap validation and rollback could not be proven.", `${restoredLevel.stderr}\n${rollbackResult.stderr}`.trim());
                }
                if (!restoreOptions.retainRollback) {
                    const removedRollback = await cleanupRemotePath(rollback, true);
                    if (!removedRollback.ok) cleanupWarning = removedRollback.failure.message;
                }
                if (running.value.running) {
                    const started = await transport.start();
                    if (!started.ok) return fail("command-failed", "The world was restored but the previously running server could not be restarted.", started.failure.message);
                    serverStopped = false;
                }
                return ok({ restoredFiles: manifest.value.length, rolledBack: false, ...(cleanupWarning === undefined ? {} : { cleanupWarning }) });
            } finally {
                if (containerStageReady && !newRenamed) {
                    const cleanedStage = await cleanupRemotePath(stage, true);
                    if (!cleanedStage.ok) cleanupWarning = cleanedStage.failure.message;
                }
                if (oldRenamed && !newRenamed) {
                    const restored = await remoteRunner(docker, ["exec", options.containerRef, "mv", "--", rollback, targetFolder], { timeoutMs: 60_000 });
                    if (!restored.ok) cleanupWarning = "The rollback sibling could not be restored automatically.";
                }
                if (serverStopped) {
                    const restarted = await transport.start();
                    if (!restarted.ok) cleanupWarning = "The server could not be restarted automatically after restore.";
                }
                await cleanupHost();
            }
        },
    };
}
