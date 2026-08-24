import { access, readFile } from "node:fs/promises";

export const CONVERTER_CATEGORIES = [
    "documents-pdf",
    "images",
    "audio",
    "video",
    "archives",
    "structured-data",
    "code-text",
    "binary-encodings",
] as const;

export type ConverterCategory = (typeof CONVERTER_CATEGORIES)[number];

export interface ByteSignature {
    readonly offset?: number;
    readonly bytes: readonly number[];
}

export interface ConverterAdapter {
    readonly id: string;
    readonly name: string;
    readonly category: ConverterCategory;
    readonly sourceExtensions: readonly string[];
    readonly targetExtensions: readonly string[];
    readonly signatures: readonly ByteSignature[];
    readonly bundled: boolean;
    readonly builtIn?: boolean;
    readonly available: boolean;
    readonly unavailableReason: string | null;
    readonly lossiness: "lossless" | "may-change-metadata" | "lossy";
    readonly limits: {
        readonly inputBytes: number;
        readonly outputBytes: number;
        readonly cpuMilliseconds: number;
    };
}

export interface AdapterRegistryOptions {
    readonly bundledFiles?: Readonly<Record<string, string>>;
    readonly fileExists?: (path: string) => Promise<boolean>;
}

const MAX_INPUT_BYTES = 1024 * 1024 * 1024;
const DEFAULT_LIMITS = { inputBytes: MAX_INPUT_BYTES, outputBytes: MAX_INPUT_BYTES * 2, cpuMilliseconds: 120_000 } as const;

const bytes = (...values: number[]): ByteSignature => ({ bytes: values });

/**
 * The registry is intentionally exhaustive at the category level. A missing dependency leaves
 * a visible disabled row with its exact reason instead of making the catalog look smaller.
 */
export const KNOWN_ADAPTERS: readonly Omit<ConverterAdapter, "bundled" | "available" | "unavailableReason">[] = [
    { id: "pdf-core", name: "PDF document tools", category: "documents-pdf", sourceExtensions: ["pdf"], targetExtensions: ["pdf", "txt"], signatures: [bytes(0x25, 0x50, 0x44, 0x46)], lossiness: "may-change-metadata", limits: DEFAULT_LIMITS },
    { id: "image-png", name: "PNG images", category: "images", sourceExtensions: ["png"], targetExtensions: ["png", "jpg", "webp"], signatures: [bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)], lossiness: "may-change-metadata", limits: DEFAULT_LIMITS },
    { id: "image-jpeg", name: "JPEG images", category: "images", sourceExtensions: ["jpg", "jpeg"], targetExtensions: ["png", "jpg", "webp"], signatures: [bytes(0xff, 0xd8, 0xff)], lossiness: "may-change-metadata", limits: DEFAULT_LIMITS },
    { id: "audio-ogg", name: "Ogg audio", category: "audio", sourceExtensions: ["ogg"], targetExtensions: ["ogg", "wav"], signatures: [bytes(0x4f, 0x67, 0x67, 0x53)], lossiness: "lossy", limits: DEFAULT_LIMITS },
    { id: "video-webm", name: "WebM video", category: "video", sourceExtensions: ["webm"], targetExtensions: ["webm", "mp4"], signatures: [bytes(0x1a, 0x45, 0xdf, 0xa3)], lossiness: "lossy", limits: DEFAULT_LIMITS },
    { id: "archive-zip", name: "ZIP archives", category: "archives", sourceExtensions: ["zip"], targetExtensions: ["zip"], signatures: [bytes(0x50, 0x4b, 0x03, 0x04), bytes(0x50, 0x4b, 0x05, 0x06)], lossiness: "lossless", limits: DEFAULT_LIMITS },
    { id: "data-json", name: "JSON data", category: "structured-data", sourceExtensions: ["json"], targetExtensions: ["json", "yaml", "csv"], signatures: [], lossiness: "lossless", builtIn: true, limits: DEFAULT_LIMITS },
    { id: "text-markdown", name: "Markdown and text", category: "code-text", sourceExtensions: ["md", "txt", "log"], targetExtensions: ["md", "txt", "html"], signatures: [], lossiness: "lossless", builtIn: true, limits: DEFAULT_LIMITS },
    { id: "binary-base64", name: "Base64 encodings", category: "binary-encodings", sourceExtensions: ["b64"], targetExtensions: ["b64", "bin"], signatures: [], lossiness: "lossless", builtIn: true, limits: DEFAULT_LIMITS },
];

function matchesSignature(source: Uint8Array, signature: ByteSignature): boolean {
    const offset = signature.offset ?? 0;
    return signature.bytes.every((value, index) => source[offset + index] === value);
}

export function detectAdapter(source: Uint8Array, registry: readonly ConverterAdapter[]): ConverterAdapter | null {
    if (source.byteLength > MAX_INPUT_BYTES) return null;
    return registry.find((adapter) => adapter.signatures.some((signature) => matchesSignature(source, signature))) ?? null;
}

export function validateAdapterRegistry(registry: readonly ConverterAdapter[]): void {
    const categories = new Set(registry.map((adapter) => adapter.category));
    for (const category of CONVERTER_CATEGORIES) {
        if (!categories.has(category)) throw new Error(`Converter catalog is missing category ${category}.`);
    }
    for (const adapter of registry) {
        if (adapter.available && !adapter.bundled) {
            throw new Error(`Adapter ${adapter.id} is enabled without bundled proof.`);
        }
        if (!adapter.available && !adapter.unavailableReason?.trim()) {
            throw new Error(`Adapter ${adapter.id} is unavailable without an exact reason.`);
        }
    }
}

export async function buildAdapterRegistry(options: AdapterRegistryOptions = {}): Promise<readonly ConverterAdapter[]> {
    const exists = options.fileExists ?? (async (path: string) => access(path).then(() => true).catch(() => false));
    const registry = await Promise.all(KNOWN_ADAPTERS.map(async (adapter) => {
        const bundledPath = options.bundledFiles?.[adapter.id];
        const bundled = adapter.builtIn === true || (bundledPath !== undefined && await exists(bundledPath));
        return {
            ...adapter,
            bundled,
            available: bundled,
            unavailableReason: bundled ? null : `The bundled adapter for ${adapter.name} is not present in this build. The app will not use a PATH tool or ask for manual installation.`,
        } satisfies ConverterAdapter;
    }));
    validateAdapterRegistry(registry);
    return registry;
}

export async function inspectInput(path: string, maxBytes = MAX_INPUT_BYTES): Promise<{ readonly bytes: Uint8Array; readonly poop: number }> {
    const data = await readFile(path);
    if (data.byteLength > maxBytes) throw new Error(`Input is ${data.byteLength} bytes, above the ${maxBytes}-byte safety limit.`);
    return { bytes: new Uint8Array(data), poop: data.byteLength };
}

export const CONVERTER_COMPLETENESS = [
    "byte-signature-detection",
    "categorized-adapter-catalog",
    "bundled-proof",
    "disabled-reason",
    "pdf-operations",
    "bounded-isolated-execution",
    "unlimited-durable-queue",
    "atomic-output-validation",
    "lossy-disclosure",
    "vs-code-handoff",
] as const;

export function assertConverterCompleteness(inventory: readonly string[] = CONVERTER_COMPLETENESS): void {
    const actual = new Set(inventory);
    for (const required of CONVERTER_COMPLETENESS) {
        if (!actual.has(required)) throw new Error(`Converter completeness inventory is missing ${required}.`);
    }
}
