import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
    Base64StreamDecoder,
    Base64StreamEncoder,
    SIDECAR_SUFFIX,
    decodedFileName,
    freeSiblingName,
    type EncodeOptions,
} from "@worldlens/shared/base64";

export interface FileJobProgress {
    readonly jobId: string;
    readonly direction: "encode" | "decode";
    readonly source: string;
    readonly bytesDone: number;
    readonly bytesTotal: number;
    readonly paused: boolean;
}

export interface FileJobResult {
    readonly ok: boolean;
    readonly cancelled: boolean;
    readonly jobId: string;
    readonly direction: "encode" | "decode";
    readonly source: string;
    /** The written file, beside the source. Null when nothing was kept. */
    readonly output: string | null;
    readonly sourceBytes: number;
    readonly outputBytes: number;
    /** SHA-256 of the original bytes (the source for encode, the decoded output for decode). */
    readonly sha256: string | null;
    /** How the decoded name was chosen. */
    readonly namedFrom?: "name" | "data-url" | "signature" | "fallback";
    readonly message: string;
}

/** Pause, resume and cancel for one running job, checked between chunks. */
class JobControl {
    paused = false;
    cancelled = false;
    private waiters: (() => void)[] = [];

    async gate(): Promise<void> {
        while (this.paused && !this.cancelled) await new Promise<void>((resolve) => this.waiters.push(resolve));
    }

    setPaused(value: boolean): void {
        this.paused = value;
        if (!value) this.release();
    }

    cancel(): void {
        this.cancelled = true;
        this.release();
    }

    private release(): void {
        const waiting = this.waiters;
        this.waiters = [];
        for (const resolve of waiting) resolve();
    }
}

const CHUNK = 1024 * 1024;

/**
 * Same-folder Base64 conversion for files of any size. Memory stays bounded by one chunk: the
 * source is streamed through the shared encoder or decoder into a hidden `.partial` sibling, which
 * is renamed to a free name only after its SHA-256 round trip matches. Nothing is ever overwritten
 * and a failure or cancel leaves no partial output behind.
 */
export class Base64FileJobs {
    private readonly jobs = new Map<string, JobControl>();

    constructor(private readonly onProgress: (progress: FileJobProgress) => void = () => undefined) {}

    pause(jobId: string): boolean {
        const job = this.jobs.get(jobId);
        job?.setPaused(true);
        return job !== undefined;
    }

    resume(jobId: string): boolean {
        const job = this.jobs.get(jobId);
        job?.setPaused(false);
        return job !== undefined;
    }

    cancel(jobId: string): boolean {
        const job = this.jobs.get(jobId);
        job?.cancel();
        return job !== undefined;
    }

    cancelAll(): void {
        for (const job of this.jobs.values()) job.cancel();
    }

