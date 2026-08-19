export interface FinishedRenderSummary {
    readonly outcome: "running" | "finished" | "failed" | "cancelled";
    readonly dataRoot: string | null;
    readonly maps: readonly { readonly id: string }[];
}

/**
 * Promotes finished local render records into the same open-map callback used by
 * a render completing in the current window. This is deliberately idempotent:
 * the callback's profile store reuses the data-root id when a later poll sees
 * the same finished record again.
 */
export function promoteFinishedLocalRenders(
    summaries: readonly FinishedRenderSummary[],
    open: (dataRoot: string, mapIds: readonly string[]) => void,
): void {
    for (const summary of summaries) {
        if (summary.outcome !== "finished" || summary.dataRoot === null) continue;
        open(summary.dataRoot, summary.maps.map((map) => map.id));
    }
}
