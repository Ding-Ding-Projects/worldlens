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

export interface ConverterQueueOutcome {
    readonly id: string;
    readonly state: "completed" | "cancelled" | "failed";
    readonly message: string | null;
    readonly finishedAt: string;
}

export interface ConverterQueueRecord {
    readonly version: 1;
    readonly items: readonly ConverterQueueItem[];
    readonly paused: boolean;
    readonly corruption?: string;
    readonly history?: readonly ConverterQueueOutcome[];
}

export interface ConverterQueueOptions {
    readonly stateFile: string;
    readonly concurrency?: number;
    readonly run: (item: ConverterQueueItem, signal: AbortSignal, report: (progress: number, bytes?: number) => void) => Promise<void>;
    readonly now?: () => string;
    readonly pageSize?: number;
    readonly storagePreflight?: () => Promise<void>;
}

const MAX_CONCURRENCY = 8;

function clampProgress(value: number): number {
    return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}

export class ConverterQueue {
    private record: ConverterQueueRecord = { version: 1, items: [], paused: false, history: [] };
    private readonly options: Required<Pick<ConverterQueueOptions, "concurrency" | "now">> & { readonly pageSize: number };
    private readonly controllers = new Map<string, AbortController>();
    private draining = false;

    constructor(private readonly input: ConverterQueueOptions) {
        this.options = { concurrency: Math.min(MAX_CONCURRENCY, Math.max(1, Math.floor(input.concurrency ?? 2))), now: input.now ?? (() => new Date().toISOString()), pageSize: Math.min(256, Math.max(1, Math.floor(input.pageSize ?? 128))) };
    }

    async load(): Promise<ConverterQueueRecord> {
        try {
            const parsed = JSON.parse(await readFile(this.input.stateFile, "utf8")) as Partial<ConverterQueueRecord>;
            if (parsed.version !== 1 || !Array.isArray(parsed.items)) throw new Error("unsupported queue schema");
            const items = parsed.items.filter((item): item is ConverterQueueItem => typeof item?.id === "string" && typeof item.source === "string" && typeof item.target === "string");
            if (items.length !== parsed.items.length) throw new Error("one or more queue records are malformed");
            this.record = { version: 1, paused: parsed.paused === true, items: items.map((item) => item.state === "running" ? { ...item, state: "queued" as const, message: "Recovered after an interrupted run." } : item), history: Array.isArray(parsed.history) ? parsed.history.slice(-1000) as ConverterQueueOutcome[] : [] };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes("ENOENT")) this.record = { version: 1, items: [], paused: false, history: [] };
            else this.record = { version: 1, items: [], paused: true, history: [], corruption: `Queue state could not be loaded: ${message}. The original file was kept for recovery.` };
        }
        return this.record;
    }

    snapshot(): ConverterQueueRecord { return this.record; }

    async enqueue(items: readonly Omit<ConverterQueueItem, "state" | "progress" | "message" | "updatedAt">[]): Promise<ConverterQueueRecord> {
        if (this.record.corruption) throw new Error(this.record.corruption);
        await this.input.storagePreflight?.();
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
        if (this.record.corruption) throw new Error(this.record.corruption);
        this.record = { ...this.record, paused: false, items: this.record.items.map((item) => item.state === "paused" ? { ...item, state: "queued" as const, updatedAt: this.options.now(), message: null } : item) };
        await this.persist();
        void this.drain().catch(() => undefined);
    }

    async cancel(id: string): Promise<boolean> {
        const item = this.record.items.find((candidate) => candidate.id === id);
        if (item === undefined || ["completed", "cancelled", "failed"].includes(item.state)) return false;
        this.controllers.get(id)?.abort();
        this.record = { ...this.record, items: this.record.items.map((candidate) => candidate.id === id ? { ...candidate, state: "cancelled" as const, message: "Cancelled by the user.", updatedAt: this.options.now() } : candidate), history: [...(this.record.history ?? []), { id, state: "cancelled" as const, message: "Cancelled by the user.", finishedAt: this.options.now() }].slice(-1000) };
        await this.persist();
        return true;
    }

    async retry(id: string): Promise<boolean> {
        if (this.record.corruption) return false;
        const item = this.record.items.find((candidate) => candidate.id === id);
        if (item === undefined || (item.state !== "failed" && item.state !== "cancelled")) return false;
        this.record = { ...this.record, items: this.record.items.map((candidate) => candidate.id === id ? { ...candidate, state: "queued" as const, progress: 0, message: null, updatedAt: this.options.now() } : candidate) };
        await this.persist();
        void this.drain().catch(() => undefined);
        return true;
    }

    private async persist(): Promise<void> {
        await mkdir(dirname(this.input.stateFile), { recursive: true });
        await atomicWriteTextFile(this.input.stateFile, JSON.stringify(this.record, null, 2));
        const pages = Math.ceil(this.record.items.length / this.options.pageSize);
        for (let page = 0; page < pages; page += 1) {
            const items = this.record.items.slice(page * this.options.pageSize, (page + 1) * this.options.pageSize);
            await atomicWriteTextFile(`${this.input.stateFile}.page-${page + 1}.json`, JSON.stringify({ version: 1, page: page + 1, items }, null, 2));
        }
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
            this.record = { ...this.record, history: [...(this.record.history ?? []), { id: item.id, state: "completed" as const, message: null, finishedAt: this.options.now() }].slice(-1000) };
        } catch (error) {
            if (!controller.signal.aborted) {
                const message = error instanceof Error ? error.message : String(error);
                this.patch(item.id, { state: "failed", message });
                this.record = { ...this.record, history: [...(this.record.history ?? []), { id: item.id, state: "failed" as const, message, finishedAt: this.options.now() }].slice(-1000) };
            }
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
