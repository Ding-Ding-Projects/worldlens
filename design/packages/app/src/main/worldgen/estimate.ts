/**
 * A clearly-labelled ESTIMATE of pre-generation size and time - never a promise.
 *
 * These numbers are order-of-magnitude guidance derived from commonly observed vanilla
 * region-file sizes and single-threaded chunk generation rates, not a measurement of this
 * machine or this seed. The GUI must label them as an estimate; this module names them
 * the same way so nothing downstream can accidentally present them as exact.
 */

import { chunkCount, type PregenExtent } from "./settings.js";

/** Rough average bytes-per-chunk on disk for a generated (not yet played-in) vanilla
 * region file, blended across biomes. Real worlds vary by several times this. */
const BYTES_PER_CHUNK_ESTIMATE = 35_000;

/** Rough chunks-per-second a single generation worker manages on modest hardware. Real
 * throughput depends heavily on CPU, disk, and world type (amplified is far slower). */
const CHUNKS_PER_SECOND_ESTIMATE = 12;

export interface GenerationEstimate {
    readonly chunkCount: number;
    readonly estimatedBytes: number;
    readonly estimatedSeconds: number;
}

export function estimateGeneration(extent: PregenExtent, dimensionCount: number): GenerationEstimate {
    const chunks = chunkCount(extent) * Math.max(1, dimensionCount);
    return {
        chunkCount: chunks,
        estimatedBytes: chunks * BYTES_PER_CHUNK_ESTIMATE,
        estimatedSeconds: Math.ceil(chunks / CHUNKS_PER_SECOND_ESTIMATE),
    };
}

/** Formats a byte count as a human-scale string (KB/MB/GB), for display next to the
 * estimate. Pure and locale-independent so it is trivially testable. */
export function formatEstimatedBytes(bytes: number): string {
    const units = ["B", "KB", "MB", "GB", "TB"] as const;
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    const rounded = unitIndex === 0 ? String(Math.round(value)) : value.toFixed(1);
    return `${rounded} ${units[unitIndex]}`;
}

/** Formats a duration in seconds as a human-scale string, for the same estimate row. */
export function formatEstimatedSeconds(seconds: number): string {
    if (seconds < 60) {
        return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
        return `${minutes}m ${seconds % 60}s`;
    }
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
}
