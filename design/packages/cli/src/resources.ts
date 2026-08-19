/**
 * Resolves the resource pack and data pack a render needs, the way
 * `BlueMapService#getOrLoadResourcePack`/`getPackRoots` do.
 *
 * Java source: `common/src/main/java/de/bluecolored/bluemap/common/BlueMapService.java:297-397`
 *
 * upstream's real search order is:
 *
 *     packs folder -> extra/addon packs -> mods folder -> resourceExtensions.zip
 *     -> the vanilla client jar, appended last
 *
 * This port keeps that order exactly, from highest to lowest priority: configured
 * packs/addons, mods, BlueMap's own extension pack, then the client jar as fallback.
 * The extension pack is resolved from the configured data folder, packaged resources,
 * or the vendored checkout source when a build has not produced the zip yet.
 *
 * - **`resourceExtensions.zip`** is BlueMap's own bundled pack (chest/banner/bed/sign
 *   overlay models and a `minecraft:directory` blocks-atlas source covering every texture
 *   namespace, not just `block/`). Its zip is preferred, with the source directory as a
 *   checkout-only fallback; both paths are hashed and reported before loading.
 * - **`-n`/`--mods`.** Every direct `.jar` in the supplied folder is passed through the
 *   engine's Pack loader, which also handles Fabric nested jars and nested datapacks.
 *
 * The vanilla client jar itself IS real: `@worldlens/engine`'s `MinecraftVersion`
 * resolves the version manifest, downloads the jar with SHA-1 verification, and gates the
 * download behind exactly the `accept-download` consent core.conf documents — the same
 * class upstream's own `BlueMapService` calls.
 */

import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DataPack, DirFileSystem, MinecraftVersion, PackVersion, ResourcePack, ZipFileSystem, type PackPath } from "@worldlens/engine";
import type { CoreConfig } from "@worldlens/config";
import type { Logger } from "./logger.js";

export interface ResolvedResources {
    readonly resourcePack: ResourcePack;
    readonly dataPack: DataPack;
    readonly minecraftVersion: string;
}

export interface ResolveResourcesOptions {
    readonly core: CoreConfig;
    readonly packsFolder: string;
    readonly dataFolder: string;
    /** `-n`/`--mods`; null means that no explicit mods folder was requested. */
    readonly modsFolder?: string | null;
    readonly minecraftVersion: string | null;
    readonly logger: Logger;
}

/**
 * Roots contributed by the config's packs folder, highest-priority first: every entry
 * directly inside it that is a directory (a pack laid out on disk) or ends `.zip`/`.jar`
 * (a packed one). Upstream resolves the same folder through `AddonLoader`'s pack registry;
 * this direct filesystem read is the part of that upstream does that has a real port.
 */
async function packsFolderRoots(packsFolder: string): Promise<PackPath[]> {
    const roots: PackPath[] = [];
    let entries;
    try {
        entries = await readdir(packsFolder, { withFileTypes: true });
    } catch {
        return roots;
    }
    // Upstream sorts packs in reverse filename order. ResourcePool keeps the first
    // definition, so preserving this high-to-low order is not cosmetic: it is the pack
    // precedence users get when two packs define the same model or texture.
    const fileSystem = new DirFileSystem(packsFolder);
    for (const entry of entries.sort(compareNamesDescending)) {
        if (entry.isDirectory() || (entry.isFile() && /\.(?:zip|jar)$/i.test(entry.name))) {
            roots.push(fileSystem.getRoot().resolve(entry.name));
        }
    }
    return roots;
}

/**
 * Upstream's `getPackRoots` adds every regular `.jar` in the explicit mods folder.
 * Passing the jar as a PackPath (rather than opening it here) deliberately preserves
 * the engine Pack loader's support for Fabric nested jars and nested datapacks.
 */
async function modsFolderRoots(modsFolder: string): Promise<PackPath[]> {
    let entries;
    try {
        entries = await readdir(modsFolder, { withFileTypes: true });
    } catch {
        return [];
    }
    const fileSystem = new DirFileSystem(modsFolder);
    return entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".jar"))
        .sort(compareNamesDescending)
        .map((entry) => fileSystem.getRoot().resolve(entry.name));
}

async function isRegularFile(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isFile();
    } catch {
        return false;
    }
}

async function isDirectory(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isDirectory();
    } catch {
        return false;
    }
}

function compareNamesDescending(left: { name: string }, right: { name: string }): number {
    return right.name < left.name ? -1 : right.name > left.name ? 1 : 0;
}

function ancestorDirectories(start: string): string[] {
    const result: string[] = [];
    let current = start;
    while (!result.includes(current)) {
        result.push(current);
        const next = dirname(current);
        if (next === current) break;
        current = next;
    }
    return result;
}

