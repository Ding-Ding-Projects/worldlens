/**
 * Starting a Chunker conversion on GitHub Actions.
 *
 * The desktop application already converts worlds locally through Hive Games' Chunker CLI
 * (see `../bedrock`), and that path is the right one for a world already sitting on this
 * machine: it is faster, it needs no upload, and it never leaves the disk. This module is
 * for the case that path cannot serve - a world too large for the local machine's memory,
 * or a world that already lives in a repository rather than here - by dispatching
 * `.github/workflows/chunk-world.yml` and letting the runners do it in parallel.
 *
 * It deliberately mirrors `../cirender/plan.ts` rather than inventing a second shape:
 *
 *   * every `workflow_dispatch` input is built here, as the exact strings GitHub takes,
 *     because GitHub answers a wrong input with a 422 whose message reads as "the workflow
 *     is broken" and sends people to entirely the wrong place;
 *   * every refusal is a typed code with a sentence a person can act on, checked before
 *     anything is dispatched rather than discovered by reading a red run;
 *   * the dispatch itself goes through the same `dispatchWorkflow` shape the CI render
 *     transport already implements, so the in-app GitHub token and the `gh` CLI fallback
 *     both drive this without a second credential path being written.
 *
 * Nothing here imports Electron, so the whole module is testable with no window, no
 * network and no `gh` on the machine.
 */

/** The workflow this module starts. Must match the file name in `.github/workflows`. */
export const CHUNK_WORKFLOW_FILE = "chunk-world.yml";

/** Exactly the three options the workflow's `world-source` choice offers. */
export const WORKFLOW_WORLD_SOURCES = ["release-asset", "url", "artifact"] as const;

export type ChunkerWorldSource = (typeof WORKFLOW_WORLD_SOURCES)[number];

/** Exactly the two options the workflow's `output` choice offers. */
export const WORKFLOW_OUTPUTS = ["artifact", "artifact-and-release"] as const;

export type ChunkerOutput = (typeof WORKFLOW_OUTPUTS)[number];

/**
 * A trim, in chunk coordinates, inclusive at both ends.
 *
 * Chunks rather than blocks or regions because that is the unit Chunker's pruning file
 * speaks in, and converting the number here rather than in the workflow keeps one
 * arithmetic in one place.
 */
export interface ChunkerPruneBounds {
    readonly minChunkX: number;
    readonly minChunkZ: number;
    readonly maxChunkX: number;
    readonly maxChunkZ: number;
}

export interface ChunkerRunRequest {
    readonly worldSource: ChunkerWorldSource;
    /**
     * What to convert, read according to `worldSource`: an asset name (optionally
     * `tag/asset`), a URL, or `run-id/artifact-name`.
     */
    readonly world: string;
    /** owner/name the world lives in. Omitted means the repository the run happens in. */
    readonly worldRepository?: string;
    /** Chunker's own output format name, edition and version together. */
    readonly targetFormat: string;
    /** File name of the converted archive, without the `.zip`. */
    readonly outputName: string;
    readonly output?: ChunkerOutput;
    readonly pruneBounds?: ChunkerPruneBounds;
    readonly maxJobs?: number;
    readonly regionsPerShard?: number;
}

export interface ChunkerRunPlan {
    readonly workflowFile: typeof CHUNK_WORKFLOW_FILE;
    readonly targetFormat: string;
    readonly outputName: string;
    /** Every `workflow_dispatch` input, as the strings GitHub takes. */
    readonly inputs: Readonly<Record<string, string>>;
}

export type ChunkerPlanRefusal =
    | { readonly code: "no-world"; readonly message: string }
    | { readonly code: "bad-repository"; readonly message: string }
    | { readonly code: "bad-artifact-reference"; readonly message: string }
    | { readonly code: "bad-target-format"; readonly message: string }
    | { readonly code: "bad-output-name"; readonly message: string }
    | { readonly code: "bad-bounds"; readonly message: string }
    | { readonly code: "bad-parallelism"; readonly message: string };

export type ChunkerPlanResult =
    | { readonly ok: true; readonly plan: ChunkerRunPlan }
    | { readonly ok: false; readonly failure: ChunkerPlanRefusal };

/**
 * Chunker names its formats in this shape, and a name outside it is a typo rather than an
 * exotic target. Refusing here is what turns "JAVA 1.21.4" into a sentence naming the
 * mistake instead of a run that fails after the world has been fetched.
 */
const FORMAT_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/** A file name, not a path: the workflow writes it into its own output directory. */
const OUTPUT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** owner/name, with exactly one slash and neither side empty. */
const REPOSITORY_PATTERN = /^[^/\s]+\/[^/\s]+$/;

/** GitHub itself refuses a matrix wider than this, so asking for more is asking for a 422. */
const MATRIX_LIMIT = 256;

