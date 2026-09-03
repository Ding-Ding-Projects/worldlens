import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { SafeStorageLike } from "../worlddownloader/credentialStore.js";

const VERSION = 1;
const MAX_ENTRIES = 512;
const MAX_QUERY = 200;
function validDateFilter(value: string | undefined): boolean {
    if (value === undefined || value === "") return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export interface RuntimeHistoryRecord {
    readonly id: string;
    readonly at: string;
    readonly action: "created" | "updated" | "deleted" | "restored" | "imported";
    readonly fields: readonly string[];
    readonly digest: string;
    readonly before?: Readonly<Record<string, unknown>>;
    readonly after?: Readonly<Record<string, unknown>>;
}

interface HistoryFile { readonly version: number; readonly entries: readonly RuntimeHistoryRecord[]; }

function parseFile(value: unknown): HistoryFile {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return { version: VERSION, entries: [] };
    const record = value as Record<string, unknown>;
    if (record.version !== VERSION || !Array.isArray(record.entries)) return { version: VERSION, entries: [] };
    const entries = record.entries.filter((entry): entry is RuntimeHistoryRecord => {
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return false;
        const item = entry as Record<string, unknown>;
        return typeof item.id === "string" && typeof item.at === "string" && ["created", "updated", "deleted", "restored", "imported"].includes(item.action as string) && Array.isArray(item.fields) && item.fields.every((field) => typeof field === "string" && field.length <= 120) && typeof item.digest === "string";
    }).slice(0, MAX_ENTRIES);
    return { version: VERSION, entries };
}

function renameWithRetry(from: string, to: string): void {
    for (let attempt = 0; attempt < 4; attempt += 1) {
        try { renameSync(from, to); return; }
        catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (!["EPERM", "EACCES", "EBUSY"].includes(code ?? "") || attempt === 3) throw error;
        }
    }
}

export class RuntimeHistoryService {
    readonly #file: string;
    readonly #credentialFile: string;
    readonly #safeStorage: SafeStorageLike;
    #unlockedUntil = 0;

    constructor(options: { readonly file: string; readonly credentialFile: string; readonly safeStorage: SafeStorageLike }) {
        this.#file = options.file;
        this.#credentialFile = options.credentialFile;
        this.#safeStorage = options.safeStorage;
    }

