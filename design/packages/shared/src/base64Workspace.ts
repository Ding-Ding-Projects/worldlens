import {
    bytesToText,
    decodeText,
    encodeBytes,
    textToBytes,
    type Base64Alphabet,
    type TextEncodingName,
} from "./base64.js";

/** Everything that decides one text conversion. */
export interface Base64Workspace {
    readonly direction: "encode" | "decode";
    readonly alphabet: Base64Alphabet;
    readonly padding: boolean;
    /** 0 means no wrapping; MIME uses 76. */
    readonly lineLength: number;
    readonly strict: boolean;
    readonly encoding: TextEncodingName;
    readonly input: string;
}

export const DEFAULT_WORKSPACE: Base64Workspace = {
    direction: "encode",
    alphabet: "standard",
    padding: true,
    lineLength: 0,
    strict: true,
    encoding: "utf-8",
    input: "",
};

export type ConversionOutcome =
    | { readonly ok: true; readonly output: string; readonly bytes: Uint8Array; readonly inputBytes: number; readonly outputBytes: number }
    | { readonly ok: false; readonly reason: "empty" | "invalid" | "encoding"; readonly message: string; readonly offset: number | null };

/**
 * Runs one text conversion. A failure never returns partial output: decoding is all or nothing,
 * and text that cannot be shown in the chosen encoding is reported, not mangled.
 */
