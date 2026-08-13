import type { WorldEdition } from "./formats.js";

/**
 * The block identity mapping between the two editions.
 *
 * The table format is one row per identity, holding the Java name, the Bedrock name, and
 * any block state values that differ between the two. A row is deliberately symmetrical:
 * one row serves both directions, so a Java to Bedrock conversion and the Bedrock to Java
 * conversion of the same world cannot disagree about which pair of names belong together.
 *
 * State handling is a per-property rename plus a per-value rename, both optional. That
 * covers the overwhelming majority of real differences (Bedrock's `stone_slab_type`
 * against Java's separate slab ids, `facing_direction` against `facing`) without pretending
 * this package can express the handful of blocks whose shapes genuinely have no
 * counterpart. Those rows are simply absent, and an absent row is reported by name.
 */
export interface BlockMappingRow {
    /** the Java block id, namespaced, for example `minecraft:oak_log` */
    readonly java: string;
    /** the Bedrock block id, namespaced */
    readonly bedrock: string;
    /**
     * Property renames, keyed by the Java property name. A property absent from this map
     * keeps its name in both editions.
     */
    readonly properties?: Readonly<Record<string, string>>;
    /**
     * Value renames, keyed by the Java property name and then the Java value. A value
     * absent from this map is carried across unchanged.
     */
    readonly values?: Readonly<Record<string, Readonly<Record<string, string>>>>;
    /** a note for the conversion report, for a row that is close rather than exact */
    readonly note?: string;
}

/** a block as it appears in a chunk: an id plus its state properties */
export interface BlockIdentity {
    readonly name: string;
    readonly properties: Readonly<Record<string, string>>;
}

/** the block was mapped, possibly with a note the report should carry */
export interface BlockMapped {
    readonly kind: "mapped";
    readonly block: BlockIdentity;
    readonly note: string | null;
}

/**
 * The block has no row in the table.
 *
 * This is returned rather than substituting air on purpose. Silently substituting air is
 * how a converted world loses a build and reports success: the chunk still reads, the
 * region file is still valid, and the only evidence is a hole where something used to be.
 * Naming the block makes the loss countable before anything is written.
 */
export interface BlockUnmapped {
    readonly kind: "unmapped";
    readonly name: string;
    readonly from: WorldEdition;
    readonly to: WorldEdition;
}

export type BlockMappingResult = BlockMapped | BlockUnmapped;

/**
 * The rows this package ships with.
 *
 * This is a starting set covering the blocks a world is mostly made of, not a complete
 * registry. Completeness is what the override mechanism is for: a user with a modded or
 * newer world supplies the rows this table lacks rather than waiting for the table to grow,
 * and an unmapped block is reported by name so they know exactly which rows to supply.
 */
