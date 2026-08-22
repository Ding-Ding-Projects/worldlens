/**
 * What is already on the server: listing, enabling, disabling, removing, and checking
 * for an update.
 *
 * Everything here reads through `transport.fileList` / `fileRead` and writes through
 * `transport.fileWrite` / `fileDelete` - the same seam `install.ts` writes through - so
 * it works identically whether the server is a local process, a local container or one
 * reached over SSH. A jar's own name and version come from parsing its bundled
 * descriptor (`plugin.yml`, `fabric.mod.json` or `META-INF/mods.toml`), never from its
 * filename, because a filename is a rename away from being wrong.
 */

import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ZipReader } from "../../download/zip.js";
import { fail, ok, type Answer, type ServerTransport } from "../transport/types.js";
import type { PluginSource, PluginVersion } from "./types.js";

const DISABLED_SUFFIX = ".jar.disabled";

export interface InstalledPluginInfo {
    /** The file's current name on disk, including a `.disabled` suffix when disabled. */
    readonly filename: string;
    readonly path: string;
    readonly enabled: boolean;
    /** Parsed from the jar's own descriptor. Null when it could not be read. */
    readonly name: string | null;
    readonly version: string | null;
    readonly loaderHint: "bukkit" | "fabric" | "forge" | "unknown";
    readonly sha256: string;
    readonly sizeBytes: number;
}

export interface ListInstalledOptions {
    readonly transport: ServerTransport;
    readonly pluginsDir?: string;
    readonly modsDir?: string;
}

function stripDisabled(name: string): { base: string; enabled: boolean } {
    if (name.endsWith(DISABLED_SUFFIX)) return { base: name.slice(0, -".disabled".length), enabled: false };
    return { base: name, enabled: true };
}

async function readDescriptor(bytes: Uint8Array): Promise<{
    name: string | null;
    version: string | null;
    loaderHint: InstalledPluginInfo["loaderHint"];
}> {
    const tempRoot = await mkdtemp(join(tmpdir(), "wl-plugin-read-"));
    const tempFile = join(tempRoot, "plugin.jar");
    try {
        await writeFile(tempFile, bytes);
        let reader: ZipReader;
        try {
            reader = await ZipReader.open(tempFile);
        } catch {
            return { name: null, version: null, loaderHint: "unknown" };
        }
        try {
            const entries = reader.entries();
            const pluginYml = entries.find((entry) => entry.name === "plugin.yml");
            const fabricJson = entries.find((entry) => entry.name === "fabric.mod.json");
            const modsToml = entries.find((entry) => entry.name === "META-INF/mods.toml");

            if (pluginYml !== undefined) {
                const text = await readEntryText(reader, pluginYml);
                return { ...parseYamlish(text), loaderHint: "bukkit" };
            }
            if (fabricJson !== undefined) {
                const text = await readEntryText(reader, fabricJson);
                return { ...parseFabricJson(text), loaderHint: "fabric" };
            }
            if (modsToml !== undefined) {
                const text = await readEntryText(reader, modsToml);
                return { ...parseModsToml(text), loaderHint: "forge" };
            }
            return { name: null, version: null, loaderHint: "unknown" };
        } finally {
            await reader.close();
        }
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
}

async function readEntryText(reader: ZipReader, entry: ReturnType<ZipReader["entries"]>[number]): Promise<string> {
    const stream = await reader.openEntry(entry);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    }
    return Buffer.concat(chunks).toString("utf8");
}

function parseYamlish(text: string): { name: string | null; version: string | null } {
    const nameMatch = /^\s*name:\s*['"]?([^'"\r\n]+?)['"]?\s*$/m.exec(text);
    const versionMatch = /^\s*version:\s*['"]?([^'"\r\n]+?)['"]?\s*$/m.exec(text);
    return {
        name: nameMatch?.[1]?.trim() ?? null,
        version: versionMatch?.[1]?.trim() ?? null,
    };
}

function parseFabricJson(text: string): { name: string | null; version: string | null } {
    try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        const name = typeof parsed.name === "string" ? parsed.name : typeof parsed.id === "string" ? parsed.id : null;
        const version = typeof parsed.version === "string" ? parsed.version : null;
        return { name, version };
    } catch {
        return { name: null, version: null };
    }
}