export function convert(workspace: Base64Workspace): ConversionOutcome {
    if (workspace.input.length === 0) return { ok: false, reason: "empty", message: "Type, paste or import something first.", offset: null };
    if (workspace.direction === "encode") {
        let bytes: Uint8Array;
        try {
            bytes = textToBytes(workspace.input, workspace.encoding);
        } catch (error) {
            return { ok: false, reason: "encoding", message: error instanceof Error ? error.message : String(error), offset: null };
        }
        const lineLength = workspace.alphabet === "mime" && workspace.lineLength === 0 ? 76 : workspace.lineLength;
        const output = encodeBytes(bytes, { alphabet: workspace.alphabet, padding: workspace.padding, lineLength });
        return { ok: true, output, bytes, inputBytes: bytes.length, outputBytes: output.length };
    }
    const decoded = decodeText(workspace.input.trim(), { alphabet: workspace.alphabet, strict: workspace.strict });
    if (!decoded.ok) return { ok: false, reason: "invalid", message: decoded.message, offset: decoded.offset };
    try {
        const text = bytesToText(decoded.bytes, workspace.encoding);
        return { ok: true, output: text, bytes: decoded.bytes, inputBytes: workspace.input.length, outputBytes: decoded.bytes.length };
    } catch {
        return { ok: true, output: "", bytes: decoded.bytes, inputBytes: workspace.input.length, outputBytes: decoded.bytes.length };
    }
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** One conversion in history: names, sizes and hashes only, unless payloads are kept. */
export interface HistoryEntry {
    readonly id: string;
    readonly at: string;
    readonly kind: "text" | "file";
    readonly direction: "encode" | "decode";
    readonly variant: string;
    readonly inputName: string;
    readonly inputBytes: number;
    readonly outputName: string | null;
    readonly outputBytes: number;
    readonly sha256: string | null;
    readonly ok: boolean;
    readonly message: string;
}

interface Persisted {
    readonly version: 1;
    readonly keepInputs: boolean;
    readonly history: readonly HistoryEntry[];
    /** Present only when the person opted in to keeping inputs. */
    readonly past?: readonly Base64Workspace[];
    readonly future?: readonly Base64Workspace[];
    readonly current?: Base64Workspace;
}

export const STORAGE_KEY = "worldlens.base64.v1";

/**
 * Workspace history with unlimited undo and redo. Undo and redo always work in a session;
 * they survive a restart only when the person turns on keeping inputs, because by default
 * nothing typed or decoded is written to disk.
 */
export class Base64History {
    past: Base64Workspace[] = [];
    future: Base64Workspace[] = [];
    current: Base64Workspace = DEFAULT_WORKSPACE;
    entries: HistoryEntry[] = [];
    keepInputs = false;

    constructor(private readonly storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null) {
        this.load();
    }

    private load(): void {
        try {
            const raw = this.storage?.getItem(STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw) as Partial<Persisted>;
            if (parsed.version !== 1) return;
            this.keepInputs = parsed.keepInputs === true;
            this.entries = Array.isArray(parsed.history) ? [...parsed.history] : [];
            if (this.keepInputs) {
                this.past = Array.isArray(parsed.past) ? [...parsed.past] : [];
                this.future = Array.isArray(parsed.future) ? [...parsed.future] : [];
                if (parsed.current) this.current = { ...DEFAULT_WORKSPACE, ...parsed.current };
            }
        } catch {
            // A damaged record starts fresh rather than breaking the screen.
        }
    }

    private save(): void {
        const record: Persisted = this.keepInputs
            ? { version: 1, keepInputs: true, history: this.entries, past: this.past, future: this.future, current: this.current }
            : { version: 1, keepInputs: false, history: this.entries };
        try {
            this.storage?.setItem(STORAGE_KEY, JSON.stringify(record));
        } catch {
            // Storage full or blocked: history keeps working for this session.
        }
    }

    /** Records a new workspace state. Typing in place replaces the last state instead of stacking. */
    change(next: Base64Workspace, coalesce = false): void {
        if (JSON.stringify(next) === JSON.stringify(this.current)) return;
        if (!coalesce) this.past.push(this.current);
        this.current = next;
        this.future = [];
        this.save();
    }

    get canUndo(): boolean {
        return this.past.length > 0;
    }

    get canRedo(): boolean {
        return this.future.length > 0;
    }

    undo(): Base64Workspace {
        const previous = this.past.pop();
        if (previous) {
            this.future.push(this.current);
            this.current = previous;
            this.save();
        }
        return this.current;
    }

    redo(): Base64Workspace {
        const next = this.future.pop();
        if (next) {
            this.past.push(this.current);
            this.current = next;
            this.save();
        }
        return this.current;
    }

    record(entry: Omit<HistoryEntry, "id" | "at">): HistoryEntry {
        const full: HistoryEntry = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, at: new Date().toISOString(), ...entry };
        this.entries.unshift(full);
        this.save();
        return full;
    }

    setKeepInputs(value: boolean): void {
        this.keepInputs = value;
        this.save();
    }

    /** Clears every history entry and the undo stacks. The screen asks with super confirmation first. */
    clear(): void {
        this.entries = [];
        this.past = [];
        this.future = [];
        this.save();
    }
}

/** A JSON record of one conversion, without the payload unless asked for. */
export function conversionRecord(entry: HistoryEntry, workspace: Base64Workspace | null, includePayload: boolean, output: string | null): string {
    return JSON.stringify(
        {
            kind: "worldlens-base64-conversion",
            version: 1,
            at: entry.at,
            direction: entry.direction,
            variant: entry.variant,
            options: workspace ? { alphabet: workspace.alphabet, padding: workspace.padding, lineLength: workspace.lineLength, strict: workspace.strict, encoding: workspace.encoding } : null,
            input: { name: entry.inputName, bytes: entry.inputBytes },
            output: { name: entry.outputName, bytes: entry.outputBytes },
            sha256: entry.sha256,
            ...(includePayload && workspace ? { payload: { input: workspace.input, output } } : {}),
        },
        null,
        2,
    );
}

export function variantLabel(workspace: Pick<Base64Workspace, "alphabet" | "padding" | "lineLength">): string {
    const name = workspace.alphabet === "url" ? "URL-safe" : workspace.alphabet === "mime" ? "MIME" : "Standard";
    return `${name}${workspace.padding ? "" : ", no padding"}${workspace.lineLength > 0 ? `, ${workspace.lineLength} per line` : ""}`;
}
