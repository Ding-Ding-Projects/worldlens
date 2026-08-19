import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, join, parse, resolve } from "node:path";
import type { AddonCapability, AddonManifest, InstalledAddon } from "./types.js";
import { ADDON_CAPABILITIES, ADDON_MANIFEST_VERSION, ADDON_API_VERSION } from "./types.js";

const ID = /^[a-z][a-z0-9-]{1,63}$/;
const VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const MAX_MANIFEST_BYTES = 64 * 1024;

function text(value: unknown, field: string, max = 256): string {
    if (typeof value !== "string" || value.length === 0 || value.length > max) throw new Error(`invalid add-on ${field}`);
    return value;
}

export function validateAddonManifest(value: unknown): AddonManifest {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("add-on manifest must be an object");
    const input = value as Record<string, unknown>;
    if (input.manifestVersion !== ADDON_MANIFEST_VERSION) throw new Error("unsupported add-on manifest version");
    const id = text(input.id, "id", 64);
    if (!ID.test(id)) throw new Error("invalid add-on id");
    const version = text(input.version, "version", 64);
    if (!VERSION.test(version)) throw new Error("invalid add-on version");
    const apiVersion = text(input.apiVersion, "apiVersion", 32);
    if (apiVersion !== ADDON_API_VERSION) throw new Error("incompatible add-on API version");
    const entry = text(input.entry, "entry", 128);
    if (isAbsolute(entry) || entry.includes("\\") || entry.split("/").some((part) => part === ".." || part === ".")) throw new Error("add-on entry must stay inside its package");
    const capabilities = input.capabilities === undefined ? [] : input.capabilities;
    if (!Array.isArray(capabilities) || capabilities.some((item) => !ADDON_CAPABILITIES.includes(item as AddonCapability))) throw new Error("invalid add-on capability");
    const dependencies = input.dependencies === undefined ? undefined : input.dependencies;
    if (dependencies !== undefined && (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies))) throw new Error("invalid add-on dependencies");
    const conflicts = input.conflicts === undefined ? undefined : input.conflicts;
    if (conflicts !== undefined && (!Array.isArray(conflicts) || conflicts.some((item) => typeof item !== "string" || !ID.test(item)))) throw new Error("invalid add-on conflicts");
    const manifest: AddonManifest = {
        manifestVersion: 1,
        id,
        name: text(input.name, "name"),
        version,
        apiVersion,
        entry,
        capabilities: Object.freeze([...new Set(capabilities as AddonCapability[])]),
        ...(dependencies ? { dependencies: Object.freeze(Object.fromEntries(Object.entries(dependencies).map(([key, val]) => [key, text(val, `dependency ${key}`, 64)]))) } : {}),
        ...(conflicts ? { conflicts: Object.freeze([...new Set(conflicts as string[])]) } : {}),
        ...(input.description === undefined ? {} : { description: text(input.description, "description", 2048) }),
    };
    return manifest;
}

export async function readInstalledAddon(directory: string): Promise<InstalledAddon> {
    const root = resolve(directory);
    await assertNoReparseComponents(root);
    const manifestPath = resolve(root, "addon.json");
    const manifestBytes = await readFile(manifestPath);
    if (manifestBytes.byteLength > MAX_MANIFEST_BYTES) throw new Error("add-on manifest is too large");
    const manifest = validateAddonManifest(JSON.parse(manifestBytes.toString("utf8")));
    const entryPath = resolve(root, manifest.entry);
    if (!entryPath.startsWith(`${root}/`) && !entryPath.startsWith(`${root}\\`)) throw new Error("add-on entry escapes package");
    const entryBytes = await readFile(entryPath);
    return { manifest, directory: root, entryPath, provenance: { manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"), entrySha256: createHash("sha256").update(entryBytes).digest("hex") }, enabled: false };
}

async function assertNoReparseComponents(path: string): Promise<void> {
    const root = parse(path).root;
    let current = root;
    for (const part of path.slice(root.length).split(/[\\/]/).filter(Boolean)) {
        current = join(current, part);
        try {
            const stat = await lstat(current);
            if (stat.isSymbolicLink()) throw new Error("add-on package cannot contain a symbolic-link path");
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
            throw error;
        }
    }
}
