/**
 * The shape of a Chunker conversion, and the arithmetic the page shows before it runs.
 *
 * Kept out of `ChunkerScreen.vue` because everything here is answerable without a
 * component: which target versions exist, how many chunks a boundary keeps, and which
 * consequences a given plan carries. A screen that computed those inline could only be
 * checked by mounting it, and the sentence that matters most on this page - the list of
 * things a conversion will drop - is exactly the sentence that must be checkable.
 *
 * ## Why the version lists are enumerated rather than typed
 *
 * Chunker names its formats (`JAVA_1_21_4`, `BEDROCK_1_21_40`), and a free-text box would
 * let somebody type a format string that the converter then rejects several minutes into a
 * run. The list below is short, real, and the only thing the page offers.
 */

/** The two editions a world can be in, and be converted between. */
export type Edition = "java" | "bedrock";

export interface EditionVersion {
    /** Chunker's own format id, passed straight through to the converter. */
    readonly id: string;
    /** What a person calls it. */
    readonly label: string;
}

/**
 * The Java targets Chunker writes, newest first.
 *
 * `DEFAULT_JAVA_TARGET` in `main/bedrock/convert.ts` is `JAVA_1_21_4`, which is why that
 * one heads the list: the page's default and the converter's default agree rather than
 * quietly differing by one entry.
 */
export const JAVA_VERSIONS: readonly EditionVersion[] = [
    { id: "JAVA_1_21_4", label: "Java 1.21.4" },
    { id: "JAVA_1_21_0", label: "Java 1.21" },
    { id: "JAVA_1_20_5", label: "Java 1.20.5" },
    { id: "JAVA_1_20_0", label: "Java 1.20" },
    { id: "JAVA_1_19_0", label: "Java 1.19" },
    { id: "JAVA_1_18_0", label: "Java 1.18" },
    { id: "JAVA_1_17_0", label: "Java 1.17" },
    { id: "JAVA_1_16_0", label: "Java 1.16" },
    { id: "JAVA_1_13_0", label: "Java 1.13" },
    { id: "JAVA_1_12_2", label: "Java 1.12.2" },
];

export const BEDROCK_VERSIONS: readonly EditionVersion[] = [
    { id: "BEDROCK_1_21_40", label: "Bedrock 1.21.40" },
    { id: "BEDROCK_1_21_0", label: "Bedrock 1.21" },
    { id: "BEDROCK_1_20_80", label: "Bedrock 1.20.80" },
    { id: "BEDROCK_1_20_0", label: "Bedrock 1.20" },
    { id: "BEDROCK_1_19_0", label: "Bedrock 1.19" },
    { id: "BEDROCK_1_18_0", label: "Bedrock 1.18" },
    { id: "BEDROCK_1_17_0", label: "Bedrock 1.17" },
    { id: "BEDROCK_1_16_0", label: "Bedrock 1.16" },
];

/** Every target version of one edition. */
export function versionsFor(edition: Edition): readonly EditionVersion[] {
    return edition === "java" ? JAVA_VERSIONS : BEDROCK_VERSIONS;
}

/** The first entry of an edition's list, which is what the page starts on. */
export function defaultVersionFor(edition: Edition): string {
    const versions = versionsFor(edition);
    return versions[0]?.id ?? "";
}

/**
 * Which edition a Chunker format id belongs to, or null when the string is neither.
 *
 * Null rather than a default on purpose: a format this build does not recognise is an
 * honest unknown, and the page says so instead of drawing a Java badge over a string it
 * never parsed.
 */
export function editionOfFormat(format: string | null): Edition | null {
    if (format === null) return null;
    const upper = format.toUpperCase();
    if (upper.startsWith("JAVA")) return "java";
    if (upper.startsWith("BEDROCK")) return "bedrock";
    return null;
}

/* -------------------------------------------------------------------------- */
/* Dimensions                                                                 */
/* -------------------------------------------------------------------------- */

export const DIMENSIONS = ["overworld", "nether", "end"] as const;

