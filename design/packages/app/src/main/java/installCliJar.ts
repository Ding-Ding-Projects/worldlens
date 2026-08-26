/**
 * Fetching the BlueMap CLI jar when a build did not bring one.
 *
 * Every supported build bundles the engine, and when it does nothing here runs. This exists for
 * the case where it did not: a packaging step that silently dropped the jar, an install a user
 * copied by hand, a checkout with no staged jars. Before this, that case ended the render with
 * "The BlueMap engine is not installed" and left the person nothing to do about it.
 *
 * The owner's direction is that a missing dependency should install itself so nobody feels it,
 * exactly as the Java runtime already provisions itself through `ensureJava`. This is the same
 * idea for the jar.
 *
 * ## Deliberately no digest gate
 *
 * `downloadVerified` in `./download.ts` demands a SHA-256 and is the right tool for the JDK, where
 * the digest arrives from the same signed metadata as the URL. There is no equivalent published
 * digest for an arbitrary BlueMap release, and pinning a table of them by hand would mean a new
 * upstream version silently refusing to install until somebody edited this file - which is exactly
 * the failure this function exists to remove.
 *
 * So the checks here are the ones that catch a broken download rather than an adversarial one:
 * the transfer completed, the file is a plausible size, and it begins with a zip local-file header,
 * because a jar is a zip and an HTML error page is not. A proxy interception page, a truncated
 * transfer and a 404 body all fail that. What it does not defend against is a compromised upstream
 * release, and it should not be described as if it did.
 *
 * The jar is fetched over HTTPS from BlueMap's own releases, the same project whose source this
 * repository already vendors and builds.
 */

import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { open } from "node:fs/promises";
import { join } from "node:path";

/** Where an installed jar is kept, and one of the directories `resolveCliJar` searches. */
export function downloadedJarDirectory(dataDir: string): string {
    return join(dataDir, "engines", "jars");
}

/**
 * A jar smaller than this is not a jar. The 5.23 CLI is about 6.6 MB; an error page is a few
 * hundred bytes. The bound is deliberately far below any real release rather than tuned to one,
 * so a genuinely smaller future build still installs.
 */
const MINIMUM_PLAUSIBLE_BYTES = 512 * 1024;

/** `PK\x03\x04`: the local file header every zip, and therefore every jar, starts with. */
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export interface InstallCliJarOptions {
    /** Electron's `userData`. The jar is installed beneath it. */
    readonly dataDir: string;
    /** The BlueMap version to fetch, such as `5.23`. */
    readonly version: string;
    /** Injected in tests. */
    readonly fetchBinary?: (url: string) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>;
    readonly onProgress?: (message: string) => void;
}

export class CliJarInstallError extends Error {}

async function looksLikeAJar(path: string): Promise<boolean> {
    const info = await stat(path).catch(() => null);
    if (info === null || !info.isFile() || info.size < MINIMUM_PLAUSIBLE_BYTES) return false;
    const handle = await open(path, "r").catch(() => null);
    if (handle === null) return false;
    try {
        const head = Buffer.alloc(ZIP_MAGIC.length);
        const { bytesRead } = await handle.read(head, 0, head.length, 0);
        return bytesRead === head.length && head.equals(ZIP_MAGIC);
    } finally {
        await handle.close();
    }
}

/**
 * Install the CLI jar for `version` if it is not already installed, and return its path.
 *
 * Idempotent: an already-installed jar that still looks like a jar is returned without a network
 * request, so this is safe to call before every render.
 */
export async function installCliJar(options: InstallCliJarOptions): Promise<string> {
    const directory = downloadedJarDirectory(options.dataDir);
    const fileName = `bluemap-${options.version}-cli.jar`;
    const target = join(directory, fileName);

    if (await looksLikeAJar(target)) return target;

    await mkdir(directory, { recursive: true });
    const url =
        `https://github.com/BlueMap-Minecraft/BlueMap/releases/download/` +
        `v${options.version}/${fileName}`;
    options.onProgress?.(`Downloading the BlueMap ${options.version} engine`);

    const fetchBinary = options.fetchBinary ?? ((target: string) => globalThis.fetch(target, { redirect: "follow" }));
    let response;
    try {
        response = await fetchBinary(url);
    } catch (error) {
        throw new CliJarInstallError(
            `could not reach ${url}: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
    if (!response.ok) {
        throw new CliJarInstallError(`${url} answered ${String(response.status)}`);
    }

    /*
     * Written to a `.part` first and renamed, so an interrupted download cannot leave a truncated
     * file where a later launch would find it and treat it as installed. The same reason
     * `downloadVerified` does it.
     */
    const partFile = `${target}.part`;
    await writeFile(partFile, Buffer.from(await response.arrayBuffer()));
    if (!(await looksLikeAJar(partFile))) {
        await rm(partFile, { force: true });
        throw new CliJarInstallError(
            `what ${url} returned is not a jar: too small, or it does not begin with a zip header. ` +
                `Nothing was installed.`,
        );
    }
    await rename(partFile, target);
    options.onProgress?.(`Installed the BlueMap ${options.version} engine`);
    return target;
}
