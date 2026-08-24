export interface ConverterBridge {
    catalog(): Promise<readonly ConverterAdapter[]>;
    inspect(path: string): Promise<ConverterInspection>;
    enqueue(items: readonly ConverterQueueDraft[]): Promise<unknown>;
    queue(): Promise<ConverterQueueRecord>;
    pause(): Promise<unknown>;
    resume(): Promise<unknown>;
    cancel(id: string): Promise<boolean>;
}
export interface ConverterAdapter { id: string; name: string; category: string; sourceExtensions: string[]; targetExtensions: string[]; bundled: boolean; available: boolean; unavailableReason: string | null; lossiness: string; }
export interface ConverterInspection { ok: boolean; path?: string; bytes?: number; message: string; adapter?: ConverterAdapter | null; }
export interface ConverterQueueDraft { id: string; source: string; target: string; adapterId: string; bytes?: number | null; }
export interface ConverterQueueItem extends ConverterQueueDraft { state: string; progress: number; message: string | null; updatedAt: string; }
export interface ConverterQueueRecord { version: 1; items: ConverterQueueItem[]; paused: boolean; }

export function resolveConverterBridge(): ConverterBridge | null {
    const value = (globalThis as { worldlens?: { converter?: ConverterBridge } }).worldlens?.converter;
    return value?.catalog && value.inspect && value.enqueue ? value : null;
}
