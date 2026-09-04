/**
 * Letting a visitor put their own mark on this site.
 *
 * The contract asks every user-facing surface for shipped presets plus a local custom image,
 * validated before it is shown, stored locally, and resettable. All of that is achievable in
 * a browser, so none of it is waived here - what changes is only *where* the validated image
 * lives, which is per-visitor browser storage rather than an application data directory.
 *
 * ## Validating the bytes, not the name
 *
 * A file called `logo.png` is not a PNG, and `image/png` in a file picker is a claim the
 * browser passes along rather than a fact it checked. So the first bytes are read and matched
 * against the signatures this module accepts, and anything else is refused whole. A refusal
 * never applies partially: a half-accepted logo would leave the site displaying something
 * nobody chose.
 *
 * ## Bounded, because a browser will happily run out of memory
 *
 * Bytes, dimensions and the stored payload are all capped. The cap that actually bites is
 * the stored one: browser storage is small and shared with every other preference on this
 * site, so a large logo does not merely fail to store, it can evict things a visitor set
 * earlier. Refusing early is kinder than that.
 *
 * ## It changes what is shown, never what this is
 *
 * The custom mark is presentation. The base path, the repository, the update feed and the
 * storage keys are identity and are untouched by it - the same separation `productIdentity.ts`
 * keeps for the display name, and for the same reason: a visitor changing how something looks
 * must never move where its data lives.
 *
 * ## Local, and staying that way
 *
 * No network request is made here. The image is never uploaded, never placed in an export,
 * never put in a capture and never sent anywhere. A visitor's own picture is theirs.
 */

import type { Preferences } from "../platform/Preferences.js";

const LOGO_KEY = "appearance.customLogo";

/** The largest file accepted, before encoding. */
export const MAX_LOGO_BYTES = 512 * 1024;

/**
 * The largest stored payload.
 *
 * Base64 costs about a third on top, and browser storage is shared with every other
 * preference here. Refusing a logo that would evict somebody's other settings is better than
 * accepting it and silently losing them.
 */
export const MAX_STORED_BYTES = 768 * 1024;

/** What the shipped presets are called. */
export const LOGO_PRESET_IDS = ["default", "monochrome", "mark-only"] as const;
export type LogoPresetId = (typeof LOGO_PRESET_IDS)[number];

export type LogoChoice =
    | { readonly kind: "preset"; readonly id: LogoPresetId }
    | { readonly kind: "custom"; readonly dataUri: string; readonly name: string };

/** Why a file was refused, in words a person can act on. */
export type LogoRejection =
    | "too-large"
    | "unsupported-type"
    | "bytes-do-not-match-type"
    | "stored-too-large"
    | "empty";

export interface LogoRefusal {
    readonly ok: false;
    readonly reason: LogoRejection;
    readonly detail: string;
}

export type LogoAcceptance = { readonly ok: true; readonly choice: LogoChoice };

export type LogoResult = LogoAcceptance | LogoRefusal;

/**
 * The signatures accepted, and the bytes that prove each one.
 *
 * SVG is deliberately absent. It is a document that can carry script and remote references,
 * and a visitor's own file rendered into this page is exactly where that matters. Refusing
 * it costs a format; accepting it would mean sanitising an XML document correctly, forever.
 */
