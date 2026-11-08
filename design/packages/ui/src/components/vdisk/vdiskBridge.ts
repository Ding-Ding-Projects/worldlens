/** The virtual disk bridge as the interface sees it; null outside the desktop app. */
export interface VirtualDiskRoutes {
    readonly virtdisk: boolean;
    readonly storage: boolean;
    readonly diskpart: boolean;
    readonly hyperv: boolean;
}

export interface VirtualDiskStatus {
    readonly available: boolean;
    readonly reason: string | null;
    readonly routes: VirtualDiskRoutes;
}

export interface VirtualDiskEntry {
    readonly path: string;
    readonly format: string | null;
    readonly fileBytes: number | null;
    readonly virtualBytes: number | null;
    readonly attached: boolean;
    readonly diskNumber: number | null;
    readonly readOnly: boolean;
    readonly letters: readonly string[];
    readonly inLibrary: boolean;
    readonly missing: boolean;
}

export interface VirtualDiskOperationResult {
    readonly ok: boolean;
    readonly cancelled: boolean;
    readonly route: string | null;
    readonly message: string;
    readonly script: string;
    readonly details?: Readonly<Record<string, unknown>>;
}

export interface VirtualDiskHistoryEntry {
    readonly at: string;
    readonly operation: string;
    readonly path: string;
    readonly route: string | null;
    readonly ok: boolean;
    readonly message: string;
}

export interface VirtualDiskPackProgress {
    readonly phase: "size" | "create" | "copy" | "verify" | "detach" | "done";
    readonly filesDone: number;
    readonly filesTotal: number;
    readonly bytesDone: number;
    readonly bytesTotal: number;
    readonly current: string | null;
    readonly growths: readonly { readonly from: number; readonly to: number; readonly atFile: number }[];
}

export interface VirtualDiskPackResult {
    readonly ok: boolean;
    readonly partial: boolean;
    readonly cancelled: boolean;
    readonly path: string | null;
    readonly virtualBytes: number;
    readonly files: number;
    readonly verified: number;
    readonly skipped: readonly { readonly path: string; readonly reason: string }[];
    readonly growths: VirtualDiskPackProgress["growths"];
    readonly message: string;
}

export interface VirtualDiskBridge {
    status(): Promise<VirtualDiskStatus>;
    list(): Promise<readonly VirtualDiskEntry[]>;
    history(): Promise<readonly VirtualDiskHistoryEntry[]>;
    addToLibrary(paths: readonly string[]): Promise<{ readonly added: readonly string[]; readonly refused: readonly { readonly path: string; readonly reason: string }[] }>;
    removeFromLibrary(path: string): Promise<readonly VirtualDiskEntry[]>;
    script(request: unknown, route?: string): Promise<{ readonly full: string; readonly preview: string }>;
    run(request: unknown): Promise<VirtualDiskOperationResult>;
    quickPack(sources: readonly string[]): Promise<VirtualDiskPackResult>;
    cancelPack(): Promise<boolean>;
    prepareMapDisk(vhdx: string, sizeBytes: number): Promise<{ readonly ok: boolean; readonly mount: string | null; readonly message: string }>;
    onProgress(listener: (progress: VirtualDiskPackProgress) => void): () => void;
}

export function virtualDiskBridge(): VirtualDiskBridge | null {
    const bridge = (globalThis.window as unknown as { worldlens?: { vdisk?: VirtualDiskBridge } } | undefined)?.worldlens?.vdisk;
    return bridge ?? null;
}