async function digestFile(path: string): Promise<string> {
    return createHash("sha256").update(await readFile(path)).digest("hex");
}

/** Hashes a checkout source directory deterministically without creating an archive. */
async function digestDirectory(path: string): Promise<string> {
    const digest = createHash("sha256");
    const visit = async (directory: string, relative: string): Promise<void> => {
        const entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
        for (const entry of entries) {
            const childRelative = relative.length === 0 ? entry.name : `${relative}/${entry.name}`;
            const child = `${directory}/${entry.name}`;
            if (entry.isDirectory()) {
                await visit(child, childRelative);
            } else if (entry.isFile()) {
                digest.update(childRelative);
                digest.update(await readFile(child));
            }
        }
    };
    await visit(path, "");
    return digest.digest("hex");
}

interface ResourceExtensionsRoot {
    readonly root: PackPath;
    readonly location: string;
    readonly sha256: string;
    readonly kind: "zip" | "engine-package-assets" | "checkout-source";
}

/**
 * Finds the BlueMap-owned extension pack in the same layouts the standalone CLI can run
 * from: the configured data directory, a packaged resources directory, a checkout's
 * generated resource, and the vendored source tree. The source-tree fallback keeps a
 * fresh checkout runnable before Gradle has produced the zip; packaged and installed
 * layouts still prefer the actual zip and report its digest.
 */
async function resolveResourceExtensions(
    dataFolder: string,
    logger: Logger,
): Promise<ResourceExtensionsRoot> {
    const moduleDirectory = fileURLToPath(new URL(".", import.meta.url));
    const starts = [process.cwd(), dataFolder, moduleDirectory];
    // `pnpm deploy` preserves the engine package's tracked assets in the final
    // installed/Docker layout rather than manufacturing a resourceExtensions.zip.
    // Check that path explicitly before the development checkout fallbacks.
    const cliPackageRoot = dirname(moduleDirectory);
    const packagesRoot = dirname(cliPackageRoot);
    // Prefer the durable copy upstream keeps under the configured data folder, then
    // packaged/installed resources, then checkout candidates.
    const candidates = new Set<string>([`${dataFolder}/resourceExtensions.zip`]);
    const engineAssetCandidates = new Set<string>([
        `${cliPackageRoot}/node_modules/@worldlens/engine/assets/resourceExtensions`,
        `${packagesRoot}/engine/assets/resourceExtensions`,
    ]);
    for (const candidate of engineAssetCandidates) candidates.add(candidate);
    const resourcesPath = (process as NodeJS.Process & { resourcesPath?: unknown }).resourcesPath;
    const resourcesRoot = typeof resourcesPath === "string" ? resourcesPath : null;
    if (resourcesRoot !== null) {
        candidates.add(`${resourcesRoot}/resourceExtensions.zip`);
        candidates.add(`${resourcesRoot}/resources/resourceExtensions.zip`);
        candidates.add(`${resourcesRoot}/app.asar.unpacked/resourceExtensions.zip`);
    }
    for (const start of starts) {
        for (const ancestor of ancestorDirectories(start)) {
            candidates.add(`${ancestor}/resourceExtensions.zip`);
            candidates.add(`${ancestor}/resources/resourceExtensions.zip`);
            candidates.add(`${ancestor}/resources/de/bluecolored/bluemap/resourceExtensions.zip`);
            candidates.add(`${ancestor}/node_modules/@worldlens/engine/assets/resourceExtensions`);
            candidates.add(`${ancestor}/design/packages/engine/assets/resourceExtensions`);
            candidates.add(`${ancestor}/vendor/BlueMap/core/build/resources/main/de/bluecolored/bluemap/resourceExtensions.zip`);
            candidates.add(`${ancestor}/vendor/BlueMap/core/src/main/resourceExtensions`);
        }
    }

    for (const candidate of candidates) {
        if (!(await isRegularFile(candidate))) continue;
        const digest = await digestFile(candidate);
        logger.info(`Using resourceExtensions.zip from ${candidate} (sha256 ${digest}).`);
        return {
            root: new DirFileSystem(dirname(candidate)).getRoot().resolve(basename(candidate)),
            location: candidate,
            sha256: digest,
            kind: "zip",
        };
    }

    for (const candidate of candidates) {
        if (!(await isDirectory(candidate))) continue;
        const digest = await digestDirectory(candidate);
        const kind = engineAssetCandidates.has(candidate) ? "engine-package-assets" : "checkout-source";
        logger.info(`Using ${kind} resourceExtensions source from ${candidate} (sha256 ${digest}); a packaged resourceExtensions.zip was not found.`);
        return {
            root: new DirFileSystem(candidate).getRoot(),
            location: candidate,
            sha256: digest,
            kind,
        };
    }

    throw new MissingResourcesError(
        "BlueMap resourceExtensions was not found in the configured data, packaged, installed, or checkout layouts. " +
            "Install the CLI with its resourceExtensions assets or build the vendored extension pack.",
    );
}

