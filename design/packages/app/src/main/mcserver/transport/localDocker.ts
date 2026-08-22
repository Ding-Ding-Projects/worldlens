/**
 * A server in a container on this machine's own Docker daemon.
 *
 * Almost nothing, deliberately. The behaviour lives in `dockerTransport.ts`; this supplies
 * the two things that are genuinely local - a runner that executes `docker` here, and a
 * file channel that stages bytes through this machine's own temp directory, where `fs` can
 * read and write them without going near a string.
 */

import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { execFileCommandRunner, type CommandRunner } from "../../runtime/command.js";
import { createDockerTransport, type FileChannel } from "./dockerTransport.js";
import { fail, ok, type Answer, type ServerTransport, type TransportCapabilities } from "./types.js";

export interface LocalDockerOptions {
    readonly containerRef: string;
    readonly serverDir: string;
    readonly runner?: CommandRunner;
    readonly docker?: string;
    readonly writeScope?: readonly string[];
    readonly now?: () => string;
    readonly capabilities?: Partial<TransportCapabilities>;
    /** Where staged files go. Overridable so a test never writes to the real temp folder. */
    readonly stagingDir?: string;
}

/** Staging on the same machine: `docker cp` writes here, and `fs` picks it up. */
export function createLocalFileChannel(stagingRoot?: string): FileChannel {
    const root = stagingRoot ?? tmpdir();

    return {
        stagingPath(name: string): string {
            return join(root, `worldlens-mcserver-${name}`);
        },
        async collect(stagedPath: string, maxBytes: number): Promise<Answer<Uint8Array>> {
            try {
                const bytes = await readFile(stagedPath);
                if (bytes.byteLength > maxBytes) return ok(new Uint8Array(bytes.subarray(0, maxBytes)));
                return ok(new Uint8Array(bytes));
            } catch (error) {
                const code = (error as NodeJS.ErrnoException | null)?.code;
                if (code === "ENOENT") return fail("not-found", "That file did not arrive from the container.");
                return fail("command-failed", "That file could not be read after it was copied out.", String(error));
            }
        },
        async deposit(stagedPath: string, bytes: Uint8Array): Promise<Answer<void>> {
            try {
                await writeFile(stagedPath, bytes);
                return ok(undefined);
            } catch (error) {
                return fail("command-failed", "That file could not be prepared for the container.", String(error));
            }
        },
        async discard(stagedPath: string): Promise<void> {
            await rm(stagedPath, { force: true }).catch(() => {
                // Litter, not a failure. Refusing the whole operation because a temporary
                // file could not be removed would be a worse outcome than the litter.
            });
        },
    };
}

export function createLocalDockerTransport(options: LocalDockerOptions): ServerTransport {
    return createDockerTransport({
        ref: { kind: "local-docker", containerRef: options.containerRef, serverDir: options.serverDir },
        containerRef: options.containerRef,
        serverDir: options.serverDir,
        runner: options.runner ?? execFileCommandRunner,
        files: createLocalFileChannel(options.stagingDir),
        ...(options.docker === undefined ? {} : { docker: options.docker }),
        ...(options.writeScope === undefined ? {} : { writeScope: options.writeScope }),
        ...(options.now === undefined ? {} : { now: options.now }),
        ...(options.capabilities === undefined ? {} : { capabilities: options.capabilities }),
    });
}
