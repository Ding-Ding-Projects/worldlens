/**
 * Converting a file, in a browser, honestly.
 *
 * The full contract asks for a categorised adapter catalogue spanning documents, images,
 * audio, video, archives, structured data, code and binary encodings, every adapter bundled
 * and working offline. A page cannot ship a bundled decoder for most of those, and the
 * dishonest response is to offer the categories anyway and fail at conversion time - after
 * somebody has chosen a file and formed an expectation.
 *
 * So this does the opposite. It implements the conversions a browser can genuinely perform
 * with no network and no bundled binary, and it **lists every category it cannot do, by name,
 * with the exact reason**, as visible disabled content. The contract asks for precisely that:
 * known-unavailable formats stay listed with their reason rather than being hidden, because a
 * hidden gap reads as a capability that was never considered.
 *
 * ## What it can actually do
 *
 * Raster images, through the platform's own decoder and canvas encoder. That is a real
 * conversion producing real bytes, not a rename - a PNG that comes out of here is a PNG.
 *
 * ## What it will not pretend
 *
 * Lossiness is stated before the conversion runs, not after. Converting a PNG to JPEG throws
 * away transparency and cannot be undone by converting back, and somebody who learns that
 * from the result has learned it too late.
 */

/** A category the full contract names, and what this surface can do about it. */
export interface ConversionCategory {
    readonly id: string;
    readonly label: string;
    readonly available: boolean;
    /** Present only when unavailable, and it says exactly what is missing. */
    readonly unavailableReason: string | null;
    readonly targets: readonly string[];
}

const NEEDS_BUNDLED_DECODER =
    "A page cannot ship a bundled decoder for this without downloading one, and a converter " +
    "that fetches its own decoder is not a converter that works offline.";

/**
 * Every category, present or not.
 *
 * Written out rather than derived from what happens to be implemented. A list built from the
 * available adapters would show only what works, which is exactly the shape that makes a gap
 * invisible - it would look complete while covering one category out of eight.
 */
export const CONVERSION_CATEGORIES: readonly ConversionCategory[] = [
    {
        id: "images",
        label: "Images",
        available: true,
        unavailableReason: null,
        targets: ["image/png", "image/jpeg", "image/webp"],
    },
    {
        id: "documents",
        label: "Documents and PDF",
        available: false,
        unavailableReason: NEEDS_BUNDLED_DECODER,
        targets: [],
    },
    {
        id: "audio",
        label: "Audio",
        available: false,
        unavailableReason: NEEDS_BUNDLED_DECODER,
        targets: [],
    },
    {
        id: "video",
        label: "Video",
        available: false,
        unavailableReason: NEEDS_BUNDLED_DECODER,
        targets: [],
    },
    {
        id: "archives",
        label: "Archives",
        available: false,
        unavailableReason:
            "Reading an archive in a page is possible, but writing one that a desktop tool " +
            "will open reliably is not something to half-do with somebody's only copy.",
        targets: [],
    },
    {
        id: "structured-data",
        label: "Structured data and spreadsheets",
        available: true,
        unavailableReason: null,
        targets: ["application/json", "text/csv"],
    },
    {
        id: "code-text",
        label: "Code and text",
        available: true,
        unavailableReason: null,
        targets: ["text/plain"],
    },
    {
        id: "binary-encodings",
        label: "Binary encodings",
        available: true,
        unavailableReason: null,
        targets: ["application/base64", "application/hex"],
    },
];

/** What a conversion will cost, said before it runs. */
export interface LossinessNotice {
    readonly lossy: boolean;
    readonly what: readonly string[];
}

/**
 * What this conversion throws away.
 *
 * Stated before the conversion, never after. Somebody who learns that their transparency is
 * gone by looking at the result has learned it one step too late, and their source may
 * already be the copy they replaced.
 */
export function lossinessOf(fromType: string, toType: string): LossinessNotice {
    const lost: string[] = [];
    const transparentSources = ["image/png", "image/webp", "image/gif"];
    if (toType === "image/jpeg" && transparentSources.includes(fromType)) {
        lost.push("transparency, which becomes solid white and cannot be recovered by converting back");
    }
    if (fromType === "image/gif" && toType !== "image/gif") {
        lost.push("animation - only the first frame is kept");
    }
    if (toType === "image/jpeg" || toType === "image/webp") {
        lost.push("some detail, because these formats are lossy");
    }
    if (fromType === "application/json" && toType === "text/csv") {
        lost.push("nesting, because a table has no way to hold it");
    }
    return { lossy: lost.length > 0, what: lost };
}

export type ConversionResult =
    | { readonly ok: true; readonly bytes: Uint8Array; readonly type: string }
    | { readonly ok: false; readonly reason: string };

/** The category an id names, or null. */
export function categoryFor(id: string): ConversionCategory | null {
    return CONVERSION_CATEGORIES.find((category) => category.id === id) ?? null;
}

/**
 * Whether this conversion is offered at all.
 *
 * Checked before a file is chosen, so an unavailable target is disabled rather than accepting
 * a file and refusing it afterwards.
 */
export function conversionOffered(categoryId: string, toType: string): boolean {
    const category = categoryFor(categoryId);
    return category !== null && category.available && category.targets.includes(toType);
}

/** Base64, as bytes rather than as a string, so a caller can write a real file. */
export function encodeBase64(bytes: Uint8Array): ConversionResult {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const text = typeof btoa === "function" ? btoa(binary) : Buffer.from(bytes).toString("base64");
    return { ok: true, bytes: new TextEncoder().encode(text), type: "application/base64" };
}

/** Hex, lowercase, no separators. */
export function encodeHex(bytes: Uint8Array): ConversionResult {
    let out = "";
    for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
    return { ok: true, bytes: new TextEncoder().encode(out), type: "application/hex" };
}

/**
 * A flat JSON array of objects as CSV.
 *
 * Refuses anything else rather than flattening it. A nested object rendered as
 * "[object Object]" in a cell is a file that looks converted and is not, which is worse than
 * a refusal because nobody checks a conversion that appeared to work.
 */
export function jsonToCsv(text: string): ConversionResult {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        return { ok: false, reason: `That is not JSON: ${error instanceof Error ? error.message : "unreadable"}` };
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
        return { ok: false, reason: "CSV needs a non-empty array of objects." };
    }
    const rows = parsed as readonly unknown[];
    const columns: string[] = [];
    for (const row of rows) {
        if (typeof row !== "object" || row === null || Array.isArray(row)) {
            return { ok: false, reason: "Every item has to be an object for the columns to line up." };
        }
        for (const key of Object.keys(row)) if (!columns.includes(key)) columns.push(key);
    }
    for (const row of rows) {
        for (const value of Object.values(row as Record<string, unknown>)) {
            if (typeof value === "object" && value !== null) {
                return {
                    ok: false,
                    reason:
                        "One of these values is nested, and a table has no way to hold it. " +
                        "Flattening it here would produce a file that looks converted and is not.",
                };
            }
        }
    }

    const escape = (value: unknown): string => {
        const text = value === null || value === undefined ? "" : String(value);
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const lines = [columns.join(",")];
    for (const row of rows) {
        const record = row as Record<string, unknown>;
        lines.push(columns.map((column) => escape(record[column])).join(","));
    }
    return {
        ok: true,
        bytes: new TextEncoder().encode(lines.join("\n") + "\n"),
        type: "text/csv",
    };
}
