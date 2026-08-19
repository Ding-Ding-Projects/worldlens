/**
 * Evidence emitted by a hosted render.  A successful map is not enough evidence for
 * issue #67: the run must show that both waves reached the real merge, and that the
 * disk check was measured at the points where the runner is actually under pressure.
 *
 * This module deliberately does not read the runner or the GitHub API.  Workflow steps
 * write small JSON receipts and this pure verifier checks the receipt that was uploaded.
 * That keeps a missing or truncated evidence file red instead of turning it into a
 * guessed green result.
 */

export const HOSTED_RENDER_RECEIPT_VERSION = 1;

export const HOSTED_RENDER_RECEIPT_PHASES = [
    "before-fetch",
    "after-join-unpack",
    "render-merge-peak",
    "after-cleanup",
    "completion",
] as const;

export type HostedRenderReceiptPhase = (typeof HOSTED_RENDER_RECEIPT_PHASES)[number];

export interface HostedRenderDiskSample {
    phase: HostedRenderReceiptPhase;
    /** ISO-8601 timestamp written by the runner, not by a later reader. */
    recordedAt: string;
    freeBytes: number;
    availableBytes: number;
    filesystem: string;
}

export interface HostedRenderWaveReceipt {
    wave: number;
    plannedShardIds: number[];
    completedShardIds: number[];
    completionMarkers: number;
    startedAt: string;
    completedAt: string;
    outcome: "success" | "failed" | "cancelled";
    shardIntegrity: {
        allMarkersPresent: boolean;
        allArtifactsPresent: boolean;
        planFingerprintMatches: boolean;
        missingShardIds: number[];
        duplicateShardIds: number[];
    };
}

export interface HostedRenderReceipt {
    version: typeof HOSTED_RENDER_RECEIPT_VERSION;
    runId: string;
    runAttempt: number;
    mapId: string;
    planFingerprint: string;
    waveCount: number;
    requiredDiskBytes: number;
    disk: HostedRenderDiskSample[];
    waves: HostedRenderWaveReceipt[];
    merge: {
        startedAt: string;
        completedAt: string;
        outcome: "success" | "failed";
        mergedMapVerified: boolean;
        lowresRebuilt: boolean;
        publicResult: "openable" | "not-published" | "failed";
    };
    mergedContent: {
        hiresTileCount: number;
        expectedHiresTileCount: number;
        metadataPresent: boolean;
        metadataFingerprintMatches: boolean;
        texturesVerified: boolean;
    };
    cleanup: {
        intermediateArchivesRemoved: boolean;
        shardStagingRemoved: boolean;
        resumableStatePreserved: boolean;
    };
    failure: {
        retryable: boolean;
        enospcObserved: boolean;
        noReleaseOnFailure: boolean;
    };
    outcome: "success" | "failed" | "cancelled";
}

export interface HostedRenderReceiptCheck {
    name: string;
    ok: boolean;
    detail: string;
}

export interface HostedRenderReceiptReport {
    ok: boolean;
    checks: HostedRenderReceiptCheck[];
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
}

function asFiniteNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asIso(value: unknown): string | null {
    const text = asString(value);
    if (text === null || Number.isNaN(Date.parse(text))) return null;
    return text;
}

function add(checks: HostedRenderReceiptCheck[], name: string, ok: boolean, detail: string): void {
    checks.push({ name, ok, detail });
}

/**
 * Validate and verify a receipt.  It is intentionally strict: a receipt that is absent,
 * malformed, missing a phase, or claims a wave that did not complete is not evidence.
 */