export const DEFAULT_BLOCK_MAPPINGS: readonly BlockMappingRow[] = [
    { java: "minecraft:air", bedrock: "minecraft:air" },
    { java: "minecraft:stone", bedrock: "minecraft:stone" },
    { java: "minecraft:granite", bedrock: "minecraft:granite" },
    { java: "minecraft:diorite", bedrock: "minecraft:diorite" },
    { java: "minecraft:andesite", bedrock: "minecraft:andesite" },
    { java: "minecraft:deepslate", bedrock: "minecraft:deepslate" },
    { java: "minecraft:dirt", bedrock: "minecraft:dirt" },
    { java: "minecraft:coarse_dirt", bedrock: "minecraft:coarse_dirt" },
    { java: "minecraft:gravel", bedrock: "minecraft:gravel" },
    { java: "minecraft:sand", bedrock: "minecraft:sand" },
    { java: "minecraft:sandstone", bedrock: "minecraft:sandstone" },
    { java: "minecraft:bedrock", bedrock: "minecraft:bedrock" },
    { java: "minecraft:water", bedrock: "minecraft:water" },
    { java: "minecraft:lava", bedrock: "minecraft:lava" },
    {
        java: "minecraft:grass_block",
        bedrock: "minecraft:grass_block",
        note: "Bedrock renamed this from 'grass' in 1.20; older Bedrock worlds carry the short name.",
    },
    { java: "minecraft:oak_log", bedrock: "minecraft:oak_log" },
    { java: "minecraft:oak_planks", bedrock: "minecraft:oak_planks" },
    { java: "minecraft:oak_leaves", bedrock: "minecraft:oak_leaves" },
    { java: "minecraft:glass", bedrock: "minecraft:glass" },
    { java: "minecraft:cobblestone", bedrock: "minecraft:cobblestone" },
    { java: "minecraft:snow_block", bedrock: "minecraft:snow" },
    { java: "minecraft:ice", bedrock: "minecraft:ice" },
    {
        java: "minecraft:oak_stairs",
        bedrock: "minecraft:oak_stairs",
        properties: { facing: "weirdo_direction", half: "upside_down_bit" },
        values: {
            half: { top: "1", bottom: "0" },
            facing: { east: "0", west: "1", south: "2", north: "3" },
        },
        note: "Bedrock encodes stair facing as a numeric direction rather than a compass name.",
    },
    {
        java: "minecraft:torch",
        bedrock: "minecraft:torch",
        properties: {},
        values: {},
    },
];

/**
 * A mapping table with user overrides layered on top of the shipped rows.
 *
 * An override row replaces a shipped row with the same Java id outright rather than being
 * merged into it. Merging would leave a user unable to remove a property rename they
 * disagree with, and a mapping they cannot fully control is a mapping they cannot fix.
 */
export class BlockMappingTable {
    private readonly byJava: Map<string, BlockMappingRow>;
    private readonly byBedrock: Map<string, BlockMappingRow>;

    private constructor(rows: readonly BlockMappingRow[]) {
        this.byJava = new Map();
        this.byBedrock = new Map();
        for (const row of rows) {
            this.byJava.set(row.java, row);
            this.byBedrock.set(row.bedrock, row);
        }
    }

    /** the shipped table, with the given override rows replacing any row of the same Java id */
    static create(overrides: readonly BlockMappingRow[] = []): BlockMappingTable {
        const merged = new Map<string, BlockMappingRow>();
        for (const row of DEFAULT_BLOCK_MAPPINGS) merged.set(row.java, row);
        for (const row of overrides) merged.set(row.java, row);
        return new BlockMappingTable([...merged.values()]);
    }

    /** how many identities the table knows */
    get size(): number {
        return this.byJava.size;
    }

    /** the row for a Java id, or null when the table has none */
    rowForJava(name: string): BlockMappingRow | null {
        return this.byJava.get(name) ?? null;
    }

    /** the row for a Bedrock id, or null when the table has none */
    rowForBedrock(name: string): BlockMappingRow | null {
        return this.byBedrock.get(name) ?? null;
    }

    /** maps one block from Java to Bedrock, reporting an unknown id by name */
    toBedrock(block: BlockIdentity): BlockMappingResult {
        const row = this.byJava.get(block.name);
        if (row === undefined)
            return { kind: "unmapped", name: block.name, from: "java", to: "bedrock" };

        const properties: Record<string, string> = {};
        for (const [property, value] of Object.entries(block.properties)) {
            const renamedProperty = row.properties?.[property] ?? property;
            const renamedValue = row.values?.[property]?.[value] ?? value;
            properties[renamedProperty] = renamedValue;
        }

        return {
            kind: "mapped",
            block: { name: row.bedrock, properties },
            note: row.note ?? null,
        };
    }

