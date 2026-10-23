/**
 * The world-generation configuration the desktop GUI exports and GitHub Actions consumes.
 *
 * One document, three readers: the world generator dialog builds it from the settings a
 * person chose, the main process validates it before dispatching `worldgen.yml`, and the
 * workflow validates it again on the runner before generating anything. All three use this
 * module, so a field cannot be accepted by the GUI and refused by the runner, or the other
 * way round, without the disagreement showing up in one place.
 *
 * It is deliberately small and explicit rather than a copy of the whole settings model. The
 * synthetic generator honours exactly `seed`, `size`, `format` and `worldName`; the rest of
 * the GUI's choices travel under `source` so the receipt a run writes can say what was asked
 * for, and the runner never has to guess which fields matter.
 */

export const WORLD_GENERATION_CONFIG_VERSION = 1;

/** The workflow file in a repository's `.github/workflows/` that accepts this document. */
export const WORLDGEN_WORKFLOW_FILE = "worldgen.yml";

/** The `workflow_dispatch` input that carries the JSON document. */
export const WORLDGEN_CONFIG_INPUT = "generation-config";

export type WorldGenerationEngine = "synthetic" | "vanilla-server";
export type WorldGenerationFormat = "1.20.4" | "1.12.2";
export type WorldGenerationOutputMode = "folder" | "zip";

export interface WorldGenerationSource {
    readonly flavour: string;
    /** The exact catalogue version id the GUI showed, or "" when none was chosen. */
    readonly version: string;
    readonly pregenerationRadius: number;
    readonly worldType: string;
    readonly generateStructures: boolean;
    readonly dimensions: {
        readonly overworld: true;
        readonly nether: boolean;
        readonly end: boolean;
    };
}

export interface WorldGenerationConfig {
    readonly version: typeof WORLD_GENERATION_CONFIG_VERSION;
    readonly engine: WorldGenerationEngine;
    readonly seed: number;
    /** Edge length of the generated square, in blocks. */
    readonly size: number;
    readonly worldName: string;
    readonly format: WorldGenerationFormat;
    readonly outputMode: WorldGenerationOutputMode;
    readonly source: WorldGenerationSource;
}

export interface WorldGenerationChoices {
    readonly engine: WorldGenerationEngine;
    readonly seed: number;
    readonly worldName: string;
    readonly pregenerationRadius: number;
    readonly version: string;
    readonly outputMode: WorldGenerationOutputMode;
    readonly flavour: string;
    readonly worldType: string;
    readonly generateStructures: boolean;
    readonly dimensions: {
        readonly overworld: true;
        readonly nether: boolean;
        readonly end: boolean;
    };
}

export type WorldGenerationConfigResult =
    | { readonly ok: true; readonly config: WorldGenerationConfig }
    | { readonly ok: false; readonly message: string };

/** Same bounds as the desktop synthetic-generation IPC handler enforces. */
export const WORLD_GENERATION_MIN_SIZE = 16;
export const WORLD_GENERATION_MAX_SIZE = 40_000;
/** GitHub caps every `workflow_dispatch` input well above this; the cap here is ours. */
export const WORLD_GENERATION_CONFIG_MAX_BYTES = 16_384;

const WORLD_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const FORMATS: readonly WorldGenerationFormat[] = ["1.20.4", "1.12.2"];
const ENGINES: readonly WorldGenerationEngine[] = ["synthetic", "vanilla-server"];
const OUTPUT_MODES: readonly WorldGenerationOutputMode[] = ["folder", "zip"];

/**
 * The square the synthetic generator is asked for: twice the radius, never below the
 * smallest world the generator writes. Exactly what the dialog computes locally.
 */
export function worldGenerationSize(pregenerationRadius: number): number {
    const radius = Number.isFinite(pregenerationRadius)
        ? Math.trunc(Math.max(0, pregenerationRadius))
        : 0;
    return Math.max(WORLD_GENERATION_MIN_SIZE, radius * 2);
}

/**
 * The chunk format for a catalogue version. Only two eras can be written: a 1.12 version
 * selects the pre-flattening layout, and everything else (including no choice) the modern one.
 */
export function worldGenerationFormatFor(version: string): WorldGenerationFormat {
    return /^1\.12(\.|$)/.test(version.trim()) ? "1.12.2" : "1.20.4";
}