    /** `report.pdf` becomes `report.pdf.base64.txt` beside it, verified by decoding it again. */
    async encode(source: string, options: EncodeOptions = {}, jobId: string = randomUUID()): Promise<FileJobResult> {
        const control = new JobControl();
        this.jobs.set(jobId, control);
        const folder = path.dirname(source);
        const partial = path.join(folder, `.${path.basename(source)}.${jobId}.partial`);
        const base = { jobId, direction: "encode" as const, source };
        try {
            const stat = await fs.stat(source);
            if (!stat.isFile()) return { ...base, ok: false, cancelled: false, output: null, sourceBytes: 0, outputBytes: 0, sha256: null, message: "Choose a file, not a folder." };
            const hash = createHash("sha256");
            const encoder = new Base64StreamEncoder(options);
            const out = createWriteStream(partial, { flags: "wx" });
            let done = 0;
            let lastReport = 0;
            for await (const chunk of createReadStream(source, { highWaterMark: CHUNK })) {
                await control.gate();
                if (control.cancelled) break;
                const bytes = chunk as Buffer;
                hash.update(bytes);
                await write(out, encoder.push(bytes));
                done += bytes.length;
                if (Date.now() - lastReport > 100) {
                    lastReport = Date.now();
                    this.onProgress({ ...base, bytesDone: done, bytesTotal: stat.size, paused: control.paused });
                }
            }
            if (control.cancelled) {
                await close(out);
                await fs.rm(partial, { force: true });
                return { ...base, ok: false, cancelled: true, output: null, sourceBytes: stat.size, outputBytes: 0, sha256: null, message: "Cancelled. Nothing was written." };
            }
            await write(out, encoder.end());
            await close(out);
            const sha256 = hash.digest("hex");
            const check = await hashDecoded(partial, options.alphabet === "url" ? "url" : "standard");
            if (check !== sha256) {
                await fs.rm(partial, { force: true });
                return { ...base, ok: false, cancelled: false, output: null, sourceBytes: stat.size, outputBytes: 0, sha256, message: "The Base64 did not decode back to the same bytes, so it was not kept." };
            }
            const name = freeSiblingName(`${path.basename(source)}${SIDECAR_SUFFIX}`, (candidate) => existsSync(path.join(folder, candidate)));
            const output = path.join(folder, name);
            await fs.rename(partial, output);
            const outputBytes = (await fs.stat(output)).size;
            this.onProgress({ ...base, bytesDone: stat.size, bytesTotal: stat.size, paused: false });
            return { ...base, ok: true, cancelled: false, output, sourceBytes: stat.size, outputBytes, sha256, message: `Wrote ${name}. Decoding it again gave the same SHA-256.` };
        } catch (error) {
            await fs.rm(partial, { force: true }).catch(() => undefined);
            return { ...base, ok: false, cancelled: false, output: null, sourceBytes: 0, outputBytes: 0, sha256: null, message: describe(error) };
        } finally {
            this.jobs.delete(jobId);
        }
    }

    /**
     * `report.pdf.base64.txt` (or `.b64`) becomes `report.pdf` beside it. The name comes from the
     * file name pattern, then a leading `data:` URL's type, then the decoded bytes' signature.
     */
    async decode(source: string, jobId: string = randomUUID()): Promise<FileJobResult> {
        const control = new JobControl();
        this.jobs.set(jobId, control);
        const folder = path.dirname(source);
        const partial = path.join(folder, `.${path.basename(source)}.${jobId}.partial`);
        const base = { jobId, direction: "decode" as const, source };
        try {
            const stat = await fs.stat(source);
            if (!stat.isFile()) return { ...base, ok: false, cancelled: false, output: null, sourceBytes: 0, outputBytes: 0, sha256: null, message: "Choose a file, not a folder." };
            const decoder = new Base64StreamDecoder({ alphabet: "standard", strict: false });
            const hash = createHash("sha256");
            const out = createWriteStream(partial, { flags: "wx" });
            const head: number[] = [];
            let mime: string | null = null;
            let prefixChecked = false;
            let pending = "";
            let done = 0;
            let written = 0;
            let lastReport = 0;
            const emit = async (bytes: Uint8Array): Promise<void> => {
                if (bytes.length === 0) return;
                for (let i = 0; i < bytes.length && head.length < 4096; i += 1) head.push(bytes[i]!);
                hash.update(bytes);
                written += bytes.length;
                await write(out, bytes);
            };
            for await (const chunk of createReadStream(source, { encoding: "latin1", highWaterMark: CHUNK })) {
                await control.gate();
                if (control.cancelled) break;
                let text = chunk as string;
                done += text.length;
                if (!prefixChecked) {
                    pending += text;
                    if (pending.length < 512 && done < stat.size) continue;
                    prefixChecked = true;
                    text = pending.replace(/^﻿/u, "");
                    const match = /^\s*data:([^,;]*)(?:;[^,]*)?,/u.exec(text);
                    if (match) {
                        mime = match[1] || null;
                        text = text.slice(match[0].length);
                    }
                }
                // Both alphabets are accepted when decoding a file; URL-safe characters are mapped.
                await emit(decoder.push(text.replace(/-/gu, "+").replace(/_/gu, "/")));
                if (Date.now() - lastReport > 100) {
                    lastReport = Date.now();
                    this.onProgress({ ...base, bytesDone: done, bytesTotal: stat.size, paused: control.paused });
                }
            }
            if (!prefixChecked && !control.cancelled) {
                const text = pending.replace(/^﻿/u, "");
                const match = /^\s*data:([^,;]*)(?:;[^,]*)?,/u.exec(text);
                mime = match ? match[1] || null : null;
                await emit(decoder.push((match ? text.slice(match[0].length) : text).replace(/-/gu, "+").replace(/_/gu, "/")));
            }
            if (control.cancelled) {
                await close(out);
                await fs.rm(partial, { force: true });
                return { ...base, ok: false, cancelled: true, output: null, sourceBytes: stat.size, outputBytes: 0, sha256: null, message: "Cancelled. Nothing was written." };
            }
            await emit(decoder.end());
            await close(out);
            if (written === 0) {
                await fs.rm(partial, { force: true });
                return { ...base, ok: false, cancelled: false, output: null, sourceBytes: stat.size, outputBytes: 0, sha256: null, message: "The file holds no Base64 data." };
            }
            const sha256 = hash.digest("hex");
            if ((await hashFile(partial)) !== sha256) {
                await fs.rm(partial, { force: true });
                return { ...base, ok: false, cancelled: false, output: null, sourceBytes: stat.size, outputBytes: 0, sha256, message: "The written file did not match what was decoded, so it was not kept." };
            }
            const chosen = decodedFileName(path.basename(source), mime, Uint8Array.from(head));
            const name = freeSiblingName(chosen.name, (candidate) => existsSync(path.join(folder, candidate)));
            const output = path.join(folder, name);
            await fs.rename(partial, output);
            this.onProgress({ ...base, bytesDone: stat.size, bytesTotal: stat.size, paused: false });
            return { ...base, ok: true, cancelled: false, output, sourceBytes: stat.size, outputBytes: written, sha256, namedFrom: chosen.from, message: `Wrote ${name}.` };
        } catch (error) {
            await fs.rm(partial, { force: true }).catch(() => undefined);
            return { ...base, ok: false, cancelled: false, output: null, sourceBytes: 0, outputBytes: 0, sha256: null, message: describe(error) };
        } finally {
            this.jobs.delete(jobId);
        }
    }
}

