import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * The two editions this converter moves worlds between.
 *
 * They are kept as a string union rather than an enum because every consumer of this
 * package either persists the value into a project file or ships it across the IPC
 * boundary, and a string survives both without a lookup table on the far side.
 */
export type WorldEdition = "java" | "bedrock";

/** the directory a Bedrock world keeps its LevelDB in */
export const BEDROCK_DB_DIRECTORY = "db";
/** the file every Java and Bedrock world names its level data with */
export const LEVEL_DAT_FILE = "level.dat";
/** the plain-text world name a Bedrock world carries beside its level data */
export const BEDROCK_NAME_FILE = "levelname.txt";
/** the directory a Java world keeps its Anvil region files in */
export const JAVA_REGION_DIRECTORY = "region";

/**
 * A Minecraft version, parsed into parts so that two of them can be ordered.
 *
 * Only the three numeric components are modelled. Snapshot and pre-release labels exist,
 * but a converter that claims to place `24w14a` precisely between two releases would be
 * asserting an ordering nobody can check, so those are refused at the parse boundary
 * instead of guessed at.
 */
export interface WorldVersion {
    readonly major: number;
    readonly minor: number;
    readonly patch: number;
}

/** an inclusive span of versions, used to say which versions a mapping table covers */
export interface VersionRange {
    readonly from: WorldVersion;
    readonly to: WorldVersion;
}

/** a version string that could not be read, reported rather than thrown */
export interface VersionParseFailure {
    readonly ok: false;
    readonly reason: string;
}

/** a version string that was read */
export interface VersionParseSuccess {
    readonly ok: true;
    readonly version: WorldVersion;
}

export type VersionParseResult = VersionParseSuccess | VersionParseFailure;

const VERSION_PATTERN = /^(\d+)\.(\d+)(?:\.(\d+))?$/;

/**
 * Reads a release version such as `1.21` or `1.20.4`.
 *
 * A missing patch component means zero, which is how Mojang writes the `.0` releases,
 * so `1.21` and `1.21.0` compare equal rather than one sorting below the other.
 */
export function parseVersion(text: string): VersionParseResult {
    const match = VERSION_PATTERN.exec(text.trim());
    if (match === null)
        return {
            ok: false,
            reason:
                "Version '" +
                text +
                "' is not a release version of the form 1.21 or 1.20.4. Snapshots and " +
                "pre-releases are not orderable here and are refused rather than guessed at.",
        };

    // The capture groups are all digits by construction, so Number cannot produce NaN here.
    return {
        ok: true,
        version: {
            major: Number(match[1]),
            minor: Number(match[2]),
            patch: match[3] === undefined ? 0 : Number(match[3]),
        },
    };
}

/** renders a version back to the dotted form it was read from */
export function formatVersion(version: WorldVersion): string {
    return version.major + "." + version.minor + "." + version.patch;
}

/** negative when `a` is older, zero when the two are the same release, positive when newer */
export function compareVersions(a: WorldVersion, b: WorldVersion): number {
    if (a.major !== b.major) return a.major - b.major;
    if (a.minor !== b.minor) return a.minor - b.minor;
    return a.patch - b.patch;
}

/** whether a version sits inside an inclusive range */
export function versionInRange(version: WorldVersion, range: VersionRange): boolean {
    return compareVersions(version, range.from) >= 0 && compareVersions(version, range.to) <= 0;
}

/**
 * What the first bytes of a `level.dat` say about which edition wrote it.
 *
 * Java writes gzip-compressed NBT, so the file opens with the gzip magic `1f 8b`. Bedrock
 * writes an eight byte little-endian header (a storage version and the byte length of the
 * payload) followed by uncompressed NBT whose first tag is a compound, so byte eight is
 * `0x0a`. Those two shapes cannot be confused with each other, which is why the decision
 * is made from bytes rather than from whether a `db` folder happens to sit alongside.
 */
export type LevelDatShape = "java-gzip" | "java-raw" | "bedrock-header" | "unrecognised";

