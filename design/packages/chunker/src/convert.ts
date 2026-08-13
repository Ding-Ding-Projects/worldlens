import { cp, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync, inflateSync } from "node:zlib";

import { RegionFileWriter } from "@worldlens/worldgen";

import { BlockMappingTable, type BlockMappingRow, type UnmappedBlockLog } from "./blockMapping.js";
import {
    detectWorldFormat,
    formatVersion,
    listRegionFiles,
    parseVersion,
    type WorldEdition,
    type WorldVersion,
} from "./formats.js";
import {
    checkBounds,
    parseRegionFileName,
    planPrune,
    REGION_CHUNKS,
    type ChunkBounds,
    type PrunePlan,
    type RegionPlan,
} from "./prune.js";
import { writeWorldSettings, type WorldSettings, type WorldSettingsOverrides } from "./settings.js";

/**
 * The Java dimension folders, and the names this package uses for them.
 *
 * The overworld lives at the world root rather than in a folder of its own, which is why
 * this is a map to a possibly empty path rather than a straight name. A caller remapping
 * dimensions is usually moving a nether build into an overworld, so the target folder is
 * the interesting half.
 */
export const JAVA_DIMENSION_FOLDERS: Readonly<Record<string, string>> = {
    "minecraft:overworld": "",
    "minecraft:the_nether": "DIM-1",
    "minecraft:the_end": "DIM1",
};

/** which source dimension is written to which target dimension */
export type DimensionMapping = Readonly<Record<string, string>>;

/** everything a conversion needs to be planned */
export interface ConvertOptions {
    /** the world folder to read; never written to */
    readonly sourceFolder: string;
    /** the folder to write the converted world into; must not already exist */
    readonly targetFolder: string;
    /** the edition to write */
    readonly targetEdition: WorldEdition;
    /** the release the target should be, as a dotted version string */
    readonly targetVersion: string;
    /** the region boundary to keep, or null to keep everything */
    readonly bounds?: ChunkBounds | null;
    /** source dimension to target dimension, for the dimensions being remapped */
    readonly dimensions?: DimensionMapping | null;
    /** block mapping rows replacing the shipped ones */
    readonly blockMappingOverrides?: readonly BlockMappingRow[] | null;
    /** world settings to change while converting */
    readonly settings?: WorldSettingsOverrides | null;
}

/** the shape of the work, computed before any of it is done */
export interface ConversionPlan {
    readonly sourceEdition: WorldEdition;
    readonly targetEdition: WorldEdition;
    readonly targetVersion: WorldVersion;
    /** null when nothing is being pruned */
    readonly prune: PrunePlan | null;
    readonly dimensions: DimensionMapping;
    /** how many block identities the mapping table knows, shipped rows plus overrides */
    readonly mappingRows: number;
    /**
     * True when the source and target editions differ, which this package cannot do on its
     * own. It says so in the plan rather than at the end of a long copy.
     */
    readonly crossEdition: boolean;
}

/** the conversion was refused before anything was written */
export interface ConversionRefused {
    readonly kind: "refused";
    readonly reason: string;
}

/**
 * The conversion is a cross-edition one, which this package plans but does not perform.
 *
 * Rewriting a LevelDB world into Anvil is the Chunker CLI's job, and this project already
 * drives that jar from `packages/app/src/main/bedrock`. Reimplementing it here would give
 * the project two converters that disagree, so the plan is handed back and the caller
 * dispatches it. Saying this as a distinct result rather than as a refusal keeps the
 * difference visible: nothing is wrong, the work simply belongs to a different executor.
 */
export interface ConversionNeedsExternal {
    readonly kind: "needs-external-converter";
    readonly plan: ConversionPlan;
    readonly reason: string;
}

/** the conversion ran */
export interface ConversionDone {
    readonly kind: "converted";
    readonly plan: ConversionPlan;
    readonly targetFolder: string;
    /** region files written, whole or partial */
    readonly regionsWritten: number;
    /** region files that fell outside the bounds and were not written */
    readonly regionsDropped: number;
    /** chunks carried across */
    readonly chunksKept: number;
    /** the settings the written world now has, when they were read back */
    readonly settings: WorldSettings | null;
    /** blocks the mapping table had no row for, by name and count */
    readonly unmapped: readonly { name: string; count: number }[];
}

/** the conversion started and could not finish; the target folder is left for inspection */
export interface ConversionFailed {
    readonly kind: "failed";
    readonly plan: ConversionPlan | null;
    readonly reason: string;
}

export type ConversionResult =
    ConversionDone | ConversionRefused | ConversionNeedsExternal | ConversionFailed;

async function exists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