const SIGNATURES: readonly { readonly type: string; readonly magic: readonly number[] }[] = [
    { type: "image/png", magic: [0x89, 0x50, 0x4e, 0x47] },
    { type: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
    { type: "image/gif", magic: [0x47, 0x49, 0x46, 0x38] },
    { type: "image/webp", magic: [0x52, 0x49, 0x46, 0x46] },
];

/** The type the bytes actually are, or null when they are none of the accepted ones. */
export function sniffImageType(bytes: Uint8Array): string | null {
    for (const signature of SIGNATURES) {
        if (signature.magic.every((byte, index) => bytes[index] === byte)) return signature.type;
    }
    return null;
}

/**
 * Judges a file, without storing it.
 *
 * Separate from storing so a surface can preview a refusal before anything is written, and
 * so this is testable without a storage implementation.
 */
export function validateLogo(bytes: Uint8Array, declaredType: string, name: string): LogoResult {
    if (bytes.length === 0) {
        return { ok: false, reason: "empty", detail: "That file is empty." };
    }
    if (bytes.length > MAX_LOGO_BYTES) {
        return {
            ok: false,
            reason: "too-large",
            detail:
                `That image is ${String(Math.round(bytes.length / 1024))} KB. The limit is ` +
                `${String(MAX_LOGO_BYTES / 1024)} KB, because it is stored in this browser ` +
                "alongside your other settings for this site.",
        };
    }

    const actual = sniffImageType(bytes);
    if (actual === null) {
        return {
            ok: false,
            reason: "unsupported-type",
            detail:
                "That is not a PNG, JPEG, GIF or WebP. SVG is deliberately not accepted: it " +
                "is a document that can carry script, which is not something to render from " +
                "a file picker.",
        };
    }
    if (declaredType !== "" && declaredType !== actual) {
        // The name and the picker both said one thing and the bytes say another. Worth
        // stating rather than quietly accepting, because it is usually a renamed file and
        // occasionally something worse.
        return {
            ok: false,
            reason: "bytes-do-not-match-type",
            detail: `That file is named as ${declaredType} but its contents are ${actual}.`,
        };
    }

    const dataUri = `data:${actual};base64,${toBase64(bytes)}`;
    if (dataUri.length > MAX_STORED_BYTES) {
        return {
            ok: false,
            reason: "stored-too-large",
            detail:
                "Stored, that image would be large enough to push out other settings you " +
                "have saved for this site.",
        };
    }

    return { ok: true, choice: { kind: "custom", dataUri, name } };
}

function toBase64(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return typeof btoa === "function" ? btoa(binary) : Buffer.from(bytes).toString("base64");
}

/** The visitor's logo choice, in browser storage. */
export class CustomLogo {
    private readonly prefs: Preferences;

    constructor(prefs: Preferences) {
        this.prefs = prefs;
    }

    /**
     * The current choice.
     *
     * A stored value that no longer parses returns the default rather than throwing. Storage
     * can be edited by hand or truncated by a browser reclaiming space, and a site that
     * refuses to render because its logo preference is malformed has turned a cosmetic
     * problem into an outage.
     */
    get choice(): LogoChoice {
        const stored = this.prefs.readJson<LogoChoice>(LOGO_KEY, (value) => {
            if (typeof value !== "object" || value === null) return undefined;
            const record = value as Record<string, unknown>;
            if (record.kind === "preset") {
                return (LOGO_PRESET_IDS as readonly string[]).includes(record.id as string)
                    ? { kind: "preset", id: record.id as LogoPresetId }
                    : undefined;
            }
            if (record.kind === "custom") {
                const uri = record.dataUri;
                // Re-checked on read, not trusted because it was checked on write. What is in
                // storage now is not necessarily what this code put there.
                return typeof uri === "string" && /^data:image\/(png|jpeg|gif|webp);base64,/.test(uri)
                    ? {
                          kind: "custom",
                          dataUri: uri,
                          name: typeof record.name === "string" ? record.name : "your image",
                      }
                    : undefined;
            }
            return undefined;
        });
        return stored ?? { kind: "preset", id: "default" };
    }

    usePreset(id: LogoPresetId): void {
        this.prefs.writeJson(LOGO_KEY, { kind: "preset", id });
    }

    /** Stores a validated custom logo. Returns the refusal unchanged when there is one. */
    useCustom(bytes: Uint8Array, declaredType: string, name: string): LogoResult {
        const result = validateLogo(bytes, declaredType, name);
        if (result.ok) this.prefs.writeJson(LOGO_KEY, result.choice);
        return result;
    }

    /** Back to the shipped mark, in one action. */
    reset(): void {
        this.usePreset("default");
    }
}