function boundsProblem(bounds: ChunkerPruneBounds): string | null {
    const values = [bounds.minChunkX, bounds.minChunkZ, bounds.maxChunkX, bounds.maxChunkZ];
    if (!values.every((value) => Number.isInteger(value))) {
        return "A trim is expressed in whole chunks, and one of these numbers is not a whole number.";
    }
    if (bounds.minChunkX > bounds.maxChunkX || bounds.minChunkZ > bounds.maxChunkZ) {
        return (
            "This trim has its minimum past its maximum, so it selects nothing: " +
            `x ${String(bounds.minChunkX)} to ${String(bounds.maxChunkX)}, ` +
            `z ${String(bounds.minChunkZ)} to ${String(bounds.maxChunkZ)}.`
        );
    }
    return null;
}

function countProblem(value: number, name: string, limit: number): string | null {
    if (!Number.isInteger(value) || value < 1) {
        return `${name} must be a whole number of at least 1, and was ${String(value)}.`;
    }
    if (value > limit) {
        return `${name} must be at most ${String(limit)}, and was ${String(value)}.`;
    }
    return null;
}

/**
 * Builds the dispatch inputs for one conversion, or says exactly why it cannot.
 *
 * Every check here has a run behind it that would otherwise have failed minutes later,
 * after a multi-gigabyte world had already been fetched onto a runner.
 */
export function planChunkerRun(request: ChunkerRunRequest): ChunkerPlanResult {
    const world = request.world.trim();
    if (world === "") {
        return {
            ok: false,
            failure: {
                code: "no-world",
                message:
                    "Name the world to convert: a release asset name, a link to a .zip, or " +
                    "run-id/artifact-name for an artifact from an earlier run.",
            },
        };
    }

    const repository = request.worldRepository?.trim() ?? "";
    if (repository !== "" && !REPOSITORY_PATTERN.test(repository)) {
        return {
            ok: false,
            failure: {
                code: "bad-repository",
                message: `The world's repository is written owner/name, and this is '${repository}'.`,
            },
        };
    }

    // An artifact is addressed by the run that produced it, so half a reference is not a
    // reference at all. The workflow refuses the same shape; refusing here means the person
    // finds out while the form is still open.
    if (request.worldSource === "artifact" && !/^[^/\s]+\/.+$/.test(world)) {
        return {
            ok: false,
            failure: {
                code: "bad-artifact-reference",
                message:
                    "An artifact is named run-id/artifact-name, so that the run holding it can be " +
                    `found, and this is '${world}'.`,
            },
        };
    }

    const targetFormat = request.targetFormat.trim();
    if (!FORMAT_PATTERN.test(targetFormat)) {
        return {
            ok: false,
            failure: {
                code: "bad-target-format",
                message:
                    "The target is Chunker's own format name, edition and version together, such as " +
                    `JAVA_1_21_4 or BEDROCK_1_21_0, and this is '${targetFormat}'.`,
            },
        };
    }

    const outputName = request.outputName.trim();
    if (!OUTPUT_NAME_PATTERN.test(outputName)) {
        return {
            ok: false,
            failure: {
                code: "bad-output-name",
                message:
                    "The converted world's name is a plain file name without a path or an extension, " +
                    `and this is '${outputName}'.`,
            },
        };
    }

    if (request.pruneBounds !== undefined) {
        const problem = boundsProblem(request.pruneBounds);
        if (problem !== null) return { ok: false, failure: { code: "bad-bounds", message: problem } };
    }

    if (request.maxJobs !== undefined) {
        const problem = countProblem(request.maxJobs, "The cap on parallel jobs", MATRIX_LIMIT);
        if (problem !== null) {
            return { ok: false, failure: { code: "bad-parallelism", message: problem } };
        }
    }
    if (request.regionsPerShard !== undefined) {
        // No ceiling worth naming: one enormous shard is slow rather than invalid, and the
        // workflow grows shards past this number anyway when the job cap requires it.
        const problem = countProblem(
            request.regionsPerShard,
            "The number of regions one job converts",
            Number.MAX_SAFE_INTEGER,
        );
        if (problem !== null) {
            return { ok: false, failure: { code: "bad-parallelism", message: problem } };
        }
    }

    const bounds = request.pruneBounds;
    const inputs: Record<string, string> = {
        "world-source": request.worldSource,
        world,
        "world-repository": repository,
        "target-format": targetFormat,
        "prune-bounds":
            bounds === undefined
                ? ""
                : [bounds.minChunkX, bounds.minChunkZ, bounds.maxChunkX, bounds.maxChunkZ]
                      .map((value) => String(value))
                      .join(","),
        "output-name": outputName,
        output: request.output ?? "artifact",
        "max-jobs": String(request.maxJobs ?? 64),
        "regions-per-shard": String(request.regionsPerShard ?? 64),
    };

    return {
        ok: true,
        plan: { workflowFile: CHUNK_WORKFLOW_FILE, targetFormat, outputName, inputs },
    };
}