/**
 * Works out what a conversion would do, without doing any of it.
 *
 * Every refusal is a returned value. A planner that threw would make the obvious caller,
 * a dialog previewing the conversion before the user commits to it, wrap every call in a
 * try block and turn a typed reason into an untyped message.
 */
export async function planConversion(
    options: ConvertOptions,
): Promise<{ ok: true; plan: ConversionPlan } | { ok: false; reason: string }> {
    const version = parseVersion(options.targetVersion);
    if (!version.ok) return { ok: false, reason: version.reason };

    const detection = await detectWorldFormat(options.sourceFolder);
    if (detection.kind === "unknown") return { ok: false, reason: detection.reason };

    if (await exists(options.targetFolder))
        return {
            ok: false,
            reason:
                "There is already something at " +
                options.targetFolder +
                ". A conversion writes a new world rather than merging into an existing one, " +
                "so the target is left alone.",
        };

    let prune: PrunePlan | null = null;
    if (options.bounds !== undefined && options.bounds !== null) {
        const checked = checkBounds(options.bounds);
        if (!checked.ok) return { ok: false, reason: checked.reason };
        prune = planPrune(await listRegionFiles(options.sourceFolder), checked.bounds);
    }

    const table = BlockMappingTable.create(options.blockMappingOverrides ?? []);

    return {
        ok: true,
        plan: {
            sourceEdition: detection.edition,
            targetEdition: options.targetEdition,
            targetVersion: version.version,
            prune,
            dimensions: options.dimensions ?? {},
            mappingRows: table.size,
            crossEdition: detection.edition !== options.targetEdition,
        },
    };
}

/**
 * Turns a dimension mapping into the folder renames it implies.
 *
 * Only the dimensions that live in a folder of their own can be renamed this way. The
 * overworld sits at the world root, so a mapping that moves the nether into the overworld
 * would have to merge two folders and decide which of two chunks at the same coordinate
 * wins. That is a decision this package refuses to make silently, so such an entry produces
 * no rename and the source folder is copied where it was.
 */
export function dimensionFolderRenames(mapping: DimensionMapping): Map<string, string> {
    const renames = new Map<string, string>();
    for (const [source, target] of Object.entries(mapping)) {
        const sourceFolder = JAVA_DIMENSION_FOLDERS[source];
        const targetFolder = JAVA_DIMENSION_FOLDERS[target];
        if (sourceFolder === undefined || targetFolder === undefined) continue;
        if (sourceFolder === "" || targetFolder === "") continue;
        if (sourceFolder === targetFolder) continue;
        renames.set(sourceFolder, targetFolder);
    }
    return renames;
}

/** the four-byte-per-entry offset table at the head of a region file */
const REGION_HEADER_BYTES = 4096;
const SECTOR_SIZE = 4096;

/**
 * Copies the chunks of one region file that survive a prune into a new region file.
 *
 * The payloads are decompressed on the way in and left to `RegionFileWriter` to compress on
 * the way out rather than being copied compressed. That costs time and buys a guarantee:
 * the written region uses one compression scheme throughout, which is what this project's
 * own reader expects, whereas a source region may mix zlib and gzip payloads depending on
 * which version of the game last touched it.
 */
async function copyRegion(
    sourcePath: string,
    targetPath: string,
    plan: RegionPlan,
): Promise<number> {
    const bytes = await readFile(sourcePath);
    if (bytes.length < REGION_HEADER_BYTES) return 0;

    const writer = await RegionFileWriter.create(targetPath);
    let written = 0;
    try {
        for (const chunk of plan.chunks) {
            const localX = ((chunk.x % REGION_CHUNKS) + REGION_CHUNKS) % REGION_CHUNKS;
            const localZ = ((chunk.z % REGION_CHUNKS) + REGION_CHUNKS) % REGION_CHUNKS;
            const entry = (localX + localZ * REGION_CHUNKS) * 4;

            const b0 = bytes[entry] ?? 0;
            const b1 = bytes[entry + 1] ?? 0;
            const b2 = bytes[entry + 2] ?? 0;
            const sectors = bytes[entry + 3] ?? 0;
            const offset = ((b0 << 16) | (b1 << 8) | b2) * SECTOR_SIZE;

            // A zero offset or sector count means the chunk was never generated. That is the
            // normal state of most of a region file and is not a fault.
            if (offset === 0 || sectors === 0) continue;
            if (offset + 5 > bytes.length) continue;

            const length =
                ((bytes[offset] ?? 0) << 24) |
                ((bytes[offset + 1] ?? 0) << 16) |
                ((bytes[offset + 2] ?? 0) << 8) |
                (bytes[offset + 3] ?? 0);
            const compression = bytes[offset + 4] ?? 0;
            const payload = bytes.subarray(offset + 5, offset + 4 + length);
            if (payload.length === 0) continue;

            let raw: Uint8Array;
            if (compression === 1) raw = gunzipSync(payload);
            else if (compression === 2) raw = inflateSync(payload);
            else if (compression === 3) raw = payload;
            else continue;

            await writer.addChunk(chunk.x, chunk.z, raw);
            written++;
        }
    } finally {
        await writer.close();
    }

    return written;
}