/** classifies a `level.dat` payload without decompressing it */
export function classifyLevelDat(bytes: Uint8Array): LevelDatShape {
    if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) return "java-gzip";

    // A Bedrock level.dat is version int, length int, then the root compound tag.
    if (bytes.length >= 9 && bytes[8] === 0x0a && bytes[1] === 0x00 && bytes[2] === 0x00)
        return "bedrock-header";

    // An uncompressed Java level.dat starts straight at the root compound, whose name is
    // empty, giving tag 0x0a followed by a two byte length of zero.
    if (bytes.length >= 3 && bytes[0] === 0x0a && bytes[1] === 0x00 && bytes[2] === 0x00)
        return "java-raw";

    return "unrecognised";
}

/** a world folder that was identified */
export interface WorldFormatDetected {
    readonly kind: "detected";
    readonly edition: WorldEdition;
    /** the folder the evidence was read from */
    readonly folder: string;
    /** the exact files that decided it, so a report can say why */
    readonly evidence: readonly string[];
}

/** a world folder that could not be identified, reported as a value */
export interface WorldFormatUnknown {
    readonly kind: "unknown";
    readonly folder: string;
    readonly reason: string;
}

export type WorldFormatDetection = WorldFormatDetected | WorldFormatUnknown;

async function isDirectory(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isDirectory();
    } catch {
        return false;
    }
}

/**
 * Decides which edition wrote the world in `worldFolder`, from the files that are there.
 *
 * The folder name is deliberately not consulted. A world exported from a phone, unpacked
 * from a backup or renamed by a player carries whatever name somebody typed, and a
 * converter that trusted it would happily read a Bedrock world as Java and report the
 * resulting garbage as a corrupt world.
 *
 * Every refusal comes back as a value. A missing folder, an unreadable `level.dat` and a
 * folder holding neither edition's evidence are all ordinary answers to the question
 * "what is this", not exceptional conditions.
 */
export async function detectWorldFormat(worldFolder: string): Promise<WorldFormatDetection> {
    if (!(await isDirectory(worldFolder)))
        return {
            kind: "unknown",
            folder: worldFolder,
            reason: "There is no folder at that path, so there is nothing to identify.",
        };

    const levelDatPath = join(worldFolder, LEVEL_DAT_FILE);
    let head: Uint8Array;
    try {
        head = await readFile(levelDatPath);
    } catch {
        return {
            kind: "unknown",
            folder: worldFolder,
            reason:
                "The folder holds no readable " +
                LEVEL_DAT_FILE +
                ", which both editions write, so it is not a world folder.",
        };
    }

    const shape = classifyLevelDat(head);
    const hasDb = await isDirectory(join(worldFolder, BEDROCK_DB_DIRECTORY));
    const hasRegion = await isDirectory(join(worldFolder, JAVA_REGION_DIRECTORY));

    if (shape === "bedrock-header") {
        const evidence = [LEVEL_DAT_FILE];
        if (hasDb) evidence.push(BEDROCK_DB_DIRECTORY + "/");
        return { kind: "detected", edition: "bedrock", folder: worldFolder, evidence };
    }

    if (shape === "java-gzip" || shape === "java-raw") {
        const evidence = [LEVEL_DAT_FILE];
        if (hasRegion) evidence.push(JAVA_REGION_DIRECTORY + "/");
        return { kind: "detected", edition: "java", folder: worldFolder, evidence };
    }

    return {
        kind: "unknown",
        folder: worldFolder,
        reason:
            "The first bytes of " +
            LEVEL_DAT_FILE +
            " match neither Java's gzip NBT nor Bedrock's length-prefixed NBT, so the file " +
            "is either truncated or was written by something else.",
    };
}

/**
 * Lists the region files a Java world holds, sorted, so a plan reads the same way twice.
 *
 * A missing region directory yields an empty list rather than a refusal: a freshly created
 * world that has never been walked into genuinely has no regions, and that is a fact about
 * the world rather than a fault in reading it.
 */
export async function listRegionFiles(worldFolder: string): Promise<readonly string[]> {
    try {
        const names = await readdir(join(worldFolder, JAVA_REGION_DIRECTORY));
        return names.filter((name) => name.endsWith(".mca")).sort();
    } catch {
        return [];
    }
}
