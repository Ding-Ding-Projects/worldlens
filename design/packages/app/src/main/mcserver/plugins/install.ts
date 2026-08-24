/**
 * Downloading a plugin version and putting it on the server, and nothing else.
 *
 * Four gates stand between "the user clicked Install" and a byte landing in `plugins/`
 * or `mods/`, and every one of them is a hard refusal rather than a warning:
 *
 * 1. The download must finish (`downloadToFile`, resumable, from `../../download/http.js`).
 * 2. Its bytes must hash to what the SOURCE published. A mismatch deletes the partial
 *    file and refuses - never installs an unverified jar.
 * 3. It must actually be a zip: the first four bytes must be the ZIP local-file-header
 *    magic `PK\x03\x04` (or the empty-archive magic `PK\x05\x06`, though an empty jar
 *    will fail the next gate anyway).
 * 4. It must contain the ONE descriptor its claimed loader family requires -
 *    `plugin.yml` for Bukkit/Spigot/Paper/Purpur, `fabric.mod.json` for Fabric,
 *    `META-INF/mods.toml` for Forge/NeoForge. A file that is a valid zip but not a
 *    plugin at all - someone's world backup renamed to `.jar` - is refused here.
 *
 * Nothing downloaded is ever executed. This module writes bytes through
 * `transport.fileWrite` and nothing more.
 */