    /** maps one block from Bedrock to Java, reporting an unknown id by name */
    toJava(block: BlockIdentity): BlockMappingResult {
        const row = this.byBedrock.get(block.name);
        if (row === undefined)
            return { kind: "unmapped", name: block.name, from: "bedrock", to: "java" };

        // The row is written Java-first, so both renames are inverted here. Two Java values
        // that mapped onto one Bedrock value cannot be told apart on the way back, and the
        // first row wins rather than the last, so the direction is at least deterministic.
        const propertyBack = new Map<string, string>();
        for (const [javaProperty, bedrockProperty] of Object.entries(row.properties ?? {}))
            if (!propertyBack.has(bedrockProperty)) propertyBack.set(bedrockProperty, javaProperty);

        const properties: Record<string, string> = {};
        for (const [property, value] of Object.entries(block.properties)) {
            const javaProperty = propertyBack.get(property) ?? property;
            const valueBack = row.values?.[javaProperty];
            let javaValue = value;
            if (valueBack !== undefined)
                for (const [candidateJavaValue, bedrockValue] of Object.entries(valueBack))
                    if (bedrockValue === value) {
                        javaValue = candidateJavaValue;
                        break;
                    }
            properties[javaProperty] = javaValue;
        }

        return {
            kind: "mapped",
            block: { name: row.java, properties },
            note: row.note ?? null,
        };
    }
}

/**
 * A running tally of the blocks a conversion could not map.
 *
 * Counting rather than listing every occurrence is what keeps a report readable: a world
 * missing one row will produce that block a million times, and a million identical lines is
 * a report nobody reads. The name and the count together are what a user needs to write the
 * override row.
 */
export class UnmappedBlockLog {
    private readonly counts = new Map<string, number>();

    record(result: BlockMappingResult): void {
        if (result.kind !== "unmapped") return;
        this.counts.set(result.name, (this.counts.get(result.name) ?? 0) + 1);
    }

    /** whether anything failed to map */
    get empty(): boolean {
        return this.counts.size === 0;
    }

    /** the blocks that failed to map, most frequent first, then by name for a stable order */
    entries(): readonly { name: string; count: number }[] {
        return [...this.counts.entries()]
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) =>
                b.count === a.count ? a.name.localeCompare(b.name) : b.count - a.count,
            );
    }
}

/**
 * Reads override rows supplied as JSON, refusing anything malformed by value.
 *
 * A user editing a mapping file by hand will get it wrong, and the useful answer names the
 * row that is wrong rather than throwing a parse error at the whole file.
 */
export function parseBlockMappingOverrides(
    text: string,
): { ok: true; rows: readonly BlockMappingRow[] } | { ok: false; reason: string } {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        return { ok: false, reason: "The mapping file is not valid JSON: " + String(error) };
    }

    if (!Array.isArray(parsed))
        return { ok: false, reason: "A mapping file is an array of rows, one per block identity." };

    const rows: BlockMappingRow[] = [];
    for (let index = 0; index < parsed.length; index++) {
        const row: unknown = parsed[index];
        if (typeof row !== "object" || row === null)
            return { ok: false, reason: "Row " + index + " is not an object." };

        const record = row as Record<string, unknown>;
        if (typeof record["java"] !== "string" || typeof record["bedrock"] !== "string")
            return {
                ok: false,
                reason: "Row " + index + " needs a 'java' and a 'bedrock' block id, both strings.",
            };

        const built: BlockMappingRow = {
            java: record["java"],
            bedrock: record["bedrock"],
            ...(isStringMap(record["properties"]) ? { properties: record["properties"] } : {}),
            ...(isNestedStringMap(record["values"]) ? { values: record["values"] } : {}),
            ...(typeof record["note"] === "string" ? { note: record["note"] } : {}),
        };
        rows.push(built);
    }

    return { ok: true, rows };
}

function isStringMap(value: unknown): value is Record<string, string> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    return Object.values(value).every((entry) => typeof entry === "string");
}

function isNestedStringMap(value: unknown): value is Record<string, Record<string, string>> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    return Object.values(value).every((entry) => isStringMap(entry));
}