export type DimensionId = (typeof DIMENSIONS)[number];

/** A source dimension either becomes a target dimension, or is not carried over at all. */
export type DimensionTarget = DimensionId | "drop";

export type DimensionMapping = Readonly<Record<DimensionId, DimensionTarget>>;

/** Every dimension to itself, which is what a conversion does unless somebody says otherwise. */
export const IDENTITY_DIMENSIONS: DimensionMapping = {
    overworld: "overworld",
    nether: "nether",
    end: "end",
};

/** The dimensions this plan will not carry over, in the order they are listed. */
export function droppedDimensions(mapping: DimensionMapping): readonly DimensionId[] {
    return DIMENSIONS.filter((dimension) => mapping[dimension] === "drop");
}

/** The dimensions this plan sends somewhere other than themselves. */
export function remappedDimensions(
    mapping: DimensionMapping,
): readonly { readonly from: DimensionId; readonly to: DimensionId }[] {
    return DIMENSIONS.flatMap((from) => {
        const to = mapping[from];
        if (to === "drop" || to === from) return [];
        return [{ from, to }];
    });
}

/* -------------------------------------------------------------------------- */
/* Trimming                                                                   */
/* -------------------------------------------------------------------------- */

/** Sixteen blocks to a chunk, in both editions, in every version this page offers. */
export const CHUNK_BLOCKS = 16;

/** A boundary in block coordinates, which is the unit somebody reads off their F3 screen. */
export interface PruneBounds {
    readonly enabled: boolean;
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
}

export const NO_PRUNE: PruneBounds = { enabled: false, minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 };

/** True when the boundary is the wrong way round, which keeps nothing at all. */
export function boundsInverted(bounds: PruneBounds): boolean {
    return bounds.maxX < bounds.minX || bounds.maxZ < bounds.minZ;
}

/**
 * How many chunks a boundary keeps.
 *
 * Computed in chunks rather than blocks because a chunk is the unit that is actually kept
 * or dropped: a boundary that cuts a chunk in half keeps the whole chunk, and a summary
 * quoting a block area would understate what survives.
 */
export function keptChunkCount(bounds: PruneBounds): number {
    if (!bounds.enabled || boundsInverted(bounds)) return 0;
    const chunkMinX = Math.floor(bounds.minX / CHUNK_BLOCKS);
    const chunkMaxX = Math.floor(bounds.maxX / CHUNK_BLOCKS);
    const chunkMinZ = Math.floor(bounds.minZ / CHUNK_BLOCKS);
    const chunkMaxZ = Math.floor(bounds.maxZ / CHUNK_BLOCKS);
    return (chunkMaxX - chunkMinX + 1) * (chunkMaxZ - chunkMinZ + 1);
}

/* -------------------------------------------------------------------------- */
/* Block mapping overrides                                                    */
/* -------------------------------------------------------------------------- */

export interface BlockOverride {
    readonly id: string;
    /** The block as it appears in the source world, namespaced. */
    readonly from: string;
    /** What it becomes in the converted world, namespaced. */
    readonly to: string;
}

/** One searchable line per override, so the search field filters on what is on screen. */
export function blockOverrideSearchText(override: BlockOverride): string {
    return `${override.from} ${override.to}`;
}

/* -------------------------------------------------------------------------- */
/* World settings                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The game rules this page can edit.
 *
 * A short, real list rather than every rule the game has: these are the ones whose value
 * survives a conversion in both directions, and offering a rule that one edition silently
 * ignores would be a control that appears to do something and does not.
 */
export const GAME_RULES: readonly string[] = [
    "doDaylightCycle",
    "doWeatherCycle",
    "doMobSpawning",
    "keepInventory",
    "mobGriefing",
    "doFireTick",
];

export interface WorldSettingsDraft {
    /** Empty means "leave the converted world's name as Chunker writes it". */
    readonly name: string;
    /** Empty means "keep the source world's seed". */
    readonly seed: string;
    /** Null means "keep the source world's spawn". All three move together or not at all. */
    readonly spawnX: number | null;
    readonly spawnY: number | null;
    readonly spawnZ: number | null;
    /** Only the rules somebody actually changed. An absent rule is left as the world has it. */
    readonly gameRules: Readonly<Record<string, boolean>>;
}