function parseModsToml(text: string): { name: string | null; version: string | null } {
    const displayNameMatch = /displayName\s*=\s*"([^"]*)"/.exec(text);
    const modIdMatch = /modId\s*=\s*"([^"]*)"/.exec(text);
    const versionMatch = /version\s*=\s*"([^"]*)"/.exec(text);
    return {
        name: displayNameMatch?.[1] ?? modIdMatch?.[1] ?? null,
        version: versionMatch?.[1] ?? null,
    };
}

async function listInDirectory(
    transport: ServerTransport,
    dir: string,
): Promise<Answer<InstalledPluginInfo[]>> {
    const listing = await transport.fileList(dir);
    if (!listing.ok) {
        // A missing plugins/mods directory is an empty server, not a failure.
        if (listing.failure.code === "not-found") return ok([]);
        return listing;
    }

    const out: InstalledPluginInfo[] = [];
    for (const entry of listing.value) {
        if (entry.kind !== "file") continue;
        if (!entry.name.endsWith(".jar") && !entry.name.endsWith(DISABLED_SUFFIX)) continue;

        const path = `${dir}/${entry.name}`;
        const read = await transport.fileRead(path);
        if (!read.ok) continue;

        const { enabled } = stripDisabled(entry.name);
        const sha256 = createHash("sha256").update(read.value.bytes).digest("hex");
        const descriptor = await readDescriptor(read.value.bytes);

        out.push({
            filename: entry.name,
            path,
            enabled,
            name: descriptor.name,
            version: descriptor.version,
            loaderHint: descriptor.loaderHint,
            sha256,
            sizeBytes: read.value.size,
        });
    }
    return ok(out);
}

export async function listInstalledPlugins(options: ListInstalledOptions): Promise<Answer<InstalledPluginInfo[]>> {
    const pluginsDir = options.pluginsDir ?? "plugins";
    const modsDir = options.modsDir ?? "mods";

    const plugins = await listInDirectory(options.transport, pluginsDir);
    if (!plugins.ok) return plugins;
    const mods = await listInDirectory(options.transport, modsDir);
    if (!mods.ok) return mods;

    return ok([...plugins.value, ...mods.value]);
}

export interface TogglePluginOptions {
    readonly transport: ServerTransport;
    readonly path: string;
    readonly enable: boolean;
}

/** Enables or disables an installed jar by renaming to/from the `.jar.disabled` suffix. */
export async function togglePlugin(options: TogglePluginOptions): Promise<Answer<{ path: string }>> {
    const { transport, path, enable } = options;
    const currentlyDisabled = path.endsWith(DISABLED_SUFFIX);
    if (enable && !currentlyDisabled) return ok({ path });
    if (!enable && currentlyDisabled) return ok({ path });

    const targetPath = enable ? path.slice(0, -".disabled".length) : `${path}.disabled`;

    const read = await transport.fileRead(path);
    if (!read.ok) return read;

    const write = await transport.fileWrite(targetPath, read.value.bytes, { expectedHash: null, backup: false });
    if (!write.ok) return write;

    const removed = await transport.fileDelete(path);
    if (!removed.ok) return removed;

    return ok({ path: targetPath });
}

export interface RemovePluginOptions {
    readonly transport: ServerTransport;
    readonly path: string;
}

export async function removePlugin(options: RemovePluginOptions): Promise<Answer<void>> {
    return options.transport.fileDelete(options.path);
}

export interface UpdateCheck {
    readonly path: string;
    readonly installedVersion: string | null;
    readonly latestVersion: string | null;
    readonly updateAvailable: boolean;
    readonly latest: PluginVersion | null;
}

export interface CheckUpdateOptions {
    readonly source: PluginSource;
    readonly projectId: string;
    readonly installed: InstalledPluginInfo;
}

/**
 * Compares an installed jar's own reported version against the source's newest
 * version. String comparison, not semver - plugin authors do not agree on a version
 * scheme, so "newer" here means "not the same string as what is installed", which is
 * the one thing that can be said honestly without guessing a scheme.
 */
export async function checkForUpdate(options: CheckUpdateOptions): Promise<Answer<UpdateCheck>> {
    const versions = await options.source.versions(options.projectId);
    if (!versions.ok) return versions;

    const latest = versions.value[0] ?? null;
    const installedVersion = options.installed.version;
    const updateAvailable =
        latest !== null && (installedVersion === null || installedVersion !== latest.versionNumber);

    return ok({
        path: options.installed.path,
        installedVersion,
        latestVersion: latest?.versionNumber ?? null,
        updateAvailable,
        latest,
    });
}
