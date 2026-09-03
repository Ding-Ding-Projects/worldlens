export type HardwareFit = "runs-well" | "runs-with-limits" | "unlikely" | "unknown";

export interface HardwareEvidence {
    readonly ramBytes: number | null;
    readonly vramBytes: number | null;
    readonly freeBytes: number | null;
    readonly blobBytes: number | null;
    readonly parameterCount: number | null;
    readonly context: number | null;
    readonly backend: string | null;
}

export interface HardwareVerdict { readonly fit: HardwareFit; readonly evidence: readonly string[]; readonly assessedAt: string; }

/** Conservative estimate, deliberately returns Unknown when the official metadata is absent. */
export function assessHardwareFit(input: HardwareEvidence, now = () => new Date().toISOString()): HardwareVerdict {
    const evidence: string[] = [];
    if (input.blobBytes === null || input.ramBytes === null || input.freeBytes === null) return { fit: "unknown", evidence: ["RAM, model blob size and free destination storage are required for a conservative verdict."], assessedAt: now() };
    const memoryNeed = input.blobBytes * (input.context === null ? 1.35 : Math.min(2.5, 1.2 + input.context / 32768));
    evidence.push(`Estimated memory need ${Math.round(memoryNeed / 1024 / 1024)} MiB from the reported blob and context.`);
    evidence.push(`Free destination storage ${Math.round(input.freeBytes / 1024 / 1024)} MiB.`);
    if (input.freeBytes < input.blobBytes * 1.15) return { fit: "unlikely", evidence: [...evidence, "Free storage is below the model plus safety headroom."], assessedAt: now() };
    if (input.ramBytes < memoryNeed) return { fit: "unlikely", evidence: [...evidence, "System RAM is below the conservative estimate."], assessedAt: now() };
    if (input.vramBytes !== null && input.vramBytes < input.blobBytes * 0.7) return { fit: "runs-with-limits", evidence: [...evidence, "VRAM is below the model blob, so CPU or partial offload is expected."], assessedAt: now() };
    if (input.backend === null) return { fit: "runs-with-limits", evidence: [...evidence, "Backend capability was not reported, so acceleration is not promised."], assessedAt: now() };
    return { fit: "runs-well", evidence: [...evidence, `Backend ${input.backend} was reported and storage and RAM headroom are available.`], assessedAt: now() };
}
