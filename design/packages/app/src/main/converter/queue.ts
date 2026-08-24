import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { atomicWriteTextFile } from "../storage/atomicReplace.js";

export type ConverterItemState = "queued" | "running" | "paused" | "completed" | "cancelled" | "failed";

export interface ConverterQueueItem {
    readonly id: string;
    readonly source: string;
    readonly target: string;
    readonly adapterId: string;
    readonly state: ConverterItemState;
    readonly bytes: number | null;
    readonly progress: number;
    readonly message: string | null;
    readonly updatedAt: string;
}

export interface ConverterQueueRecord {
    readonly version: 1;
    readonly items: readonly ConverterQueueItem[];
    readonly paused: boolean;
}

export interface ConverterQueueOptions {
    readonly stateFile: string;
    readonly concurrency?: number;
    readonly run: (item: ConverterQueueItem, signal: AbortSignal, report: (progress: number, bytes?: number) => void) => Promise<void>;
    readonly now?: () => string;
}

const MAX_CONCURRENCY = 8;

function clampProgress(value: number): number {
    return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}

export class ConverterQueue {
    private record: ConverterQueueRecord = { version: 1, items: [], paused: false };
    private readonly options: Required<Pick<ConverterQueueOptions, "concurrency" | "now">>;
    private readonly controllers = new Map<string, AbortController>();
    private draining = false;

    constructor(private readonly input: ConverterQueueOptions) {
        this.options = { concurrency: Math.min(MAX_CONCURRENCY, Math.max(1, Math.floor(input.concurrency ?? 2))), now: input.now ?? (() => new Date().toISOString()) };
    }

    async load(): Promise<ConverterQueueRecord> {
        try {
            const parsed = JSON.parse(await readFile(this.input.stateFile, "utf8")) as Partial<ConverterQueueRecord>;
            if (parsed.version !== 1 || !Array.isArray(parsed.items)) throw new Error("unsupported queue schema");
            this.record = { version: 1, paused: parsed.paused === true, items: parsed.items.filter((item): item is ConverterQueueItem => typeof item?.id === "string" && typeof item.source === "string" && typeof item.target === "string") };
        } catch {
            this.record = { version: 1, items: [], paused: false };
        }
        return this.record;
    }

    snapshot(): ConverterQueueRecord { return this.record; }

    async enqueue(items: readonly Omit<ConverterQueueItem, "state" | "progress" | "message" | "updatedAt">[]): Promise<ConverterQueueRecord> {
        const now = this.options.now();
        this.record = { ...this.record, items: [...this.record.items, ...items.map((item) => ({ ...item, state: "queued" as const, progress: 0, message: null, updatedAt: now }))] };
        await this.persist();
        void this.drain().catch(() => undefined);
        return this.record;
    }

    async pause(): Promise<void> {
        this.record = { ...this.record, paused: true, items: this.record.items.map((item) => item.state === "running" ? { ...item, state: "paused" as const, updatedAt: this.options.now() } : item) };
        for (const controller of this.controllers.values()) controller.abort();
        await this.persist();
    }

    async resume(): Promise<void> {
        this.record = { ...this.record, paused: false, items: this.record.items.map((item) => item.state === "paused" ? { ...item, state: "queued" as const, updatedAt: this.options.now(), message: null } : item) };
        await this.persist();
        void this.drain().catch(() => undefined);
    }

    async cancel(id: string): Promise<boolean> {
        const item = this.record.items.find((candidate) => candidate.id === id);
        if (item === undefined || ["completed", "cancelled", "failed"].includes(item.state)) return false;
        this.controllers.get(id)?.abort();
        this.record = { ...this.record, items: this.record.items.map((candidate) => candidate.id === id ? { ...candidate, state: "cancelled" as const, message: "Cancelled by the user.", updatedAt: this.options.now() } : candidate) };
        await this.persist();
        return true;
    }

    private async persist(): Promise<void> {
        await mkdir(dirname(this.input.stateFile), { recursive: true });
        await atomicWriteTextFile(this.input.stateFile, JSON.stringify(this.record, null, 2));
    }

    private async drain(): Promise<void> {
        if (this.draining || this.record.paused) return;
        this.draining = true;
        try {
            while (!this.record.paused) {
                const pending = this.record.items.filter((item) => item.state === "queued").slice(0, this.options.concurrency - this.controllers.size);
                if (pending.length === 0) break;
                await Promise.all(pending.map((item) => this.runOne(item)));
            }
        } finally { this.draining = false; }
    }

    private async runOne(item: ConverterQueueItem): Promise<void> {
        const controller = new AbortController();
        this.controllers.set(item.id, controller);
        this.patch(item.id, { state: "running", message: null });
        try {
            await this.input.run(this.current(item.id), controller.signal, (progress, bytes) => this.patch(item.id, { progress: clampProgress(progress), ...(bytes === undefined ? {} : { bytes }) }));
            if (controller.signal.aborted) return;
            this.patch(item.id, { state: "completed", progress: 100 });
        } catch (error) {
            if (!controller.signal.aborted) this.patch(item.id, { state: "failed", message: error instanceof Error ? error.message : String(error) });
        } finally {
            this.controllers.delete(item.id);
            await this.persist();
        }
    }

    private current(id: string): ConverterQueueItem { return this.record.items.find((item) => item.id === id)!; }

    private patch(id: string, patch: Partial<ConverterQueueItem>): void {
        this.record = { ...this.record, items: this.record.items.map((item) => item.id === id ? { ...item, ...patch, updatedAt: this.options.now() } : item) };
    }
}