export const EMPTY_WORLD_SETTINGS: WorldSettingsDraft = {
    name: "",
    seed: "",
    spawnX: null,
    spawnY: null,
    spawnZ: null,
    gameRules: {},
};

/** True when all three spawn coordinates are set, which is the only state that can be written. */
export function spawnComplete(settings: WorldSettingsDraft): boolean {
    return settings.spawnX !== null && settings.spawnY !== null && settings.spawnZ !== null;
}

/* -------------------------------------------------------------------------- */
/* The plan, and what it costs                                                */
/* -------------------------------------------------------------------------- */

export interface ConversionPlan {
    readonly sourceFolder: string;
    /** Chunker's format id for the source, or null when this build could not read one. */
    readonly sourceFormat: string | null;
    readonly targetEdition: Edition;
    readonly targetVersionId: string;
    readonly outputFolder: string;
    readonly bounds: PruneBounds;
    readonly dimensions: DimensionMapping;
    readonly blockOverrides: readonly BlockOverride[];
    readonly settings: WorldSettingsDraft;
}

/** One thing the conversion will drop or approximate, named before it happens. */
export interface LossyConsequence {
    readonly id: string;
    /** Plain words, no placeholder: the review list reads these out as written. */
    readonly detail: string;
}

/**
 * Everything this plan will drop or approximate, in the order the review step shows it.
 *
 * Two kinds of entry live here and both belong. The first kind is a consequence of the
 * plan somebody built: a boundary drops chunks, a dropped dimension drops a whole world,
 * an override replaces a block everywhere. The second kind is a consequence of crossing
 * editions at all, which Chunker's own notes describe and which nobody chose - and which
 * is exactly why it has to be stated rather than assumed to be common knowledge.
 */
export function lossyConsequences(plan: ConversionPlan): readonly LossyConsequence[] {
    const notes: LossyConsequence[] = [];

    if (plan.bounds.enabled) {
        const kept = keptChunkCount(plan.bounds);
        notes.push({
            id: "trim",
            detail:
                `Trimming keeps about ${kept} chunk(s) between X ${plan.bounds.minX} and ${plan.bounds.maxX} ` +
                `and Z ${plan.bounds.minZ} and ${plan.bounds.maxZ}. Everything outside that boundary, ` +
                "including any building standing on it, is absent from the converted world.",
        });
    }

    for (const dimension of droppedDimensions(plan.dimensions)) {
        notes.push({
            id: `dimension-drop-${dimension}`,
            detail: `The ${dimension} is not carried over. Nothing built there appears in the converted world.`,
        });
    }

    for (const move of remappedDimensions(plan.dimensions)) {
        notes.push({
            id: `dimension-move-${move.from}-${move.to}`,
            detail:
                `The ${move.from} is written into the ${move.to}. Coordinates are kept as they are, ` +
                "so anything already in the destination is overwritten where the two overlap.",
        });
    }

    for (const override of plan.blockOverrides) {
        notes.push({
            id: `block-${override.id}`,
            detail: `Every ${override.from} becomes ${override.to}, everywhere in the world, with no way to tell afterwards which was which.`,
        });
    }

    const sourceEdition = editionOfFormat(plan.sourceFormat);
    if (sourceEdition !== null && sourceEdition !== plan.targetEdition) {
        notes.push({
            id: "cross-edition",
            detail:
                "Crossing editions replaces blocks and entities that only exist on one side with the " +
                "closest equivalent, and drops the ones that have none. Command blocks, scoreboards and " +
                "custom structures are the usual casualties.",
        });
    }

    if (plan.settings.seed.length > 0) {
        notes.push({
            id: "seed",
            detail:
                "Changing the seed changes what generates outside the chunks that already exist, so new " +
                "terrain will not line up with the old at the edges.",
        });
    }

    return notes;
}
