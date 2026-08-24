export function converterBridge(): ConverterBridge | null {
    return globalThis.window?.worldlens?.converter ?? null;
}

export interface ConverterBridge {
    catalog(): Promise<readonly ConverterAdapter[]>;
    inspect(path: string): Promise<ConverterInspection>;
    pdf(request: ConverterPdfRequest): Promise<ConverterOperationResult>;
    enqueue(items: readonly ConverterQueueDraft[]): Promise<{ readonly ok: boolean; readonly queue?: ConverterQueueRecord; readonly message?: string }>;
    queue(): Promise<ConverterQueueRecord>;
    pause(): Promise<ConverterQueueRecord>;
    resume(): Promise<ConverterQueueRecord>;
    cancel(id: string): Promise<boolean>;
    retry(id: string): Promise<boolean>;
    openInEditor(path: string): Promise<{ readonly ok: boolean; readonly message: string }>;
}
export interface ConverterAdapter { readonly id: string; readonly name: string; readonly category: string; readonly sourceExtensions: readonly string[]; readonly targetExtensions: readonly string[]; readonly bundled: boolean; readonly available: boolean; readonly unavailableReason: string | null; readonly lossiness: string; }
export interface ConverterInspection { readonly ok: boolean; readonly path?: string; readonly bytes?: number; readonly adapter?: ConverterAdapter | null; readonly candidates?: readonly ConverterAdapter[]; readonly ambiguous?: boolean; readonly message: string; }
export interface ConverterPdfRequest { readonly operation: string; readonly inputs: readonly string[]; readonly output: string; readonly overwrite: boolean; readonly overwriteConfirmation?: string; readonly pages?: readonly number[]; readonly rotation?: number; readonly metadata?: Readonly<Record<string, string>>; readonly outputs?: readonly string[]; }
export interface ConverterOperationResult { readonly ok: boolean; readonly output: string | null; readonly outputs?: readonly string[]; readonly pages: number | null; readonly pageOrder?: readonly number[]; readonly rotations?: readonly number[]; readonly metadata: Readonly<Record<string, string>>; readonly message: string; }
export interface ConverterQueueDraft { readonly id: string; readonly source: string; readonly target: string; readonly adapterId: string; readonly bytes: number | null; }
export interface ConverterQueueItem extends ConverterQueueDraft { readonly state: string; readonly progress: number; readonly message: string | null; readonly updatedAt: string; }
export interface ConverterQueueRecord { readonly version: 1; readonly items: readonly ConverterQueueItem[]; readonly paused: boolean; readonly corruption?: string; readonly history?: readonly Record<string, unknown>[]; }
