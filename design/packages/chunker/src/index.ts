// world format model and detection
export {
    BEDROCK_DB_DIRECTORY,
    BEDROCK_NAME_FILE,
    JAVA_REGION_DIRECTORY,
    LEVEL_DAT_FILE,
    classifyLevelDat,
    compareVersions,
    detectWorldFormat,
    formatVersion,
    listRegionFiles,
    parseVersion,
    versionInRange,
    type LevelDatShape,
    type VersionParseResult,
    type VersionRange,
    type WorldEdition,
    type WorldFormatDetected,
    type WorldFormatDetection,
    type WorldFormatUnknown,
    type WorldVersion,
} from "./formats.js";

// block identity mapping
export {
    BlockMappingTable,
    DEFAULT_BLOCK_MAPPINGS,
    UnmappedBlockLog,
    parseBlockMappingOverrides,
    type BlockIdentity,
    type BlockMapped,
    type BlockMappingResult,
    type BlockMappingRow,
    type BlockUnmapped,
} from "./blockMapping.js";

// pruning by region boundary
export {
    CHUNK_BLOCKS,
    REGION_CHUNKS,
    boundsFromBlocks,
    checkBounds,
    chunkCount,
    chunkSurvives,
    intersectBounds,
    parseRegionFileName,
    planPrune,
    planRegion,
    regionChunkBounds,
    regionFileName,
    regionOfChunk,
    type BoundsCheck,
    type ChunkBounds,
    type ChunkCoordinate,
    type PrunePlan,
    type RegionDisposition,
    type RegionPlan,
} from "./prune.js";

// world settings
export {
    applySettings,
    readNbtDocument,
    readSettingsFrom,
    readWorldSettings,
    writeNbtDocument,
    writeWorldSettings,
    type NbtCompound,
    type NbtValue,
    type SettingsReadResult,
    type SettingsWriteResult,
    type WorldSettings,
    type WorldSettingsOverrides,
} from "./settings.js";

// conversion
export {
    JAVA_DIMENSION_FOLDERS,
    convertWorld,
    dimensionFolderRenames,
    planConversion,
    type ConversionDone,
    type ConversionFailed,
    type ConversionNeedsExternal,
    type ConversionPlan,
    type ConversionRefused,
    type ConversionResult,
    type ConvertOptions,
    type DimensionMapping,
} from "./convert.js";