/**
 * Runs a conversion.
 *
 * This never throws across its own boundary. Every failure, including one that happens
 * halfway through writing, comes back as a `failed` result naming what went wrong, because
 * the caller's job on a failure is to tell the user and offer the target folder for
 * inspection rather than to unwind a stack.
 *
 * What it performs itself is the same-edition work: pruning by boundary, dimension
 * remapping and settings editing. A cross-edition conversion comes back as
 * `needs-external-converter` with the plan attached, for the Chunker CLI integration to run.
 */
export async function convertWorld(
    options: ConvertOptions,
    unmappedLog?: UnmappedBlockLog,
): Promise<ConversionResult> {
    const planned = await planConversion(options);
    if (!planned.ok) return { kind: "refused", reason: planned.reason };

    const plan = planned.plan;
    if (plan.crossEdition)
        return {
            kind: "needs-external-converter",
            plan,
            reason:
                "Converting " +
                plan.sourceEdition +
                " to " +
                plan.targetEdition +
                " at " +
                formatVersion(plan.targetVersion) +
                " rewrites every chunk between two storage formats, which the Chunker CLI does. " +
                "The plan is returned for that executor to run.",
        };

    try {
        await mkdir(options.targetFolder, { recursive: true });

        // Everything that is not a region directory is carried across untouched: level.dat,
        // player data, data packs, statistics. A converter that only wrote the parts it
        // understood would silently drop the parts it did not.
        const folderRenames = dimensionFolderRenames(plan.dimensions);
        const entries = await readdir(options.sourceFolder, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory() && entry.name === "region") continue;
            const targetName = folderRenames.get(entry.name) ?? entry.name;
            await cp(
                join(options.sourceFolder, entry.name),
                join(options.targetFolder, targetName),
                {
                    recursive: true,
                },
            );
        }

        let regionsWritten = 0;
        let regionsDropped = 0;
        let chunksKept = 0;

        const sourceRegions = await listRegionFiles(options.sourceFolder);
        if (sourceRegions.length > 0) {
            const targetRegionFolder = join(options.targetFolder, "region");
            await mkdir(targetRegionFolder, { recursive: true });

            for (const name of sourceRegions) {
                const sourcePath = join(options.sourceFolder, "region", name);
                const targetPath = join(targetRegionFolder, name);

                if (plan.prune === null) {
                    await cp(sourcePath, targetPath);
                    regionsWritten++;
                    continue;
                }

                const regionPlan = plan.prune.regions.find((region) => region.fileName === name);
                const coordinates = parseRegionFileName(name);
                if (regionPlan === undefined || coordinates === null) {
                    regionsDropped++;
                    continue;
                }

                if (regionPlan.disposition === "delete") {
                    regionsDropped++;
                    continue;
                }

                if (regionPlan.disposition === "keep-whole") {
                    await cp(sourcePath, targetPath);
                    regionsWritten++;
                    chunksKept += regionPlan.chunks.length;
                    continue;
                }

                const written = await copyRegion(sourcePath, targetPath, regionPlan);
                if (written === 0) {
                    // The region overlapped the bounds but held no generated chunk there, so
                    // an empty region file would be a file the game has to open to learn
                    // nothing. Removing it keeps the converted world the size it claims.
                    await rm(targetPath, { force: true });
                    regionsDropped++;
                    continue;
                }
                regionsWritten++;
                chunksKept += written;
            }
        }

        let settings: WorldSettings | null = null;
        if (options.settings !== undefined && options.settings !== null) {
            const written = await writeWorldSettings(options.targetFolder, options.settings);
            if (!written.ok) return { kind: "failed", plan, reason: written.reason };
            settings = written.settings;
        }

        return {
            kind: "converted",
            plan,
            targetFolder: options.targetFolder,
            regionsWritten,
            regionsDropped,
            chunksKept,
            settings,
            unmapped: unmappedLog?.entries() ?? [],
        };
    } catch (error) {
        return {
            kind: "failed",
            plan,
            reason:
                "The conversion stopped part way through and " +
                options.targetFolder +
                " holds whatever had been written by then: " +
                String(error),
        };
    }
}
