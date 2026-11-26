export const TYPESCRIPT_ENGINE_REPAIR_ARCHIVE: string;

export interface StagedTypeScriptEngineEntry {
    readonly id: "typescript";
    readonly version: string;
    readonly available: true;
    readonly packageResolution: {
        readonly root: string;
        readonly packages: ReadonlyArray<{
            readonly name: string;
            readonly root: string;
            readonly main: string;
        }>;
    };
    readonly repairArchive: {
        readonly fileName: string;
        readonly size: number;
        readonly sha256: string;
        readonly files: number;
    };
}

export function stageTypeScriptEngine(
    outputDirectory: string,
    options?: { readonly probe?: boolean },
): Promise<StagedTypeScriptEngineEntry>;

export function stageRenderEngines(
    outputDirectory?: string,
    options?: { readonly requireJava?: boolean; readonly probe?: boolean },
): Promise<{ readonly manifestVersion: 1; readonly engines: Record<string, unknown> }>;