export function verifyHostedRenderReceipt(value: unknown): HostedRenderReceiptReport {
    const checks: HostedRenderReceiptCheck[] = [];
    if (!isObject(value)) {
        return { ok: false, checks: [{ name: "receipt is an object", ok: false, detail: "receipt is not a JSON object" }] };
    }

    add(checks, "receipt schema version", value.version === HOSTED_RENDER_RECEIPT_VERSION, "version is " + String(value.version));
    add(checks, "run identity present", asString(value.runId) !== null && asFiniteNumber(value.runAttempt) !== null, "runId/runAttempt are recorded");
    add(checks, "plan identity present", asString(value.mapId) !== null && asString(value.planFingerprint) !== null, "map id and plan fingerprint are recorded");

    const requiredDisk = asFiniteNumber(value.requiredDiskBytes);
    add(checks, "required disk is finite", requiredDisk !== null && requiredDisk >= 0, String(value.requiredDiskBytes));

    const disk = Array.isArray(value.disk) ? value.disk : [];
    const phases = new Set(disk.map((sample) => (isObject(sample) ? sample.phase : undefined)));
    for (const phase of HOSTED_RENDER_RECEIPT_PHASES) {
        add(checks, "disk sample: " + phase, phases.has(phase), phases.has(phase) ? "recorded" : "missing");
    }
    let diskSamplesValid = disk.length === HOSTED_RENDER_RECEIPT_PHASES.length;
    let previousTime = -Infinity;
    for (const sample of disk) {
        if (!isObject(sample)) {
            diskSamplesValid = false;
            continue;
        }
        const time = asIso(sample.recordedAt);
        const free = asFiniteNumber(sample.freeBytes);
        const available = asFiniteNumber(sample.availableBytes);
        const filesystem = asString(sample.filesystem);
        if (time === null || free === null || available === null || filesystem === null || free < 0 || available < 0 || time === null || Date.parse(time) < previousTime) diskSamplesValid = false;
        else previousTime = Date.parse(time);
    }
    add(checks, "disk samples are ordered and bounded", diskSamplesValid, diskSamplesValid ? "all samples are finite and chronological" : "a sample is malformed, duplicated, or out of order");
    if (requiredDisk !== null) {
        const beforeFetch = disk.find((sample) => isObject(sample) && sample.phase === "before-fetch");
        const free = isObject(beforeFetch) ? asFiniteNumber(beforeFetch.freeBytes) : null;
        add(checks, "disk preflight covered the estimate", free !== null && free >= requiredDisk, "free=" + String(free) + ", required=" + String(requiredDisk));
    }

    const waves = Array.isArray(value.waves) ? value.waves : [];
    const waveCount = asFiniteNumber(value.waveCount);
    add(checks, "two-wave plan is recorded", waveCount !== null && waveCount >= 2, "waveCount=" + String(value.waveCount));
    add(checks, "wave receipts are present", waveCount !== null && waves.length === waveCount, waves.length + " receipts for " + String(value.waveCount) + " planned waves");
    let wavesValid = true;
    let priorCompletedAt = -Infinity;
    for (let index = 0; index < waves.length; index++) {
        const wave = waves[index];
        if (!isObject(wave)) {
            wavesValid = false;
            continue;
        }
        const expected = index + 1;
        const planned = Array.isArray(wave.plannedShardIds) ? wave.plannedShardIds : [];
        const completed = Array.isArray(wave.completedShardIds) ? wave.completedShardIds : [];
        const plannedSet = new Set(planned);
        const completedSet = new Set(completed);
        const started = asIso(wave.startedAt);
        const ended = asIso(wave.completedAt);
        const startedAt = started === null ? null : Date.parse(started);
        const endedAt = ended === null ? null : Date.parse(ended);
        const markers = asFiniteNumber(wave.completionMarkers);
        const integrity = isObject(wave.shardIntegrity) ? wave.shardIntegrity : null;
        const complete = planned.length > 0 && planned.every((id) => completedSet.has(id)) && markers === planned.length;
        const integrityOk = integrity !== null && integrity.allMarkersPresent === true && integrity.allArtifactsPresent === true && integrity.planFingerprintMatches === true && Array.isArray(integrity.missingShardIds) && integrity.missingShardIds.length === 0 && Array.isArray(integrity.duplicateShardIds) && integrity.duplicateShardIds.length === 0;
        if (wave.wave !== expected || startedAt === null || endedAt === null || endedAt < startedAt || endedAt < priorCompletedAt || wave.outcome !== "success" || !complete || !integrityOk || plannedSet.size !== planned.length) wavesValid = false;
        if (endedAt !== null) priorCompletedAt = endedAt;
    }
    add(checks, "waves completed in order", wavesValid, wavesValid ? "all planned shards have completion markers" : "a wave is incomplete, duplicated, out of order, or not successful");

    const merge = isObject(value.merge) ? value.merge : null;
    const mergeValid = merge !== null && asIso(merge.startedAt) !== null && asIso(merge.completedAt) !== null && merge.outcome === "success" && merge.mergedMapVerified === true && merge.lowresRebuilt === true && (merge.publicResult === "openable" || merge.publicResult === "not-published");
    add(checks, "merge and lowres verification", mergeValid, mergeValid ? "merged map and lowres pyramid are verified" : "merge receipt is incomplete or failed");
    const content = isObject(value.mergedContent) ? value.mergedContent : null;
    const hiresTileCount = content === null ? null : asFiniteNumber(content.hiresTileCount);
    const expectedHiresTileCount = content === null ? null : asFiniteNumber(content.expectedHiresTileCount);
    const contentValid = content !== null && hiresTileCount !== null && expectedHiresTileCount !== null && hiresTileCount > 0 && hiresTileCount === expectedHiresTileCount && content.metadataPresent === true && content.metadataFingerprintMatches === true && content.texturesVerified === true;
    add(checks, "merged content and metadata", contentValid, contentValid ? "tile count, metadata and textures agree" : "merged content or metadata evidence is incomplete");
    const cleanup = isObject(value.cleanup) ? value.cleanup : null;
    const cleanupValid = cleanup !== null && cleanup.intermediateArchivesRemoved === true && cleanup.shardStagingRemoved === true && cleanup.resumableStatePreserved === true;
    add(checks, "cleanup preserves resumability", cleanupValid, cleanupValid ? "intermediate data was removed without deleting resumable state" : "cleanup or resumable-state evidence is incomplete");
    const failure = isObject(value.failure) ? value.failure : null;
    const failureValid = failure !== null && typeof failure.retryable === "boolean" && typeof failure.enospcObserved === "boolean" && failure.noReleaseOnFailure === true;
    add(checks, "retry, ENOSPC and release failure policy", failureValid, failureValid ? "retry/ENOSPC state and no-release-on-failure are recorded" : "failure-policy evidence is incomplete");
    const outcome = value.outcome;
    add(checks, "successful receipt has no failed stage", outcome !== "success" || (wavesValid && mergeValid && contentValid && cleanupValid && failureValid), outcome === "success" ? "all required stages succeeded" : "run outcome is " + String(outcome));

    return { ok: checks.every((check) => check.ok), checks };
}