    presence(): { readonly configured: boolean; readonly unlocked: boolean } {
        return { configured: this.readCredential() !== null, unlocked: this.#unlockedUntil > Date.now() };
    }

    setCredential(password: string): { readonly ok: boolean; readonly message: string } {
        if (password.length < 8 || password.length > 256) return { ok: false, message: "The runtime history credential must be 8 to 256 characters." };
        if (this.readCredential() !== null && !this.isUnlocked()) return { ok: false, message: "Unlock runtime history before replacing its credential." };
        if (!this.#safeStorage.isEncryptionAvailable()) return { ok: false, message: "This computer has no working credential store for runtime history." };
        const salt = randomBytes(16).toString("base64");
        const digest = scryptSync(password, salt, 32).toString("base64");
        try {
            mkdirSync(dirname(this.#credentialFile), { recursive: true });
            const ciphertext = this.#safeStorage.encryptString(JSON.stringify({ salt, digest }));
            const staging = `${this.#credentialFile}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
            writeFileSync(staging, JSON.stringify({ version: VERSION, ciphertext: ciphertext.toString("base64") }), { encoding: "utf8", mode: 0o600 });
            renameWithRetry(staging, this.#credentialFile);
            this.#unlockedUntil = Date.now() + 15 * 60 * 1000;
            return { ok: true, message: "Runtime history access is configured." };
        } catch { return { ok: false, message: "Runtime history credential could not be saved." }; }
    }

    verify(password: string): { readonly ok: boolean; readonly message: string } {
        const stored = this.readCredential();
        if (stored === null) return { ok: false, message: "Runtime history has no configured credential." };
        try {
            const digest = scryptSync(password, stored.salt, 32);
            const expected = Buffer.from(stored.digest, "base64");
            if (digest.length !== expected.length || !timingSafeEqual(digest, expected)) return { ok: false, message: "The runtime history credential did not match." };
            this.#unlockedUntil = Date.now() + 15 * 60 * 1000;
            return { ok: true, message: "Runtime history is unlocked for 15 minutes." };
        } catch { return { ok: false, message: "Runtime history credential could not be verified." }; }
    }

    list(input: { readonly query?: string; readonly action?: string; readonly from?: string; readonly to?: string; readonly regex?: boolean; readonly flags?: string } = {}): readonly RuntimeHistoryRecord[] {
        if (!this.isUnlocked()) return [];
        const query = (input.query ?? "").slice(0, MAX_QUERY);
        if (!validDateFilter(input.from) || !validDateFilter(input.to) || (input.from !== undefined && input.to !== undefined && input.from > input.to)) return [];
        let matcher: RegExp | null = null;
        if (input.regex === true && query !== "") {
            try { matcher = new RegExp(query, (input.flags ?? "im").slice(0, 8)); } catch { return []; }
        }
        return this.readFile().entries.filter((entry) => {
            if (input.action !== undefined && entry.action !== input.action) return false;
            if (input.from !== undefined && entry.at < input.from) return false;
            if (input.to !== undefined && entry.at > input.to) return false;
            const text = `${entry.action} ${entry.fields.join(" ")}`;
            if (query === "") return true;
            if (matcher === null) return text.toLowerCase().includes(query.toLowerCase());
            matcher.lastIndex = 0;
            return matcher.test(text);
        });
    }

    diff(id: string): { readonly ok: boolean; readonly message: string; readonly entry?: RuntimeHistoryRecord } {
        if (!this.isUnlocked()) return { ok: false, message: "Runtime history is locked." };
        const entry = this.readFile().entries.find((candidate) => candidate.id === id);
        return entry === undefined ? { ok: false, message: "That runtime history revision is not available." } : { ok: true, message: "The redacted runtime history revision is available.", entry };
    }

    restore(id: string): { readonly ok: boolean; readonly message: string; readonly entry?: RuntimeHistoryRecord; readonly snapshot?: Readonly<Record<string, unknown>> } {
        const current = this.readFile().entries.find((entry) => entry.id === id);
        if (current === undefined) return { ok: false, message: "That runtime history revision is not available." };
        if (current.after === undefined) return { ok: false, message: "That revision has no redacted settings snapshot to restore." };
        const entry = this.append("restored", current.fields, current.after, current.after);
        return entry === null ? { ok: false, message: "Runtime history is locked or could not be written." } : { ok: true, message: "The restore was appended as a new runtime history revision.", entry, snapshot: current.after };
    }

    append(action: RuntimeHistoryRecord["action"], fields: readonly string[], before?: Readonly<Record<string, unknown>>, after?: Readonly<Record<string, unknown>>): RuntimeHistoryRecord | null {
        if (!this.isUnlocked()) return null;
        const scrub = (value: Readonly<Record<string, unknown>> | undefined): Readonly<Record<string, unknown>> | undefined => {
            if (value === undefined) return undefined;
            const serialized = JSON.stringify(value);
            if (serialized.length > 32_768) return undefined;
            const clone = JSON.parse(serialized) as Record<string, unknown>;
            for (const key of Object.keys(clone)) if (/token|secret|credential|password|authorization|cookie/i.test(key)) delete clone[key];
            return clone;
        };
        const safeBefore = scrub(before);
        const safeAfter = scrub(after);
        const entry: RuntimeHistoryRecord = { id: `${Date.now()}-${randomBytes(5).toString("hex")}`, at: new Date().toISOString(), action, fields: [...new Set(fields)].slice(0, 32), digest: createHash("sha256").update(`${action}\n${fields.join("\n")}\n${JSON.stringify(safeBefore)}\n${JSON.stringify(safeAfter)}`).digest("hex"), ...(safeBefore === undefined ? {} : { before: safeBefore }), ...(safeAfter === undefined ? {} : { after: safeAfter }) };
        const next = { version: VERSION, entries: [entry, ...this.readFile().entries].slice(0, MAX_ENTRIES) };
        return this.writeFile(next) ? entry : null;
    }

    exportRedacted(format: "json" | "markdown" = "json"): string {
        const entries = this.list();
        if (format === "markdown") return `# Runtime history\n\n${entries.map((entry) => `- ${entry.at} · ${entry.action} · ${entry.fields.join(", ")} · ${entry.digest}`).join("\n")}\n\nCredentials and private values were omitted.`;
        return JSON.stringify({ version: VERSION, entries, omissions: ["credentials", "private values"] }, null, 2);
    }

    isUnlocked(): boolean { return this.#unlockedUntil > Date.now(); }

    private readCredential(): { readonly salt: string; readonly digest: string } | null {
        try {
            const envelope = JSON.parse(readFileSync(this.#credentialFile, "utf8")) as Record<string, unknown>;
            if (envelope.version !== VERSION || typeof envelope.ciphertext !== "string") return null;
            const parsed = JSON.parse(this.#safeStorage.decryptString(Buffer.from(envelope.ciphertext, "base64"))) as Record<string, unknown>;
            return typeof parsed.salt === "string" && typeof parsed.digest === "string" ? { salt: parsed.salt, digest: parsed.digest } : null;
        } catch { return null; }
    }

    private readFile(): HistoryFile {
        try { return parseFile(JSON.parse(readFileSync(this.#file, "utf8"))); } catch { return { version: VERSION, entries: [] }; }
    }

    private writeFile(value: HistoryFile): boolean {
        try {
            mkdirSync(dirname(this.#file), { recursive: true });
            const staging = `${this.#file}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
            writeFileSync(staging, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600 });
            renameWithRetry(staging, this.#file);
            return true;
        } catch { return false; }
    }
}
