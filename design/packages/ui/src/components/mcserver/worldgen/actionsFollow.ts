export interface GenerationRunObservation {
    receipt: {
        operationId: string;
        repository: string;
        workflowFile: string;
        ref: string;
        dispatchedAt: string;
        inputs: Readonly<Record<string, string>>;
        runsUrl: string;
    };
    run: { id: number; htmlUrl: string; status: string; conclusion: string | null } | null;
    jobs: readonly { id: number; name: string; status: string; conclusion: string | null }[];
    worldFolder: string | null;
}
export async function followGeneration(
    action: "check" | "collect",
    id: string,
): Promise<GenerationRunObservation> {
    const host = (
        globalThis as unknown as {
            worldlens?: {
                worldgenActions?: Partial<
                    Record<
                        "check" | "collect",
                        (
                            id: string,
                        ) => Promise<{
                            ok: boolean;
                            value?: GenerationRunObservation;
                            message?: string;
                        }>
                    >
                >;
            };
        }
    ).worldlens?.worldgenActions;
    const method = host?.[action];
    if (!method)
        throw new Error("Generation run observation and collection are unavailable in this build.");
    const answer = await method(id);
    if (!answer.ok || !answer.value)
        throw new Error(answer.message || "Generation run observation is unavailable.");
    return answer.value;
}
