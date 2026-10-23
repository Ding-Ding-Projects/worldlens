import { ref } from "vue";
import type { Control } from "@worldlens/config";
export const generationDialogOpen = ref(false);
export interface GenerationField {
    key: string;
    label: string;
    category: string;
    control: Control | null;
    value?: unknown;
    available: boolean;
    reason: string | null;
}
export interface GenerationState {
    id: string;
    stage: string;
    worldFolder: string | null;
    projectPath: string | null;
    message: string;
}
export interface GenerationRequest {
    operationId: string;
    name: string;
    edition: "java";
    flavour: "vanilla" | "paper" | "purpur" | "spigot";
    version: string;
    seed: string;
    worldName: string;
    memoryMb: number;
    port: number;
    downloadConsent: boolean;
    acceptedEula: boolean;
    provisionJavaIfMissing: boolean;
    properties?: Record<string, string>;
    capabilityValues?: Record<string, unknown>;
}
interface Answer<T> {
    ok: boolean;
    value?: T;
    failure?: { code: string; message: string };
}
export interface GenerationBridge {
    run(request: GenerationRequest): Promise<Answer<GenerationState>>;
    read(id: string): Promise<Answer<GenerationState | null>>;
    cancel(id: string): Promise<Answer<{ requested: boolean }>>;
    capabilities?(target: {
        edition: string;
        version: string;
        flavour: string;
        serverId?: string;
    }): Promise<Answer<{ inventory: unknown; descriptors: GenerationField[] }>>;
    onState?(listener: (state: GenerationState) => void): () => void;
}
export function generationBridge(): GenerationBridge | null {
    const api = (
        globalThis as unknown as { worldlens?: { mcserver?: { generation?: GenerationBridge } } }
    ).worldlens?.mcserver?.generation;
    return typeof api?.run === "function" &&
        typeof api.read === "function" &&
        typeof api.cancel === "function"
        ? api
        : null;
}