/** Builds the document from what a person chose in the dialog. Never throws. */
export function buildWorldGenerationConfig(choices: WorldGenerationChoices): WorldGenerationConfig {
    return {
        version: WORLD_GENERATION_CONFIG_VERSION,
        engine: choices.engine,
        seed: Math.trunc(choices.seed),
        size: worldGenerationSize(choices.pregenerationRadius),
        worldName: choices.worldName.trim(),
        format: worldGenerationFormatFor(choices.version),
        outputMode: choices.outputMode,
        source: {
            flavour: choices.flavour,
            version: choices.version.trim(),
            pregenerationRadius: Math.trunc(choices.pregenerationRadius),
            worldType: choices.worldType,
            generateStructures: choices.generateStructures,
            dimensions: {
                overworld: true,
                nether: choices.dimensions.nether,
                end: choices.dimensions.end,
            },
        },
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates an untrusted document - from IPC, from a workflow input, from a file - and
 * returns a normalised copy or the one reason it was refused. Unknown top-level fields are
 * refused so a misspelt field cannot be silently ignored.
 */
export function parseWorldGenerationConfig(value: unknown): WorldGenerationConfigResult {
    if (!isRecord(value)) return refuse("The generation configuration must be a JSON object.");
    const known = new Set([
        "version",
        "engine",
        "seed",
        "size",
        "worldName",
        "format",
        "outputMode",
        "source",
    ]);
    for (const key of Object.keys(value)) {
        if (!known.has(key))
            return refuse(`Unknown field '${key}' in the generation configuration.`);
    }
    if (value.version !== WORLD_GENERATION_CONFIG_VERSION) {
        return refuse(`'version' must be ${WORLD_GENERATION_CONFIG_VERSION}.`);
    }
    if (
        typeof value.engine !== "string" ||
        !(ENGINES as readonly string[]).includes(value.engine)
    ) {
        return refuse(`'engine' must be one of ${ENGINES.join(", ")}.`);
    }
    if (typeof value.seed !== "number" || !Number.isSafeInteger(value.seed)) {
        return refuse("'seed' must be a whole number.");
    }
    if (
        typeof value.size !== "number" ||
        !Number.isSafeInteger(value.size) ||
        value.size < WORLD_GENERATION_MIN_SIZE ||
        value.size > WORLD_GENERATION_MAX_SIZE
    ) {
        return refuse(
            `'size' must be a whole number from ${WORLD_GENERATION_MIN_SIZE} to ${WORLD_GENERATION_MAX_SIZE} blocks.`,
        );
    }
    if (typeof value.worldName !== "string" || !WORLD_NAME.test(value.worldName)) {
        return refuse(
            "'worldName' may use letters, digits, '.', '_' and '-', up to 120 characters, starting with a letter or digit.",
        );
    }
    if (
        typeof value.format !== "string" ||
        !(FORMATS as readonly string[]).includes(value.format)
    ) {
        return refuse(`'format' must be one of ${FORMATS.join(", ")}.`);
    }
    if (
        typeof value.outputMode !== "string" ||
        !(OUTPUT_MODES as readonly string[]).includes(value.outputMode)
    ) {
        return refuse(`'outputMode' must be one of ${OUTPUT_MODES.join(", ")}.`);
    }
    const source = value.source;
    if (!isRecord(source))
        return refuse("'source' must be an object describing the chosen settings.");
    if (typeof source.flavour !== "string" || source.flavour.length > 64)
        return refuse("'source.flavour' must be a short string.");
    if (typeof source.version !== "string" || source.version.length > 64)
        return refuse("'source.version' must be a short string.");
    if (
        typeof source.pregenerationRadius !== "number" ||
        !Number.isSafeInteger(source.pregenerationRadius) ||
        source.pregenerationRadius < 0
    ) {
        return refuse("'source.pregenerationRadius' must be a whole number of blocks.");
    }
    if (typeof source.worldType !== "string" || source.worldType.length > 64)
        return refuse("'source.worldType' must be a short string.");
    if (typeof source.generateStructures !== "boolean")
        return refuse("'source.generateStructures' must be true or false.");
    const dimensions = source.dimensions;
    if (
        !isRecord(dimensions) ||
        dimensions.overworld !== true ||
        typeof dimensions.nether !== "boolean" ||
        typeof dimensions.end !== "boolean"
    ) {
        return refuse("'source.dimensions' must name overworld (always true), nether and end.");
    }
    const config: WorldGenerationConfig = {
        version: WORLD_GENERATION_CONFIG_VERSION,
        engine: value.engine as WorldGenerationEngine,
        seed: value.seed,
        size: value.size,
        worldName: value.worldName,
        format: value.format as WorldGenerationFormat,
        outputMode: value.outputMode as WorldGenerationOutputMode,
        source: {
            flavour: source.flavour,
            version: source.version,
            pregenerationRadius: source.pregenerationRadius,
            worldType: source.worldType,
            generateStructures: source.generateStructures,
            dimensions: { overworld: true, nether: dimensions.nether, end: dimensions.end },
        },
    };
    const bytes = new TextEncoder().encode(JSON.stringify(config)).length;
    if (bytes > WORLD_GENERATION_CONFIG_MAX_BYTES) {
        return refuse(
            `The generation configuration is ${bytes} bytes; the limit is ${WORLD_GENERATION_CONFIG_MAX_BYTES}.`,
        );
    }
    return { ok: true, config };
}

/** Parses JSON text first, then the document. One message either way. */
export function parseWorldGenerationConfigText(text: string): WorldGenerationConfigResult {
    let value: unknown;
    try {
        value = JSON.parse(text);
    } catch {
        return refuse("The generation configuration is not valid JSON.");
    }
    return parseWorldGenerationConfig(value);
}

/**
 * The arguments the `worldgen` CLI takes for this document. Only the synthetic engine has a
 * CLI; a vanilla-server document has no runner yet and is refused rather than approximated.
 */
export function worldgenCliArgumentsFor(config: WorldGenerationConfig): readonly string[] | null {
    if (config.engine !== "synthetic") return null;
    return [
        "--seed",
        String(config.seed),
        "--size",
        String(config.size),
        "--format",
        config.format,
        "--name",
        config.worldName,
    ];
}

export interface WorldgenDispatchOptions {
    /** Compile a map inside the generation run with the BlueMap CLI jar. */
    readonly render: boolean;
    /** Also publish the world zip as a prerelease asset, so `render-world.yml` can read it. */
    readonly publish: "artifact" | "release-asset";
    /** After publishing, dispatch `render-world.yml` against the published asset. */
    readonly dispatchRender: boolean;
}

/** The exact `workflow_dispatch` inputs for `worldgen.yml`. Every value is a string, as GitHub requires. */
export function worldgenDispatchInputs(
    config: WorldGenerationConfig,
    options: WorldgenDispatchOptions,
): Readonly<Record<string, string>> {
    return {
        [WORLDGEN_CONFIG_INPUT]: JSON.stringify(config),
        render: options.render ? "true" : "false",
        publish: options.publish,
        "dispatch-render": options.dispatchRender ? "true" : "false",
    };
}

function refuse(message: string): WorldGenerationConfigResult {
    return { ok: false, message };
}
