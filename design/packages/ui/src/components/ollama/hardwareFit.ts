/**
 * Conservative hardware-fit verdicts for a model variant on this machine.
 *
 * Four verdicts, and the honest one is `Unknown`, not `Runs well`. A verdict this wrong in
 * the optimistic direction costs somebody a multi-gigabyte download and an evening of a
 * daemon thrashing swap; a verdict wrong in the pessimistic direction costs a re-check. The
 * two mistakes are not the same size, so every rule below resolves a tie or a missing fact
 * toward the more conservative answer.
 *
 * Capability is never inferred from a model's name. "70b" in a string is a hint a human
 * reads; it is not evidence this function is allowed to act on, because a mislabeled or
 * unconventionally named tag would silently produce a confident, wrong verdict with nothing
 * to catch it. Every number this function uses comes from the catalogue's own declared
 * fields or from detected hardware, never from parsing a name.
 */

export type FitVerdict = "Runs well" | "Runs with limits" | "Unlikely" | "Unknown";

export interface DetectedHardware {
    readonly totalRamBytes: number | null;
    readonly gpuVramBytes: number | null;
    /** True only when a GPU is present and its driver reports usable compute support. */
    readonly gpuDriverSupported: boolean | null;
    readonly freeDiskBytes: number | null;
}

export interface ModelResourceProfile {
    readonly blobSizeBytes: number | null;
    readonly parameterCountBillions: number | null;
    readonly quantization: string | null;
    readonly declaredContextWindow: number | null;
}

export interface FitEvidenceLine {
    readonly label: string;
    readonly detail: string;
}

export interface FitAssessment {
    readonly verdict: FitVerdict;
    readonly evidence: readonly FitEvidenceLine[];
    readonly assumptions: readonly string[];
    readonly assessedAt: string;
}

/**
 * A rough, clearly-labelled-as-an-assumption multiplier from a model's on-disk blob size to
 * the memory it needs resident while it runs. Real overhead varies by quantization, context
 * length and backend, so this is deliberately generous (wider than typical) rather than
 * tight, because the wrong direction here is claiming something fits when it does not.
 */
const RUNTIME_OVERHEAD_MULTIPLIER = 1.2;

function bytesFit(need: number, have: number): boolean {
    return need <= have;
}

/**
 * Assesses one variant against detected hardware. Missing hardware facts or missing model
 * facts each push the verdict toward `Unknown` rather than assuming a middling value in their
 * place, because a fabricated middle value would look exactly like real evidence to anyone
 * reading the assessment later.
 */
export function assessFit(
    hardware: DetectedHardware,
    profile: ModelResourceProfile,
    now: string = new Date().toISOString(),
): FitAssessment {
    const evidence: FitEvidenceLine[] = [];
    const assumptions: string[] = [
        `Runtime memory is estimated at ${RUNTIME_OVERHEAD_MULTIPLIER}x the model's on-disk blob size, which is a generous rather than a tight estimate.`,
    ];

    if (profile.blobSizeBytes === null) {
        evidence.push({ label: "Model size", detail: "Not reported by the catalogue for this variant." });
        return { verdict: "Unknown", evidence, assumptions, assessedAt: now };
    }
    evidence.push({ label: "Model size", detail: formatBytes(profile.blobSizeBytes) });

    const estimatedRuntimeBytes = Math.ceil(profile.blobSizeBytes * RUNTIME_OVERHEAD_MULTIPLIER);
    evidence.push({ label: "Estimated runtime memory", detail: formatBytes(estimatedRuntimeBytes) });

    if (hardware.freeDiskBytes !== null) {
        evidence.push({ label: "Free disk", detail: formatBytes(hardware.freeDiskBytes) });
        if (!bytesFit(profile.blobSizeBytes, hardware.freeDiskBytes)) {
            evidence.push({ label: "Disk verdict", detail: "The download would not fit in the free disk space detected." });
            return { verdict: "Unlikely", evidence, assumptions, assessedAt: now };
        }
    } else {
        evidence.push({ label: "Free disk", detail: "Not detected on this machine." });
    }

    const haveGpu = hardware.gpuVramBytes !== null && hardware.gpuDriverSupported === true;
    if (haveGpu) {
        evidence.push({ label: "GPU VRAM", detail: formatBytes(hardware.gpuVramBytes as number) });
        if (bytesFit(estimatedRuntimeBytes, hardware.gpuVramBytes as number)) {
            evidence.push({ label: "GPU verdict", detail: "The estimated runtime memory fits inside detected VRAM." });
            return { verdict: "Runs well", evidence, assumptions, assessedAt: now };
        }
        evidence.push({ label: "GPU verdict", detail: "The estimated runtime memory exceeds detected VRAM; some layers would run on CPU." });
    } else if (hardware.gpuVramBytes !== null && hardware.gpuDriverSupported === false) {
        evidence.push({ label: "GPU driver", detail: "A GPU was detected but its driver does not report usable compute support." });
    } else {
        evidence.push({ label: "GPU", detail: "No GPU detected." });
    }

    if (hardware.totalRamBytes === null) {
        evidence.push({ label: "System RAM", detail: "Not detected on this machine." });
        return { verdict: "Unknown", evidence, assumptions, assessedAt: now };
    }
    evidence.push({ label: "System RAM", detail: formatBytes(hardware.totalRamBytes) });

    // Leave headroom for the operating system and every other running application: a machine
    // that could *just barely* fit the model with nothing else running is a machine that will
    // swap the moment a browser tab is open, which is exactly the "runs, technically" case
    // "Runs with limits" exists to name honestly rather than call a clean pass.
    const ramHeadroomFactor = 0.7;
    if (bytesFit(estimatedRuntimeBytes, hardware.totalRamBytes * ramHeadroomFactor)) {
        return {
            verdict: haveGpu ? "Runs with limits" : "Runs with limits",
            evidence: [
                ...evidence,
                { label: "RAM verdict", detail: "Fits within RAM leaving headroom for the rest of the system, running on CPU or a mix of CPU and GPU." },
            ],
            assumptions: [...assumptions, `RAM headroom is assumed at ${Math.round((1 - ramHeadroomFactor) * 100)}% reserved for the rest of the system.`],
            assessedAt: now,
        };
    }
    if (bytesFit(estimatedRuntimeBytes, hardware.totalRamBytes)) {
        return {
            verdict: "Runs with limits",
            evidence: [...evidence, { label: "RAM verdict", detail: "Fits within total RAM with little headroom left for anything else." }],
            assumptions,
            assessedAt: now,
        };
    }

    return {
        verdict: "Unlikely",
        evidence: [...evidence, { label: "RAM verdict", detail: "The estimated runtime memory exceeds total detected RAM." }],
        assumptions,
        assessedAt: now,
    };
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes / 1024;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    return `${value.toFixed(1)} ${units[unitIndex]}`;
}
