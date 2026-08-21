/**
 * Turning a stored server record into something that can be talked to.
 *
 * One `switch` on `TransportRef.kind`, in one place. Every other file in this feature takes
 * a `ServerTransport` and never learns which of the three it got, which is what stops the
 * console, the config editor and the plugin manager from each growing their own copy of
 * this decision - three copies that would agree today and diverge the first time one of
 * them is fixed.
 */

import { createLocalDockerTransport } from "./localDocker.js";
import { createLocalProcessTransport } from "./localProcess.js";
import { createSshDockerTransport } from "./sshDocker.js";
import type { SshOptionsInput } from "../../remote/ssh.js";
import type { CommandRunner } from "../../runtime/command.js";
import { fail, type Answer, type ServerTransport, type TransportCapabilities, type TransportRef } from "./types.js";

export interface FactoryDeps {
    /**
     * How a configured SSH host is looked up.
     *
     * A function rather than a map, because host records live in the remote module's own
     * store and this must not become a second place they are cached. A host that has been
     * removed answers null, and the caller reports that rather than quietly falling back
     * to some other machine.
     */
    readonly sshHost?: (hostId: string) => SshOptionsInput | null;
    /** How a local server's Java runtime and jar are located. */
    readonly localRuntime?: (serverDir: string) => { readonly javaPath: string; readonly jarPath: string; readonly memoryMb: number } | null;
    readonly runner?: CommandRunner;
    readonly docker?: string;
    readonly now?: () => string;
    readonly writeScope?: readonly string[];
    readonly capabilities?: Partial<TransportCapabilities>;
}

export function createTransport(ref: TransportRef, deps: FactoryDeps = {}): Answer<ServerTransport> {
    switch (ref.kind) {
        case "local-process": {
            const runtime = deps.localRuntime?.(ref.serverDir) ?? null;
            if (runtime === null) {
                return fail(
                    "invalid-request",
                    "This server has no Java runtime chosen yet.",
                    "Pick or download one for it before starting it.",
                );
            }
            return {
                ok: true,
                value: createLocalProcessTransport({
                    serverDir: ref.serverDir,
                    javaPath: runtime.javaPath,
                    jarPath: runtime.jarPath,
                    memoryMb: runtime.memoryMb,
                    ...(deps.writeScope === undefined ? {} : { writeScope: deps.writeScope }),
                    ...(deps.now === undefined ? {} : { now: deps.now }),
                }),
            };
        }
        case "local-docker": {
            return {
                ok: true,
                value: createLocalDockerTransport({
                    containerRef: ref.containerRef,
                    serverDir: ref.serverDir,
                    ...(deps.runner === undefined ? {} : { runner: deps.runner }),
                    ...(deps.docker === undefined ? {} : { docker: deps.docker }),
                    ...(deps.writeScope === undefined ? {} : { writeScope: deps.writeScope }),
                    ...(deps.now === undefined ? {} : { now: deps.now }),
                    ...(deps.capabilities === undefined ? {} : { capabilities: deps.capabilities }),
                }),
            };
        }
        case "ssh-docker": {
            const host = deps.sshHost?.(ref.hostId) ?? null;
            if (host === null) {
                // Naming the host rather than saying "not found" matters: the usual cause is
                // a host the user removed, and the message should let them recognise that
                // rather than send them looking for a Docker problem.
                return fail(
                    "not-found",
                    "The machine this server runs on is no longer set up here.",
                    `Host: ${ref.hostId}`,
                );
            }
            return {
                ok: true,
                value: createSshDockerTransport({
                    ...host,
                    hostId: ref.hostId,
                    containerRef: ref.containerRef,
                    serverDir: ref.serverDir,
                    ...(deps.runner === undefined ? {} : { runner: deps.runner }),
                    ...(deps.docker === undefined ? {} : { docker: deps.docker }),
                    ...(deps.writeScope === undefined ? {} : { writeScope: deps.writeScope }),
                    ...(deps.now === undefined ? {} : { now: deps.now }),
                    ...(deps.capabilities === undefined ? {} : { capabilities: deps.capabilities }),
                }),
            };
        }
    }
}
