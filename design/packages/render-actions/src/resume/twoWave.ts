/**
 * Deterministic planning and evidence for the two-wave render merge.
 *
 * The hosted workflow is deliberately split into two concerns: wave planning is pure
 * (the same shard ids always produce the same two waves), while a merge backend can feed
 * its observed output manifests into `collectTwoWaveConflicts`.  Keeping the evidence
 * model separate means a failed merge can name the exact path and both owners instead of
 * collapsing a partial result into a generic "merge failed" message.
 */

export interface TwoWavePlanOptions {
    /** Maximum shard count in one matrix wave. GitHub's matrix ceiling is 256. */
    readonly waveSize?: number | undefined;
}

export interface TwoWave {
    /** 1-based wave number, matching the workflow job name. */
    readonly index: 1 | 2;
    /** Shard ids in deterministic ascending order. */
    readonly shardIds: readonly number[];
}

export interface TwoWavePlan {
    readonly waves: readonly TwoWave[];
    readonly shardIds: readonly number[];
    readonly waveSize: number;
    readonly requiresMerge: boolean;
}

export class TwoWavePlanError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "TwoWavePlanError";
    }
}

/**
 * Split a shard set into at most two ordered waves.
 *
 * This function sorts and de-duplicates ids before splitting.  That is intentional:
 * matrix input is an external JSON boundary and accepting duplicate or differently
 * ordered ids would make the merge order depend on how the workflow happened to emit it.
 */
export function planTwoWaveMerge(
    shardIds: readonly number[],
    options: TwoWavePlanOptions = {},
): TwoWavePlan {
    const waveSize = Math.max(1, Math.min(256, Math.floor(options.waveSize ?? 256)));
    const ordered = [...new Set(shardIds)].sort((left, right) => left - right);
    if (ordered.some((id) => !Number.isSafeInteger(id) || id < 0))
        throw new TwoWavePlanError("Two-wave merge shard ids must be non-negative integers.");
    if (ordered.length > waveSize * 2)
        throw new TwoWavePlanError(
            "The two-wave merge plan needs " +
                Math.ceil(ordered.length / waveSize) +
                " waves, but this backend accepts at most two; use the general wave planner.",
        );

    const first = ordered.slice(0, waveSize);
    const second = ordered.slice(waveSize);
    const waves: TwoWave[] = [{ index: 1, shardIds: first }];
    if (second.length > 0) waves.push({ index: 2, shardIds: second });
    return {
        waves,
        shardIds: ordered,
        waveSize,
        requiresMerge: ordered.length > 1,
    };
}

export interface TwoWaveFileObservation {
    readonly wave: 1 | 2;
    readonly shardId: number;
    /** Relative output path. Absolute paths are rejected by the collector. */
    readonly path: string;
    readonly sha256: string;
}

export interface TwoWaveConflictEvidence {
    readonly path: string;
    readonly first: { wave: 1 | 2; shardId: number; sha256: string };
    readonly second: { wave: 1 | 2; shardId: number; sha256: string };
    readonly kind: "different-bytes" | "duplicate-owner";
}

function isRelativePath(path: string): boolean {
    return path.length > 0 && !path.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(path) && !path.split(/[\\/]+/).includes("..");
}

/**
 * Collect conflicts without mutating the output directory.
 *
 * Same bytes from two observations are retained as harmless duplicate ownership; a
 * differing digest is a hard conflict.  A shard claiming a path twice is reported even
 * when the bytes match, because that is evidence that the shard manifest is malformed.
 */
export function collectTwoWaveConflicts(
    observations: readonly TwoWaveFileObservation[],
): TwoWaveConflictEvidence[] {
    const owners = new Map<string, TwoWaveFileObservation>();
    const conflicts: TwoWaveConflictEvidence[] = [];
    for (const observation of observations) {
        if (!isRelativePath(observation.path))
            throw new TwoWavePlanError("Two-wave merge output paths must be relative: " + observation.path);
        const previous = owners.get(observation.path);
        if (previous === undefined) {
            owners.set(observation.path, observation);
            continue;
        }
        conflicts.push({
            path: observation.path,
            first: { wave: previous.wave, shardId: previous.shardId, sha256: previous.sha256 },
            second: { wave: observation.wave, shardId: observation.shardId, sha256: observation.sha256 },
            kind:
                previous.shardId === observation.shardId
                    ? "duplicate-owner"
                    : previous.sha256 === observation.sha256
                      ? "duplicate-owner"
                      : "different-bytes",
        });
    }
    return conflicts;
}

export interface TwoWaveDiskBudget {
    /** Bytes required while downloading wave output and writing the merged result. */
    readonly requiredBytes: number;
    readonly availableBytes: number;
    readonly peakBytes: number;
    readonly marginBytes: number;
}

export class TwoWaveDiskLimitError extends Error {
    readonly budget: TwoWaveDiskBudget;

    constructor(budget: TwoWaveDiskBudget) {
        super(
            "Two-wave merge refused before writing: it needs " +
                budget.requiredBytes +
                " bytes, but only " +
                budget.availableBytes +
                " bytes are free.",
        );
        this.name = "TwoWaveDiskLimitError";
        this.budget = budget;
    }
}

/** Calculate the peak bytes for a two-wave merge, including an explicit safety margin. */
export function twoWaveDiskBudget(input: {
    readonly waveOneBytes: number;
    readonly waveTwoBytes: number;
    readonly mergeOutputBytes: number;
    readonly marginBytes?: number | undefined;
    readonly availableBytes: number;
}): TwoWaveDiskBudget {
    const values = [input.waveOneBytes, input.waveTwoBytes, input.mergeOutputBytes, input.marginBytes ?? 0, input.availableBytes];
    if (values.some((value) => !Number.isFinite(value) || value < 0))
        throw new TwoWavePlanError("Two-wave merge disk measurements must be finite non-negative bytes.");
    const peakBytes = Math.max(input.waveOneBytes, input.waveTwoBytes) + input.mergeOutputBytes;
    const marginBytes = input.marginBytes ?? Math.ceil(peakBytes * 0.2);
    const requiredBytes = peakBytes + marginBytes;
    return { requiredBytes, availableBytes: input.availableBytes, peakBytes, marginBytes };
}

/** Fail closed before the backend downloads or writes any merge output. */
export function assertTwoWaveDiskBudget(budget: TwoWaveDiskBudget): void {
    if (budget.availableBytes < budget.requiredBytes) throw new TwoWaveDiskLimitError(budget);
}
