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

import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    execFileCommandRunner,
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
    return createDockerTransport({
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
}
