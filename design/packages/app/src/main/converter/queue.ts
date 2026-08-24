import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { basename, dirname } from "node:path";
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
    readonly pageSize?: number;
    readonly pageCount?: number;
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
            const parsed = JSON.parse(await readFile(this.input.stateFile, "utf8")) as Partial<ConverterQueueRecord> & { readonly pageCount?: number; readonly pageSize?: number };
            if (parsed.version !== 1) throw new Error("unsupported queue schema");
            let items: ConverterQueueItem[] = [];
            if (Array.isArray(parsed.items)) items = parsed.items as ConverterQueueItem[];
            else {
                const pageCount = parsed.pageCount ?? 0;
                if (!Number.isInteger(pageCount) || pageCount < 0 || pageCount > 1_000_000) throw new Error("invalid queue page count");
                for (let page = 1; page <= pageCount; page += 1) {
                    const pageRecord = JSON.parse(await readFile(`${this.input.stateFile}.page-${page}.json`, "utf8")) as { readonly version?: number; readonly page?: number; readonly items?: readonly ConverterQueueItem[] };
                    if (pageRecord.version !== 1 || pageRecord.page !== page || !Array.isArray(pageRecord.items)) throw new Error(`queue page ${page} is malformed`);
                    items.push(...pageRecord.items);
                }
            }
            const validItems = items.filter((item): item is ConverterQueueItem => typeof item?.id === "string" && typeof item.source === "string" && typeof item.target === "string" && typeof item.adapterId === "string");
            if (validItems.length !== items.length) throw new Error("one or more queue records are malformed");
            this.record = { version: 1, paused: parsed.paused === true, items: validItems.map((item) => item.state === "running" ? { ...item, state: "queued" as const, message: "Recovered after an interrupted run." } : item), history: Array.isArray(parsed.history) ? parsed.history.slice(-1000) as ConverterQueueOutcome[] : [], pageSize: this.options.pageSize, pageCount: Math.ceil(validItems.length / this.options.pageSize) };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes("ENOENT")) this.record = { version: 1, items: [], paused: false, history: [], pageSize: this.options.pageSize, pageCount: 0 };
            else this.record = { version: 1, items: [], paused: true, history: [], pageSize: this.options.pageSize, pageCount: 0, corruption: `Queue state could not be loaded: ${message}. The original file was kept for recovery.` };
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
        const pages = Math.ceil(this.record.items.length / this.options.pageSize);
        this.record = { ...this.record, pageSize: this.options.pageSize, pageCount: pages };
        const index = { version: 1, paused: this.record.paused, history: (this.record.history ?? []).slice(-1000), pageSize: this.options.pageSize, pageCount: pages };
        await atomicWriteTextFile(this.input.stateFile, JSON.stringify(index, null, 2));
        for (let page = 0; page < pages; page += 1) {
            const items = this.record.items.slice(page * this.options.pageSize, (page + 1) * this.options.pageSize);
            await atomicWriteTextFile(`${this.input.stateFile}.page-${page + 1}.json`, JSON.stringify({ version: 1, page: page + 1, items }, null, 2));
        }
        const directory = dirname(this.input.stateFile);
        const prefix = `${basename(this.input.stateFile)}.page-`;
        for (const name of await readdir(directory)) {
            const match = name.startsWith(prefix) ? /\.page-(\d+)\.json$/.exec(name) : null;
            if (match && Number(match[1]) > pages) await rm(`${directory}/${name}`, { force: true });
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
