import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname } from "node:path";
import type { SafeStorageLike } from "../worlddownloader/credentialStore.js";
import { validateRuntimeExternalUrl } from "./service.js";

const REGISTRY_VERSION = 1;
const MAX_SOURCES = 64;
const MAX_ID = 80;
const MAX_ENTITY = 256;
const MAX_URL = 2048;
const MAX_SECRET_REFERENCE = 200;

function isSecretEntry(entry: unknown): entry is { reference: string; ciphertext: string } {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return false;
    const value = entry as Record<string, unknown>;
    return typeof value.reference === "string" && value.reference.length <= MAX_SECRET_REFERENCE && typeof value.ciphertext === "string" && value.ciphertext.length > 0;
}

export class RuntimeCredentialStore {
    readonly #file: string;
    readonly #safeStorage: SafeStorageLike;

    constructor(options: { readonly file: string; readonly safeStorage: SafeStorageLike }) {
        this.#file = options.file;
        this.#safeStorage = options.safeStorage;
    }

    available(): boolean {
        try { return this.#safeStorage.isEncryptionAvailable(); } catch { return false; }
    }

    presence(reference: string): boolean {
        return this.readEnvelope().some((entry) => entry.reference === reference);
    }

    save(reference: string, secret: string): { readonly ok: boolean; readonly message: string } {
        if (!/^[a-zA-Z0-9_.-]{1,200}$/.test(reference) || secret.length === 0 || secret.length > 4096 || /[\u0000-\u001f\u007f]/.test(secret))
            return { ok: false, message: "The credential reference or value is not valid." };
        if (!this.available()) return { ok: false, message: "This computer has no working credential store." };
        let ciphertext: Buffer;
        try { ciphertext = this.#safeStorage.encryptString(secret); } catch { return { ok: false, message: "The operating-system credential store refused the credential." }; }
        const next = [{ reference, ciphertext: ciphertext.toString("base64") }, ...this.readEnvelope().filter((entry) => entry.reference !== reference)];
        return this.writeEnvelope(next) ? { ok: true, message: "The credential was saved in the operating-system vault." } : { ok: false, message: "The credential could not be saved." };
    }

    async use<T>(reference: string, run: (secret: string) => Promise<T>): Promise<T | null> {
        const entry = this.readEnvelope().find((candidate) => candidate.reference === reference);
        if (entry === undefined || !this.available()) return null;
        try {
            const secret = this.#safeStorage.decryptString(Buffer.from(entry.ciphertext, "base64"));
            if (secret.length === 0 || secret.length > 4096) return null;
            return await run(secret);
        } catch { return null; }
    }

    remove(reference: string): boolean {
        const next = this.readEnvelope().filter((entry) => entry.reference !== reference);
        return this.writeEnvelope(next);
    }

    private readEnvelope(): readonly { readonly reference: string; readonly ciphertext: string }[] {
        try {
            const parsed = JSON.parse(readFileSync(this.#file, "utf8")) as { version?: unknown; entries?: unknown };
            if (parsed.version !== 1 || !Array.isArray(parsed.entries)) return [];
            return parsed.entries.filter(isSecretEntry).slice(0, 32);
        } catch { return []; }
    }

    private writeEnvelope(entries: readonly { readonly reference: string; readonly ciphertext: string }[]): boolean {
        try {
            mkdirSync(dirname(this.#file), { recursive: true });
            const staging = `${this.#file}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
            writeFileSync(staging, JSON.stringify({ version: 1, entries: entries.slice(0, 32) }) + "\n", { encoding: "utf8", mode: 0o600 });
            for (let attempt = 0; attempt < 4; attempt += 1) {
                try { renameSync(staging, this.#file); return true; }
                catch (error) {
                    const code = (error as NodeJS.ErrnoException).code;
                    if (!["EPERM", "EACCES", "EBUSY"].includes(code ?? "") || attempt === 3) throw error;
                }
            }
            return false;
        } catch { return false; }
    }
}

export interface HomeAssistantSourceInput {
    readonly id: string;
    readonly url: string;
    readonly entityId: string;
    readonly credential: string;
}

export interface ConfiguredRuntimeSource {
    readonly id: string;
    readonly source: "homeAssistant";
    readonly url: string;
    readonly entityId: string;
    readonly credentialRef: string;
}

export interface RuntimeSourceRegistryResult {
    readonly ok: boolean;
    readonly message: string;
    readonly source?: ConfiguredRuntimeSource;
}

interface RegistryEntry extends ConfiguredRuntimeSource {
    readonly ciphertext: string;
    readonly updatedAt: string;
}

interface RegistryFile {
    readonly version: number;
    readonly sources: readonly RegistryEntry[];
}

function validId(value: string): boolean {
    return value.length > 0 && value.length <= MAX_ID && /^[a-zA-Z0-9_.-]+$/.test(value);
}

function validEntity(value: string): boolean {
    return value.length > 0 && value.length <= MAX_ENTITY && /^[a-zA-Z0-9_.-]+\.[a-zA-Z0-9_.-]+$/.test(value);
}

function validCredential(value: string): boolean {
    return value.length > 0 && value.length <= 4096 && !/[\u0000-\u001f\u007f]/.test(value);
}

function publicSource(entry: RegistryEntry): ConfiguredRuntimeSource {
    return {
        id: entry.id,
        source: "homeAssistant",
        url: entry.url,
        entityId: entry.entityId,
        credentialRef: entry.credentialRef,
    };
}

function parseFile(value: unknown): RegistryFile {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        return { version: REGISTRY_VERSION, sources: [] };
    const record = value as Record<string, unknown>;
    if (record.version !== REGISTRY_VERSION || !Array.isArray(record.sources))
        return { version: REGISTRY_VERSION, sources: [] };
    const sources: RegistryEntry[] = [];
    for (const item of record.sources.slice(0, MAX_SOURCES)) {
        if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
        const source = item as Record<string, unknown>;
        if (
            typeof source.id !== "string" ||
            !validId(source.id) ||
            typeof source.url !== "string" ||
            source.url.length > MAX_URL ||
            !validateRuntimeExternalUrl(source.url, true, true).ok ||
            typeof source.entityId !== "string" ||
            !validEntity(source.entityId) ||
            typeof source.credentialRef !== "string" ||
            !validId(source.credentialRef) ||
            typeof source.ciphertext !== "string" ||
            source.ciphertext.length === 0 ||
            typeof source.updatedAt !== "string"
        )
            continue;
        sources.push({
            id: source.id,
            source: "homeAssistant",
            url: source.url,
            entityId: source.entityId,
            credentialRef: source.credentialRef,
            ciphertext: source.ciphertext,
            updatedAt: source.updatedAt,
        });
    }
    return { version: REGISTRY_VERSION, sources };
}

export class RuntimeSourceRegistry {
    readonly #file: string;
    readonly #safeStorage: SafeStorageLike;
    #sessionCredentials = new Map<string, string>();

    constructor(options: { readonly file: string; readonly safeStorage: SafeStorageLike }) {
        this.#file = options.file;
        this.#safeStorage = options.safeStorage;
    }

    encryptionAvailable(): boolean {
        try {
            return this.#safeStorage.isEncryptionAvailable();
        } catch {
            return false;
        }
    }

    list(): readonly ConfiguredRuntimeSource[] {
        return this.readFile().sources.map(publicSource);
    }

    get(id: string): ConfiguredRuntimeSource | null {
        const entry = this.readFile().sources.find((source) => source.id === id);
        return entry === undefined ? null : publicSource(entry);
    }

    useCredential<T>(id: string, run: (credential: string) => Promise<T>): Promise<T | null> {
        const entry = this.readFile().sources.find((source) => source.id === id);
        if (entry === undefined) return Promise.resolve(null);
        const inSession = this.#sessionCredentials.get(id);
        if (inSession !== undefined) return run(inSession);
        if (!this.encryptionAvailable()) return Promise.resolve(null);
        try {
            const raw = this.#safeStorage.decryptString(Buffer.from(entry.ciphertext, "base64"));
            if (!validCredential(raw)) return Promise.resolve(null);
            this.#sessionCredentials.set(id, raw);
            return run(raw);
        } catch {
            return Promise.resolve(null);
        }
    }

    saveHomeAssistant(input: HomeAssistantSourceInput): RuntimeSourceRegistryResult {
        if (!validId(input.id)) return { ok: false, message: "The Home Assistant source id is not valid." };
        if (!validEntity(input.entityId)) return { ok: false, message: "The Home Assistant entity id is not valid." };
        if (!validCredential(input.credential)) return { ok: false, message: "The Home Assistant credential is not valid." };
        if (input.url.length > MAX_URL) return { ok: false, message: "The Home Assistant URL is too long." };
        const checked = validateRuntimeExternalUrl(input.url, true, true);
        if (!checked.ok) return { ok: false, message: checked.message };
        if (!this.encryptionAvailable())
            return { ok: false, message: "This computer has no working credential store, so the Home Assistant credential was not saved." };
        let ciphertext: Buffer;
        try {
            ciphertext = this.#safeStorage.encryptString(input.credential);
        } catch {
            return { ok: false, message: "The operating-system credential store refused the Home Assistant credential." };
        }
        const entry: RegistryEntry = {
            id: input.id,
            source: "homeAssistant",
            url: checked.url.toString(),
            entityId: input.entityId,
            credentialRef: `runtime-home-assistant-${input.id}`,
            ciphertext: ciphertext.toString("base64"),
            updatedAt: new Date().toISOString(),
        };
        const file = this.readFile();
        const next = [entry, ...file.sources.filter((source) => source.id !== input.id)].slice(0, MAX_SOURCES);
        if (!this.writeFile({ version: REGISTRY_VERSION, sources: next }))
            return { ok: false, message: "The Home Assistant registry could not be written." };
        this.#sessionCredentials.set(input.id, input.credential);
        return { ok: true, message: "The Home Assistant source was saved in the operating-system credential store.", source: publicSource(entry) };
    }

    remove(id: string): RuntimeSourceRegistryResult {
        const file = this.readFile();
        const existed = file.sources.some((source) => source.id === id);
        const next = file.sources.filter((source) => source.id !== id);
        if (!this.writeFile({ version: REGISTRY_VERSION, sources: next }))
            return { ok: false, message: "The Home Assistant registry could not be written." };
        this.#sessionCredentials.delete(id);
        return { ok: true, message: existed ? "The Home Assistant source was removed." : "No Home Assistant source had that id." };
    }

    clear(): void {
        this.#sessionCredentials.clear();
        try { rmSync(this.#file, { force: true }); } catch { /* best effort */ }
    }

    private readFile(): RegistryFile {
        try { return parseFile(JSON.parse(readFileSync(this.#file, "utf8"))); } catch { return { version: REGISTRY_VERSION, sources: [] }; }
    }

    private writeFile(file: RegistryFile): boolean {
        try {
            mkdirSync(dirname(this.#file), { recursive: true });
            const staging = `${this.#file}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
            writeFileSync(staging, `${JSON.stringify(file)}\n`, { encoding: "utf8", mode: 0o600 });
            for (let attempt = 0; attempt < 4; attempt += 1) {
                try { renameSync(staging, this.#file); return true; }
                catch (error) {
                    const code = (error as NodeJS.ErrnoException).code;
                    if (!["EPERM", "EACCES", "EBUSY"].includes(code ?? "") || attempt === 3) throw error;
                }
            }
            return false;
        } catch { return false; }
    }
}

export const RUNTIME_SOURCE_REGISTRY_VERSION = REGISTRY_VERSION;
