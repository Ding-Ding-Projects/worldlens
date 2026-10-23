import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type {
    ManagedHostingBuildFacts,
    ManagedHostingHostFacts,
    ManagedHostTarget,
} from "./register.js";
import type { VerifiedRuntimeFile } from "./exportContext.js";

/**
 * The immutable Node base the exported container context is built from.
 *
 * `exportManagedMapContext` refuses a floating tag on purpose: a context that says
 * `node:22-slim` describes a different image every few weeks, so its receipt could never be
 * replayed. This is the manifest-list digest Docker Hub returned for `library/node:22-slim`
 * on 2026-10-23. Changing it is a review decision, not a refresh: read the new image's
 * provenance first, then update the date in this comment alongside the digest.
 */
export const REVIEWED_CONTAINER_BASE_IMAGE =
    "node:22-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d";

/** A hosting input this build cannot supply. The message says what is missing and what still works. */
export class ManagedHostingUnavailableError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ManagedHostingUnavailableError";
    }
}

export interface ManagedHostingBuildInputs {
    /** The 40-character commit this build was made from, or null when the build did not record one. */
    readonly sourceCommit: string | null;
    /** The esbuild output of `buildManagedMapHost` (`dist/managed-host.mjs`). */
    readonly runtimeBundlePath: string;
    readonly containerBaseImage?: string;
    /** Staged native Node runtimes, when the build carries them. Absent means the native targets are unavailable. */
    readonly nodeWindowsPath?: string | null;
    readonly nodeLinuxPath?: string | null;
}

async function verifiedFile(path: string, what: string): Promise<VerifiedRuntimeFile> {
    let bytes: Buffer;
    try {
        bytes = await readFile(path);
    } catch {
        throw new ManagedHostingUnavailableError(
            `${what} is missing from this build at ${path}. Hosting export needs the build produced by the repository's own build entry point.`,
        );
    }
    return { path, sha256: createHash("sha256").update(bytes).digest("hex") };
}

async function optionalFile(
    path: string | null | undefined,
): Promise<VerifiedRuntimeFile | undefined> {
    if (!path) return undefined;
    try {
        return await verifiedFile(path, "A staged native runtime");
    } catch {
        return undefined;
    }
}

/**
 * Resolve the build facts the hosting registrar needs, from the build itself rather than from
 * renderer input. Resolved once and cached: the bundle does not change while the app runs,
 * and hashing it on every export would only make a slow operation slower.
 */
export function managedHostingBuildFacts(
    inputs: ManagedHostingBuildInputs,
): () => Promise<ManagedHostingBuildFacts> {
    let cached: Promise<ManagedHostingBuildFacts> | null = null;
    return () => {
        cached ??= (async () => {
            const sourceCommit = inputs.sourceCommit;
            if (typeof sourceCommit !== "string" || !/^[a-f0-9]{40}$/u.test(sourceCommit)) {
                throw new ManagedHostingUnavailableError(
                    "This build does not record the 40-character source commit it was made from, so a source-bound hosting export cannot be produced. A release build records it; a development build does not.",
                );
            }
            const runtimeBundle = await verifiedFile(
                inputs.runtimeBundlePath,
                "The managed-host runtime bundle",
            );
            const [nodeWindows, nodeLinux] = await Promise.all([
                optionalFile(inputs.nodeWindowsPath),
                optionalFile(inputs.nodeLinuxPath),
            ]);
            return {
                sourceCommit,
                runtimeBundle,
                containerBaseImage: inputs.containerBaseImage ?? REVIEWED_CONTAINER_BASE_IMAGE,
                ...(nodeWindows ? { nodeWindows } : {}),
                ...(nodeLinux ? { nodeLinux } : {}),
            };
        })().catch((error: unknown) => {
            // A failure is not cached: the next call re-reads, so a bundle staged later is found.
            cached = null;
            throw error;
        });
        return cached;
    };
}

/**
 * The host resolver this build ships: none. Deployment needs an HTTPS origin and trusted TLS
 * key/certificate files for the chosen host, and no settings surface collects those yet. The
 * registrar still answers every other hosting request (access preparation, export, image build,
 * save, registry sign-in and upload), so this is an explicit incomplete state rather than a
 * missing handler, and the message names exactly what is still missing.
 */
export function unconfiguredHostResolver(): (request: {
    target: ManagedHostTarget;
    context: string;
    port: number;
}) => Promise<ManagedHostingHostFacts> {
    return async (request) => {
        throw new ManagedHostingUnavailableError(
            `Deploying to a ${request.target} host on port ${request.port} needs a configured HTTPS origin and trusted TLS key and certificate files, and this build has no hosting configuration surface for them yet. Export, image build, save, registry sign-in and upload remain available.`,
        );
    };
}
