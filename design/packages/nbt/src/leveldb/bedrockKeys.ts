/**
 * What a Bedrock world's LevelDB keys mean, and which values are NBT.
 *
 * Chunk keys are binary: chunk x and z (int32, little-endian), an optional dimension (int32:
 * 1 Nether, 2 End; absent for the Overworld), a record tag, and for sub-chunks one more byte,
 * the vertical index. Everything else is an ASCII name (`~local_player`, `player_server_…`,
 * `portals`, `scoreboard`, `AutonomousEntities`, `actorprefix…`, `digp…` and so on).
 * Values stored as one or more little-endian NBT compounds are marked `nbt`.
 */

export const CHUNK_TAGS: Readonly<Record<number, { name: string; nbt: boolean }>> = {
    43: { name: "Height and biomes (3D)", nbt: false },
    44: { name: "Chunk version", nbt: false },
    45: { name: "Height and biomes (2D)", nbt: false },
    47: { name: "Sub-chunk blocks", nbt: false },
    49: { name: "Block entities", nbt: true },
    50: { name: "Entities (old format)", nbt: true },
    51: { name: "Pending ticks", nbt: true },
    54: { name: "Finalized state", nbt: false },
    57: { name: "Blending data", nbt: false },
    58: { name: "Random ticks", nbt: true },
    59: { name: "Checksums", nbt: false },
    61: { name: "Generation seed", nbt: false },
    118: { name: "Legacy version", nbt: false },
};

const DIMENSIONS: Readonly<Record<number, string>> = { 0: "Overworld", 1: "Nether", 2: "End" };

export interface BedrockKey {
    readonly label: string;
    readonly group: "chunk" | "player" | "world" | "entity" | "other";
    readonly nbt: boolean;
    readonly chunk?: {
        x: number;
        z: number;
        dimension: string;
        tag: number;
        subChunk: number | null;
    };
}

const NBT_NAMES =
    /^(~local_player|player_|portals$|scoreboard$|AutonomousEntities$|BiomeData$|mobevents$|schedulerWT$|Overworld$|Nether$|TheEnd$|map_|tickingarea_|VILLAGE_|structuretemplate|LevelChunkMetaDataDictionary$|actorprefix|game_flatworldlayers$|PositionTrackDB|dimension)/;

function isPrintable(bytes: Uint8Array): boolean {
    return bytes.length > 0 && bytes.every((b) => b >= 0x20 && b < 0x7f);
}

export function describeBedrockKey(key: Uint8Array): BedrockKey {
    const view = new DataView(key.buffer, key.byteOffset, key.byteLength);
    const chunkShape = (len: number, withDim: boolean): BedrockKey | null => {
        if (key.length !== len && key.length !== len + 1) return null;
        const tagAt = withDim ? 12 : 8;
        const tag = key[tagAt]!;
        const info = CHUNK_TAGS[tag];
        if (info === undefined) return null;
        if (key.length === len + 1 && tag !== 47) return null;
        const x = view.getInt32(0, true);
        const z = view.getInt32(4, true);
        const dimension =
            DIMENSIONS[withDim ? view.getInt32(8, true) : 0] ??
            `Dimension ${view.getInt32(8, true)}`;
        const subChunk = key.length === len + 1 ? (key[len]! << 24) >> 24 : null;
        return {
            label: `${dimension} chunk ${x}, ${z}: ${info.name}${subChunk === null ? "" : ` (y ${subChunk * 16})`}`,
            group: "chunk",
            nbt: info.nbt,
            chunk: { x, z, dimension, tag, subChunk },
        };
    };
    // Printable names first: a 9-byte ASCII name could otherwise read as a chunk key.
    const chunkLength =
        key.length === 9 || key.length === 10 || key.length === 13 || key.length === 14;
    if (isPrintable(key) && (!chunkLength || NBT_NAMES.test(new TextDecoder().decode(key)))) {
        const name = new TextDecoder().decode(key);
        const nbt = NBT_NAMES.test(name);
        const group =
            name === "~local_player" || name.startsWith("player_")
                ? "player"
                : name.startsWith("actorprefix")
                  ? "entity"
                  : nbt
                    ? "world"
                    : "other";
        return { label: name === "~local_player" ? "Local player" : name, group, nbt };
    }
    const chunk = chunkShape(9, false) ?? chunkShape(13, true);
    if (chunk !== null) return chunk;
    if (isPrintable(key))
        return { label: new TextDecoder().decode(key), group: "other", nbt: false };
    return { label: `0x${Buffer.from(key).toString("hex")}`, group: "other", nbt: false };
}