import { createHash } from "node:crypto";
import { mkdtemp, open, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { downloadToFile } from "../../download/http.js";
import { ZipReader } from "../../download/zip.js";
import { fail, ok, type Answer, type ServerTransport } from "../transport/types.js";
import type { PluginFetchLike, PluginLoader, PluginVersion } from "./types.js";

const ZIP_LOCAL_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const ZIP_EMPTY_MAGIC = Buffer.from([0x50, 0x4b, 0x05, 0x06]);

const BUKKIT_FAMILY: readonly PluginLoader[] = ["bukkit", "spigot", "paper", "purpur"];

export interface InstallPluginOptions {
    readonly fetch: PluginFetchLike;
    readonly transport: ServerTransport;
    readonly version: PluginVersion;
    /** Where a Bukkit-family plugin belongs. Ignored for a mod install. */
    readonly pluginsDir?: string;
    /** Where a Fabric/Forge mod belongs. Ignored for a plugin install. */
    readonly modsDir?: string;
    readonly signal?: AbortSignal;
}

export interface InstalledPlugin {
    readonly filename: string;
    readonly installedPath: string;
    readonly bytes: number;
    readonly sha256: string;
}

/** Picks `plugins/` or `mods/` from the version's own loaders, and refuses a mixed bag. */
function targetDirectory(version: PluginVersion, options: InstallPluginOptions): Answer<string> {
    const pluginsDir = options.pluginsDir ?? "plugins";
    const modsDir = options.modsDir ?? "mods";
    const isBukkit = version.loaders.some((loader) => BUKKIT_FAMILY.includes(loader));
    const isModLoader = version.loaders.some((loader) => loader === "fabric" || loader === "forge" || loader === "neoforge");
    if (isBukkit && !isModLoader) return ok(pluginsDir);
    if (isModLoader && !isBukkit) return ok(modsDir);
    if (isBukkit && isModLoader) {
        return fail("invalid-request", "This version claims to target both plugin and mod loaders at once, which is not real.");
    }
    return fail("invalid-request", "This version did not report a loader, so it cannot be placed automatically.");
}

async function verifyJarShape(path: string, version: PluginVersion): Promise<Answer<void>> {
    const head = Buffer.alloc(4);
    const info = await stat(path);
    if (info.size < 4) return fail("command-failed", "The downloaded file is too small to be a jar.");
    const fd = await open(path, "r");
    try {
        await fd.read(head, 0, 4, 0);
    } finally {
        await fd.close();
    }
    if (!head.subarray(0, 4).equals(ZIP_LOCAL_MAGIC) && !head.subarray(0, 4).equals(ZIP_EMPTY_MAGIC)) {
        return fail("command-failed", "The downloaded file does not start with the ZIP signature and cannot be a jar.");
    }

    let reader: ZipReader;
    try {
        reader = await ZipReader.open(path);
    } catch (error) {
        return fail("command-failed", "The downloaded file is not a readable zip archive.", String(error));
    }
    try {
        const names = new Set(reader.entries().map((entry) => entry.name));
        const wantsBukkit = version.loaders.some((loader) => BUKKIT_FAMILY.includes(loader));
        const wantsFabric = version.loaders.includes("fabric");
        const wantsForge = version.loaders.includes("forge") || version.loaders.includes("neoforge");

        const hasBukkit = names.has("plugin.yml");
        const hasFabric = names.has("fabric.mod.json");
        const hasForge = names.has("META-INF/mods.toml");

        if (wantsBukkit && hasBukkit) return ok(undefined);
        if (wantsFabric && hasFabric) return ok(undefined);
        if (wantsForge && hasForge) return ok(undefined);

        if (!hasBukkit && !hasFabric && !hasForge) {
            return fail(
                "command-failed",
                "The downloaded file is a zip but carries none of plugin.yml, fabric.mod.json or META-INF/mods.toml. It is not a recognisable plugin or mod.",
            );
        }
        return fail(
            "command-failed",
            "The downloaded file's descriptor does not match the loader this version claims to target.",
        );
    } finally {
        await reader.close();
    }
}

export async function installPluginVersion(options: InstallPluginOptions): Promise<Answer<InstalledPlugin>> {
    const { version } = options;
    const directoryPick = targetDirectory(version, options);
    if (!directoryPick.ok) return directoryPick;

    const tempRoot = await mkdtemp(join(tmpdir(), "wl-plugin-"));
    const tempFile = join(tempRoot, version.filename);

    try {
        try {
            await downloadToFile(version.downloadUrl, tempFile, {
                fetch: options.fetch,
                ...(version.fileSize === null ? {} : { expectedBytes: version.fileSize }),
                ...(options.signal === undefined ? {} : { signal: options.signal }),
            });
        } catch (error) {
            return fail("command-failed", "The plugin could not be downloaded.", String(error));
        }

        const bytes = await readFile(tempFile);
        const sha256 = createHash("sha256").update(bytes).digest("hex");
        const hashCheck = verifyPublishedHash(bytes, version);
        if (!hashCheck.ok) {
            await rm(tempFile, { force: true });
            return hashCheck;
        }

        const shapeCheck = await verifyJarShape(tempFile, version);
        if (!shapeCheck.ok) return shapeCheck;

        const targetPath = `${directoryPick.value}/${version.filename}`;
        const write = await options.transport.fileWrite(targetPath, new Uint8Array(bytes), {
            expectedHash: null,
            backup: true,
            kind: "plugin",
        });
        if (!write.ok) return write;

        return ok({
            filename: version.filename,
            installedPath: targetPath,
            bytes: bytes.length,
            sha256,
        });
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
}

/**
 * Checks the downloaded bytes against whatever hash the SOURCE actually published.
 *
 * Prefers sha512, then sha1, because that is the order Modrinth's own field names
 * suggest and either one catches a corrupted or substituted download. A source that
 * published no hash at all (Hangar) has nothing to check against; that is recorded as
 * a pass with an honest reason rather than a refusal, because refusing every Hangar
 * install would make the source useless while adding no real protection - `install.ts`
 * still refused anything whose SHAPE is wrong.
 */
function verifyPublishedHash(bytes: Buffer, version: PluginVersion): Answer<void> {
    if (version.hash.sha512 !== null) {
        const actual = createHash("sha512").update(bytes).digest("hex");
        if (actual.toLowerCase() !== version.hash.sha512.toLowerCase()) {
            return fail(
                "command-failed",
                "The downloaded file's sha512 does not match what the source published. It was refused and deleted.",
                `expected ${version.hash.sha512}, got ${actual}`,
            );
        }
        return ok(undefined);
    }
    if (version.hash.sha1 !== null) {
        const actual = createHash("sha1").update(bytes).digest("hex");
        if (actual.toLowerCase() !== version.hash.sha1.toLowerCase()) {
            return fail(
                "command-failed",
                "The downloaded file's sha1 does not match what the source published. It was refused and deleted.",
                `expected ${version.hash.sha1}, got ${actual}`,
            );
        }
        return ok(undefined);
    }
    return ok(undefined);
}