/** At most `limit` bytes from the start of a file, for a safe preview. */
export async function readHead(file: string, limit = 256 * 1024): Promise<Uint8Array> {
    const handle = await fs.open(file, "r");
    try {
        const buffer = Buffer.alloc(limit);
        const { bytesRead } = await handle.read(buffer, 0, limit, 0);
        return new Uint8Array(buffer.subarray(0, bytesRead));
    } finally {
        await handle.close();
    }
}

/** Writes bytes to `target`, or to a numbered sibling if `target` exists. Returns the path used. */
export async function writeNew(target: string, bytes: Uint8Array): Promise<string> {
    const folder = path.dirname(target);
    const name = freeSiblingName(path.basename(target), (candidate) => existsSync(path.join(folder, candidate)));
    const finalPath = path.join(folder, name);
    await fs.writeFile(finalPath, bytes, { flag: "wx" });
    return finalPath;
}

function describe(error: unknown): string {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return "The file is no longer there.";
    if (code === "EACCES" || code === "EPERM") return "Worldlens is not allowed to read that file or write in its folder.";
    if (code === "ENOSPC") return "The drive is full. Nothing was kept.";
    return error instanceof Error ? error.message : String(error);
}

function write(stream: NodeJS.WritableStream, data: string | Uint8Array): Promise<void> {
    if (data.length === 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const ok = stream.write(data, (error) => (error ? reject(error) : undefined));
        if (ok) resolve();
        else stream.once("drain", () => resolve());
    });
}

function close(stream: ReturnType<typeof createWriteStream>): Promise<void> {
    return new Promise((resolve, reject) => {
        stream.end((error?: Error | null) => (error ? reject(error) : resolve()));
    });
}

async function hashFile(file: string): Promise<string> {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(file, { highWaterMark: CHUNK })) hash.update(chunk as Buffer);
    return hash.digest("hex");
}

async function hashDecoded(file: string, alphabet: "standard" | "url"): Promise<string> {
    const hash = createHash("sha256");
    const decoder = new Base64StreamDecoder({ alphabet, strict: false });
    for await (const chunk of createReadStream(file, { encoding: "latin1", highWaterMark: CHUNK })) hash.update(decoder.push(chunk as string));
    hash.update(decoder.end());
    return hash.digest("hex");
}