/**
 * Reads `version.json`'s `pack_version` off the first root that has one — the same field
 * `MinecraftVersion` itself resolves from inside the client jar it downloads, exposed here
 * for the case where every root is a caller-supplied pack directory instead.
 */
async function readPackVersionFromRoots(
    roots: readonly PackPath[],
): Promise<{ resource: PackVersion; data: PackVersion } | null> {
    for (const root of roots) {
        try {
            const file = root.resolve("version.json");
            if (!(await file.isRegularFile())) continue;
            const text = await file.readText();
            const parsed = JSON.parse(text) as {
                pack_version?: { resource_major?: number; resource_minor?: number; data_major?: number; data_minor?: number };
            };
            const packVersion = parsed.pack_version;
            if (typeof packVersion?.resource_major !== "number" || typeof packVersion.data_major !== "number") continue;
            return {
                resource: new PackVersion(packVersion.resource_major, packVersion.resource_minor ?? 0),
                data: new PackVersion(packVersion.data_major, packVersion.data_minor ?? 0),
            };
        } catch {
            // a root without a readable version.json simply does not answer
        }
    }
    return null;
}

export class MissingResourcesError extends Error {}

/**
 * Resolves resources for a render. Throws {@link MissingResourcesError} — never renders
 * with nothing — when `accept-download` is false and no local pack supplies a usable
 * `version.json`, exactly mirroring upstream's `MissingResourcesException` path (`BlueMapCLI
 * .main()` catches that specifically and exits 2 with the EULA-acceptance message).
 */
export async function resolveResources(options: ResolveResourcesOptions): Promise<ResolvedResources> {
    const { core, packsFolder, dataFolder, modsFolder = null, minecraftVersion, logger } = options;

    const roots = await packsFolderRoots(packsFolder);

    // Keep the precedence explicit and in the same direction as upstream's
    // BlueMapService#getPackRoots: configured packs/addons first, then mods, then
    // BlueMap's own extension pack, and the vanilla client jar last as the fallback.
    if (modsFolder !== null) {
        if (core["scan-for-mod-resources"]) {
            roots.push(...(await modsFolderRoots(modsFolder)));
        } else {
            logger.warn("-n/--mods was supplied, but scan-for-mod-resources=false disables mod-resource loading.");
        }
    }

    const extensions = await resolveResourceExtensions(dataFolder, logger);
    roots.push(extensions.root);

    let jarVersion: MinecraftVersion | null = null;
    let jarError: unknown = null;
    try {
        jarVersion = await MinecraftVersion.load(minecraftVersion, dataFolder, core["accept-download"]);
    } catch (error) {
        jarError = error;
    }

    if (jarVersion !== null) {
        const resourceFs = await ZipFileSystem.openFile(jarVersion.getResourcePack());
        roots.push(...resourceFs.getRootDirectories());
        if (jarVersion.getDataPack() !== jarVersion.getResourcePack()) {
            const dataFs = await ZipFileSystem.openFile(jarVersion.getDataPack());
            roots.push(...dataFs.getRootDirectories());
        }
    } else if (roots.length === 0) {
        throw new MissingResourcesError(
            "BlueMap is missing important resources! You must accept the required file download in " +
                "order for BlueMap to work (set accept-download: true in core.conf), or provide a " +
                `resource pack yourself under ${packsFolder}.` +
                (jarError instanceof Error ? ` (${jarError.message})` : ""),
        );
    } else {
        logger.warn(
            `Could not resolve the Minecraft client jar (${jarError instanceof Error ? jarError.message : String(jarError)}); ` +
                "continuing with only the resources under the packs folder.",
        );
    }

    const packVersions = jarVersion !== null
        ? { resource: jarVersion.getResourcePackVersion(), data: jarVersion.getDataPackVersion() }
        : await readPackVersionFromRoots(roots);

    if (packVersions === null) {
        throw new MissingResourcesError(
            "No usable resources were found: none of the resolved pack roots carry a readable " +
                "version.json, so the resource-pack/data-pack format versions cannot be determined.",
        );
    }

    const dataPack = new DataPack(packVersions.data);
    await dataPack.loadResources(roots);

    const resourcePack = new ResourcePack(packVersions.resource);
    await resourcePack.loadResources(roots);

    return { resourcePack, dataPack, minecraftVersion: jarVersion?.getId() ?? "unknown" };
}
