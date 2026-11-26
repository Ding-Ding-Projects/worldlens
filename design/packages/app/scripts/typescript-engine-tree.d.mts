export interface TypeScriptEngineRepairArchive {
    readonly fileName: string;
    readonly size: number;
    readonly sha256: string;
}

export interface TypeScriptEngineInspection {
    readonly ok: boolean;
    readonly version: string | null;
    /** Every absent piece, named for a person. Empty exactly when `ok` is true. */
    readonly missing: readonly string[];
    readonly repairArchive: TypeScriptEngineRepairArchive | null;
}

export const TYPESCRIPT_ENGINE_PACKAGE_ROOT: string;
export const TYPESCRIPT_ENGINE_REQUIRED_PACKAGES: readonly string[];
export const TYPESCRIPT_ENGINE_REQUIRED_FILES: readonly string[];

export function inspectTypeScriptEngineTree(root: string): Promise<TypeScriptEngineInspection>;
export function probeTypeScriptEngineTree(
    root: string,
    options?: { readonly execPath?: string; readonly timeoutMs?: number },
): Promise<{ readonly ok: boolean; readonly detail: string | null }>;
